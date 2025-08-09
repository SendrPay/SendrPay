import type { BotContext } from "../bot";
import { prisma } from "../infra/prisma";
import { parseTipCommand } from "../core/parse";
import { resolveToken } from "../core/tokens";
import { calcFeeRaw } from "../core/fees";
import { executeTransfer } from "../core/transfer";
import { formatReceipt } from "../core/receipts";
import { checkRateLimit } from "../core/ratelimit";
import { generateClientIntentId } from "../core/idempotency";
import { logger } from "../infra/logger";
import { v4 as uuidv4 } from "uuid";

export async function commandTip(ctx: BotContext) {
  const chat = ctx.chat;
  if (!chat || chat.type === "private") {
    return ctx.reply("Use /tip in groups by replying to a message.");
  }

  if (!ctx.message?.reply_to_message) {
    return ctx.reply("❌ Reply to a message to tip its author.");
  }

  try {
    // Check if chat is whitelisted and tipping enabled
    const chatRecord = await prisma.chat.findUnique({
      where: { chatId: chat.id.toString() }
    });

    if (!chatRecord?.whitelisted || !chatRecord.tipping) {
      return ctx.reply("❌ Tipping not enabled in this chat.");
    }

    // Rate limiting
    const rateLimitKey = `${chat.id}:${ctx.from?.id}`;
    if (!checkRateLimit(rateLimitKey)) {
      return ctx.reply("⏰ Rate limit exceeded. Please wait.");
    }

    // Parse tip command
    const parsed = parseTipCommand(ctx);
    if (!parsed) {
      return ctx.reply("❌ Usage: /tip amount [TOKEN]");
    }

    const { amount, tokenTicker } = parsed;
    const payeeId = ctx.message.reply_to_message.from?.id.toString();
    const payeeHandle = ctx.message.reply_to_message.from?.username;

    if (!payeeId) {
      return ctx.reply("❌ Could not identify tip recipient.");
    }

    if (payeeId === ctx.from?.id.toString()) {
      return ctx.reply("❌ Cannot tip yourself!");
    }

    // Use default token if not specified
    const finalTokenTicker = tokenTicker || chatRecord.defaultTicker || "USDC";
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

    // Calculate fees
    const { feeRaw, netRaw } = calcFeeRaw(
      amountRaw,
      chatRecord.feeBps || parseInt(process.env.FEE_BPS || "50"),
      BigInt(process.env.FEE_MIN_RAW_SOL || "5000")
    );

    // Get payee wallet
    const payee = await prisma.user.findUnique({
      where: { telegramId: payeeId },
      include: { wallets: { where: { isActive: true } } }
    });

    if (!payee || !payee.wallets[0]) {
      return ctx.reply(`❌ ${payeeHandle || 'User'} needs to create a wallet first.`);
    }

    const payeeWallet = payee.wallets[0];

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

    // Execute transfer
    const result = await executeTransfer({
      fromWallet: tipperWallet,
      toAddress: payeeWallet.address,
      mint: token.mint,
      amountRaw: netRaw,
      feeRaw,
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
      const receipt = `🎉 **Tip Sent!**

From: @${ctx.from?.username || 'user'}
To: @${payeeHandle || 'user'}
Amount: ${amount} ${token.ticker}
Fee: ${Number(feeRaw) / (10 ** token.decimals)} ${token.ticker}

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
