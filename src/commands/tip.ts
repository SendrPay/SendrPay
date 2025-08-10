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

export async function commandTip(ctx: BotContext) {
  const chat = ctx.chat;
  if (!chat) {
    return ctx.reply("❌ Could not identify chat.");
  }

  const isGroupChat = chat.type !== "private";
  
  // In group chats, require reply to message. In DMs, allow direct tipping with @username
  if (isGroupChat && !ctx.message?.reply_to_message) {
    logger.debug("Tip command failed - no reply message");
    return ctx.reply("❌ Reply to a message to tip its author.");
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

    // Parse tip command (different logic for groups vs DMs)
    let payeeId: string | undefined;
    let payeeHandle: string | undefined;
    let amount: number;
    let tokenTicker: string | undefined;

    if (isGroupChat) {
      // Group tip: reply to message required
      const parsed = parseTipCommand(ctx);
      if (!parsed) {
        return ctx.reply("❌ Usage: \`/tip amount [TOKEN]\` (reply required)", { parse_mode: "Markdown" });
      }
      amount = parsed.amount;
      tokenTicker = parsed.tokenTicker;
      payeeId = ctx.message?.reply_to_message?.from?.id.toString();
      payeeHandle = ctx.message?.reply_to_message?.from?.username?.toLowerCase(); // Normalize to lowercase

      if (!payeeId) {
        return ctx.reply("❌ Could not identify tip recipient.");
      }
    } else {
      // DM tip: parse @username from command
      const parsed = await parsePayCommand(ctx); // Reuse pay command parser for @username
      if (!parsed || !parsed.payeeHandle) {
        return ctx.reply("❌ Usage: \`/tip @username amount [TOKEN]\`", { parse_mode: "Markdown" });
      }
      amount = parsed.amount;
      tokenTicker = parsed.tokenTicker;
      payeeHandle = parsed.payeeHandle;
      payeeId = parsed.payeeId; // May be undefined, will resolve via username
    }

    if (payeeId === ctx.from?.id.toString()) {
      return ctx.reply("❌ Cannot tip yourself!");
    }

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
