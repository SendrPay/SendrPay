import type { BotContext } from "../bot";
import { prisma } from "../infra/prisma";
import { parsePayCommand } from "../core/parse";
import { resolveToken } from "../core/tokens";
import { calcFeeRaw } from "../core/fees";
import { executeTransfer } from "../core/transfer";
import { createEscrow } from "../core/escrow";
import { formatReceipt } from "../core/receipts";
import { checkRateLimit } from "../core/ratelimit";
import { generateClientIntentId } from "../core/idempotency";
import { logger } from "../infra/logger";
import { v4 as uuidv4 } from "uuid";

export async function commandPay(ctx: BotContext) {
  const chat = ctx.chat;
  if (!chat || chat.type === "private") {
    return ctx.reply("Use /pay in groups only.");
  }

  try {
    // Check if chat is whitelisted
    const chatRecord = await prisma.chat.findUnique({
      where: { chatId: chat.id.toString() }
    });

    if (!chatRecord?.whitelisted) {
      return ctx.reply("❌ Bot not enabled. Admins: use /enable first.");
    }

    // Rate limiting
    const rateLimitKey = `${chat.id}:${ctx.from?.id}`;
    if (!checkRateLimit(rateLimitKey)) {
      return ctx.reply("⏰ Rate limit exceeded. Please wait before sending again.");
    }

    // Parse command
    const parsed = await parsePayCommand(ctx);
    if (!parsed) {
      return ctx.reply("❌ Usage: /pay @user amount TOKEN [note]");
    }

    const { payeeId, payeeHandle, amount, tokenTicker, note } = parsed;

    // Resolve token
    const token = await resolveToken(tokenTicker);
    if (!token) {
      return ctx.reply(`❌ Unknown token: ${tokenTicker}`);
    }

    // Convert amount to raw units
    const amountRaw = BigInt(Math.floor(amount * (10 ** token.decimals)));
    if (amountRaw <= 0n) {
      return ctx.reply("❌ Amount must be positive.");
    }

    // Get payer wallet
    const payerId = ctx.from?.id.toString();
    if (!payerId) {
      return ctx.reply("❌ Could not identify sender.");
    }

    const payer = await prisma.user.findUnique({
      where: { telegramId: payerId },
      include: { wallets: { where: { isActive: true } } }
    });

    if (!payer || !payer.wallets[0]) {
      return ctx.reply("❌ You need to create a wallet first. DM me with /start.");
    }

    const payerWallet = payer.wallets[0];

    // Calculate fees
    const { feeRaw, netRaw } = calcFeeRaw(
      amountRaw,
      chatRecord.feeBps || parseInt(process.env.FEE_BPS || "50"),
      BigInt(process.env.FEE_MIN_RAW_SOL || "5000") // TODO: per-token mins
    );

    // Generate payment ID
    const paymentId = uuidv4();
    const clientIntentId = generateClientIntentId(payerId, paymentId);

    // Check for existing payment with same intent
    const existing = await prisma.payment.findUnique({
      where: { clientIntentId }
    });

    if (existing) {
      return ctx.reply("❌ Duplicate payment detected.");
    }

    // Check if payee exists and has wallet
    let payee = null;
    let payeeWallet = null;

    if (payeeId) {
      payee = await prisma.user.findUnique({
        where: { telegramId: payeeId },
        include: { wallets: { where: { isActive: true } } }
      });
      payeeWallet = payee?.wallets[0];
    }

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        id: paymentId,
        clientIntentId,
        chatId: chat.id.toString(),
        fromUserId: payer.id,
        toUserId: payee?.id,
        fromWallet: payerWallet.address,
        toWallet: payeeWallet?.address || "ESCROW",
        mint: token.mint,
        amountRaw: amountRaw.toString(),
        feeRaw: feeRaw.toString(),
        note,
        status: "pending"
      }
    });

    // If payee doesn't have wallet, create escrow
    if (!payeeWallet && payeeHandle) {
      await createEscrow({
        paymentId,
        chatId: chat.id.toString(),
        payerWallet: payerWallet.address,
        payeeHandle,
        payeeTid: payeeId,
        mint: token.mint,
        amountRaw: netRaw,
        feeRaw
      });

      await ctx.reply(`💰 Payment escrowed for ${payeeHandle}! They can claim it by DMing @${ctx.me.username}.`);
      return;
    }

    if (!payeeWallet) {
      return ctx.reply("❌ Could not determine recipient wallet.");
    }

    // Execute transfer
    const result = await executeTransfer({
      fromWallet: payerWallet,
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

      // Send confirmation
      const receipt = formatReceipt({
        from: `@${ctx.from?.username || 'user'}`,
        to: payeeHandle || payeeWallet.address.slice(0, 8) + "...",
        gross: amount,
        fee: Number(feeRaw) / (10 ** token.decimals),
        net: Number(netRaw) / (10 ** token.decimals),
        token: token.ticker,
        signature: result.signature,
        note
      });

      await ctx.reply(receipt, { parse_mode: "Markdown" });

      logger.info(`Payment sent: ${paymentId}, tx: ${result.signature}`);
    } else {
      await ctx.reply(`❌ Transfer failed: ${result.error}`);
    }

  } catch (error) {
    logger.error("Pay command error:", error);
    await ctx.reply("❌ Payment failed. Please try again.");
  }
}
