import type { BotContext } from "../bot";
import { prisma } from "../infra/prisma";
import { parseTipCommand, parsePayCommand } from "../core/parse";
import { resolveToken } from "../core/tokens";
import { calculateFee, generateFeeConfirmationMessage } from "../core/fees";
import { executeTransfer } from "../core/transfer";
import { formatReceipt } from "../core/receipts";
import { checkRateLimit } from "../core/ratelimit";
import { generateClientIntentId } from "../core/idempotency";
import { logger } from "../infra/logger";
import { v4 as uuidv4 } from "uuid";
import util from 'util';

// Helper function to resolve username to user ID (for the robust tip handler)
async function resolveUsername(username: string): Promise<string | null> {
  const cleanUsername = username.startsWith('@') ? username.slice(1).toLowerCase() : username.toLowerCase();
  const user = await prisma.user.findFirst({
    where: { 
      handle: { 
        equals: cleanUsername, 
        mode: 'insensitive' 
      } 
    }
  });
  return user?.telegramId || null;
}

export async function commandTip(ctx: BotContext) {
  const chat = ctx.chat;
  if (!chat) {
    return ctx.reply("❌ Could not identify chat.");
  }

  const isGroupChat = chat.type !== "private";
  
  // ROBUST LOGGING - Prove reply exists (from troubleshooting guide)
  const u = ctx.update as any;
  console.log('TIP RAW:', util.inspect(u, { depth: 6, colors: true }));
  const msg = u.message || u.edited_message;
  console.log('HAS reply_to_message?', !!msg?.reply_to_message);
  
  // Additional detailed logging
  console.log("=== TIP COMMAND DEBUG START ===");
  console.log("Chat ID:", chat.id);
  console.log("Chat type:", chat.type);
  console.log("Is group chat:", isGroupChat);
  console.log("Message exists:", !!ctx.message);
  console.log("Message text:", ctx.message?.text);
  console.log("Message ID:", ctx.message?.message_id);
  console.log("Reply to message exists:", !!ctx.message?.reply_to_message);
  console.log("Reply to message ID:", ctx.message?.reply_to_message?.message_id);
  console.log("Reply to user ID:", ctx.message?.reply_to_message?.from?.id);
  console.log("Reply to username:", ctx.message?.reply_to_message?.from?.username);
  console.log("From user ID:", ctx.from?.id);
  console.log("From username:", ctx.from?.username);
  
  // Check different possible locations for reply data
  console.log("UPDATE STRUCTURE ANALYSIS:");
  console.log("- ctx.update.message?.reply_to_message:", !!ctx.update.message?.reply_to_message);
  console.log("- ctx.message.reply_to_message:", !!ctx.message?.reply_to_message);
  console.log("- ctx.msg?.reply_to_message:", !!(ctx as any).msg?.reply_to_message);
  console.log("- ctx.update:", Object.keys(ctx.update));
  console.log("- ctx.message keys:", ctx.message ? Object.keys(ctx.message) : 'no message');
  
  console.log("FULL CTX.UPDATE:", JSON.stringify(ctx.update, null, 2));
  console.log("FULL CTX.MESSAGE:", JSON.stringify(ctx.message, null, 2));
  console.log("=== TIP COMMAND DEBUG END ===");
  
  logger.info("Tip command received");

  // ROBUST TIP HANDLER - Tolerant to reply OR mention (from troubleshooting guide)
  if (!msg) return;

  const text: string = msg.text || '';
  const parts = text.trim().split(/\s+/);
  parts.shift(); // remove /tip

  // Try reply first (most reliable) - check multiple paths as suggested in guide
  const reply = msg.reply_to_message
             || (msg.message && msg.message.reply_to_message)
             || (ctx as any).msg?.reply_to_message;

  // Extract inline mention if present
  const entities = msg.entities || [];
  const textMention = entities.find((e: any) => e.type === 'text_mention');
  const mentionUser = textMention?.user;

  // Parse @username form if given
  let explicitMention = parts[0]?.startsWith('@') ? parts.shift() : undefined;

  // Amount + token
  let amountStr = parts.shift();
  let tokenTicker = (parts.shift() || 'SOL').toUpperCase();

  const amount = Number(amountStr);
  if (!amount || amount <= 0) {
    return ctx.reply('❌ Amount missing/invalid. Example: *reply* then `/tip 0.1 SOL` or `/tip @username 0.1 SOL`', { parse_mode: 'Markdown' });
  }

  // Resolve recipient
  let target = reply?.from || mentionUser;
  if (!target && explicitMention) {
    // Your lookup → username -> telegram_id (only works if they started your bot)
    const userId = await resolveUsername(explicitMention);
    if (userId) target = { id: userId, username: explicitMention.slice(1) };
  }

  if (!target) {
    return ctx.reply('❌ Reply to the user OR use `/tip @username <amount> [TOKEN]`.\nIf they\'ve never started the bot, ask them to DM me once.', { parse_mode: 'Markdown' });
  }

  if (target.id === ctx.from?.id) {
    return ctx.reply("❌ Cannot tip yourself!");
  }

  try {
    // Check if group chat is whitelisted and tipping enabled (skip for DMs)
    const chatRecord = isGroupChat ? await prisma.chat.findUnique({
      where: { chatId: chat.id.toString() }
    }) : null;

    if (isGroupChat && (!chatRecord?.whitelisted || !chatRecord.tipping)) {
      return ctx.reply("❌ Tipping not enabled in this chat.");
    }

    // Rate limiting
    const rateLimitKey = `${chat.id}:${ctx.from?.id}`;
    if (!checkRateLimit(rateLimitKey)) {
      return ctx.reply("⏰ Rate limit exceeded. Please wait.");
    }

    // Set the recipient values for the rest of the function
    const payeeId = target.id.toString();
    const payeeHandle = target.username?.toLowerCase();

    // Use default token if not specified (use chat default for groups, USDC for DMs)
    const finalTokenTicker = tokenTicker || chatRecord?.defaultTicker || "USDC";
    const token = await resolveToken(finalTokenTicker);
    if (!token) {
      return ctx.reply(`❌ Unknown token: ${finalTokenTicker}`);
    }

    // Convert amount to raw units
    const amountRaw = BigInt(Math.floor(amount * (10 ** token.decimals)));
    if (amountRaw <= 0n) {
      return ctx.reply("❌ Amount must be positive.");
    }

    // Get tipper wallet
    const tipperId = ctx.from?.id.toString();
    if (!tipperId) {
      return ctx.reply("❌ Could not identify sender.");
    }

    const tipper = await prisma.user.findUnique({
      where: { telegramId: tipperId },
      include: { wallets: { where: { isActive: true } } }
    });

    if (!tipper || !tipper.wallets[0]) {
      return ctx.reply("❌ You need to create a wallet first. DM me with /start.");
    }

    const tipperWallet = tipper.wallets[0];

    // Calculate fees with flexible service fee system
    const feeCalc = await calculateFee(amountRaw, token.mint);
    const feeRaw = feeCalc.feeRaw;
    const serviceFeeRaw = feeCalc.serviceFeeRaw;
    const serviceFeeToken = feeCalc.serviceFeeToken;
    const netRaw = feeCalc.netRaw;

    // Username verification: Find user by verified handle (especially for DMs)
    let payee: any = null;
    let payeeWallet: any = null;

    if (payeeHandle) {
      // Look up user by their actual Telegram handle (case-insensitive like Telegram)
      const payeeResult = await prisma.user.findFirst({
        where: { 
          handle: {
            equals: payeeHandle,
            mode: 'insensitive' // Case-insensitive matching like Telegram
          }
        },
        include: { wallets: { where: { isActive: true } } }
      });

      if (!payeeResult) {
        return ctx.reply(`❌ User @${payeeHandle} not found. They need to start the bot to register their Telegram username.`);
      }

      // Strict verification: the handle must exactly match their registered Telegram username
      if (payeeResult.handle?.toLowerCase() !== payeeHandle.toLowerCase()) {
        return ctx.reply(`❌ Username verification failed. This user's verified handle is @${payeeResult.handle}.`);
      }

      payee = payeeResult;
      payeeWallet = payee.wallets[0];
      if (!payeeWallet) {
        return ctx.reply(`❌ User @${payeeHandle} needs to create a wallet first.`);
      }
    } else if (payeeId) {
      // Fallback for group tips where we have user ID but no handle
      const payeeResult = await prisma.user.findUnique({
        where: { telegramId: payeeId },
        include: { wallets: { where: { isActive: true } } }
      });

      if (!payeeResult || !payeeResult.wallets[0]) {
        return ctx.reply(`❌ User needs to create a wallet first.`);
      }
      payee = payeeResult;
      payeeWallet = payee.wallets[0];
    } else {
      return ctx.reply("❌ Could not identify tip recipient.");
    }

    // Generate payment ID
    const paymentId = uuidv4();
    const clientIntentId = generateClientIntentId(tipperId, paymentId);

    // Create payment record
    await prisma.payment.create({
      data: {
        id: paymentId,
        clientIntentId,
        chatId: chat.id.toString(),
        fromUserId: tipper.id,
        toUserId: payee.id,
        fromWallet: tipperWallet.address,
        toWallet: payeeWallet.address,
        mint: token.mint,
        amountRaw: amountRaw.toString(),
        feeRaw: feeRaw.toString(),
        note: "tip",
        status: "pending"
      }
    });

    // Execute transfer with flexible service fee
    const result = await executeTransfer({
      fromWallet: tipperWallet,
      toAddress: payeeWallet.address,
      mint: token.mint,
      amountRaw: netRaw,
      feeRaw,
      serviceFeeRaw,
      serviceFeeToken,
      token
    });

    if (result.success) {
      // Update payment status
      await prisma.payment.update({
        where: { id: paymentId },
        data: { 
          status: "sent",
          txSig: result.signature
        }
      });

      // Send confirmation with tip emoji
      const receipt = `✨ **Tip Sent**

**To:** @${payeeHandle || 'user'}
**Amount:** ${amount} ${token.ticker}

[View Transaction](https://explorer.solana.com/tx/${result.signature}?cluster=devnet)`;

      await ctx.reply(receipt, { parse_mode: "Markdown" });

      logger.info(`Tip sent: ${paymentId}, tx: ${result.signature}`);
    } else {
      await ctx.reply(`❌ Tip failed: ${result.error}`);
    }

  } catch (error) {
    logger.error("Tip command error:", error);
    await ctx.reply("❌ Tip failed. Please try again.");
  }
}
