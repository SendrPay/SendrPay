import type { BotContext } from "../bot";
import { prisma } from "../infra/prisma";
import { parseSplitCommand } from "../core/parse";
import { resolveToken } from "../core/tokens";
import { calcFeeRaw } from "../core/fees";
import { executeTransfer } from "../core/transfer";
import { formatReceipt } from "../core/receipts";
import { checkRateLimit } from "../core/ratelimit";
import { generateClientIntentId } from "../core/idempotency";
import { logger } from "../infra/logger";
import { v4 as uuidv4 } from "uuid";

export async function commandSplit(ctx: BotContext) {
  const chat = ctx.chat;
  if (!chat) {
    return ctx.reply("❌ Could not identify chat.");
  }

  const isGroupChat = chat.type !== "private";

  try {
    // Check if group chat is whitelisted (skip for DMs)
    let chatRecord = null;
    if (isGroupChat) {
      chatRecord = await prisma.chat.findUnique({
        where: { chatId: chat.id.toString() }
      });

      if (!chatRecord?.whitelisted) {
        return ctx.reply("❌ Bot not enabled. Admins: use /enable first.");
      }
    }

    // Rate limiting
    const rateLimitKey = `${chat.id}:${ctx.from?.id}`;
    if (!checkRateLimit(rateLimitKey)) {
      return ctx.reply("⏰ Rate limit exceeded. Please wait.");
    }

    // Parse split command
    const parsed = parseSplitCommand(ctx);
    if (!parsed) {
      return ctx.reply("❌ Usage: /split amount TOKEN @user1 @user2 [@user3:30%]");
    }

    const { totalAmount, tokenTicker, recipients } = parsed;

    // Resolve token
    const token = await resolveToken(tokenTicker);
    if (!token) {
      return ctx.reply(`❌ Unknown token: ${tokenTicker}`);
    }

    // Convert amount to raw units
    const totalAmountRaw = BigInt(Math.floor(totalAmount * (10 ** token.decimals)));
    if (totalAmountRaw <= 0n) {
      return ctx.reply("❌ Amount must be positive.");
    }

    // Get payer
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

    // Calculate individual amounts
    const totalWeight = recipients.reduce((sum, r) => sum + r.weight, 0);
    const individualAmounts = recipients.map(r => ({
      ...r,
      amountRaw: (totalAmountRaw * BigInt(r.weight * 100)) / BigInt(totalWeight * 100)
    }));

    // Validate all recipients have wallets
    const recipientUsers = await Promise.all(
      individualAmounts.map(async (r) => {
        if (!r.userId) return null;
        const user = await prisma.user.findUnique({
          where: { telegramId: r.userId },
          include: { wallets: { where: { isActive: true } } }
        });
        return user?.wallets[0] ? { ...r, wallet: user.wallets[0] } : null;
      })
    );

    const missingWallets = recipientUsers.filter(u => !u);
    if (missingWallets.length > 0) {
      return ctx.reply("❌ Some recipients don't have wallets yet.");
    }

    // Calculate total fees
    let totalFeeRaw = 0n;
    const transfers = recipientUsers.filter(r => r).map(r => {
      const { feeRaw, netRaw } = calcFeeRaw(
        r!.amountRaw,
        chatRecord.feeBps || parseInt(process.env.FEE_BPS || "50"),
        BigInt(process.env.FEE_MIN_RAW_SOL || "5000")
      );
      totalFeeRaw += feeRaw;
      return {
        ...r!,
        feeRaw,
        netRaw
      };
    });

    const masterPaymentId = uuidv4();
    
    // Execute all transfers
    const results = await Promise.all(
      transfers.map(async (t, index) => {
        const paymentId = `${masterPaymentId}-${index}`;
        const clientIntentId = generateClientIntentId(payerId, paymentId);

        // Create payment record
        await prisma.payment.create({
          data: {
            id: paymentId,
            clientIntentId,
            chatId: chat.id.toString(),
            fromUserId: payer.id,
            toUserId: t.userId ? parseInt(t.userId) : null,
            fromWallet: payerWallet.address,
            toWallet: t.wallet!.address,
            mint: token.mint,
            amountRaw: t.amountRaw.toString(),
            feeRaw: t.feeRaw.toString(),
            note: `split ${index + 1}/${transfers.length}`,
            status: "pending"
          }
        });

        // Execute transfer
        return await executeTransfer({
          fromWallet: payerWallet,
          toAddress: t.wallet!.address,
          mint: token.mint,
          amountRaw: t.netRaw,
          feeRaw: t.feeRaw,
          token
        });
      })
    );

    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;

    if (successful > 0) {
      const receipt = `💰 **Split Payment Complete**

Total: ${totalAmount} ${token.ticker}
Recipients: ${successful}/${transfers.length}
Total Fees: ${Number(totalFeeRaw) / (10 ** token.decimals)} ${token.ticker}

${failed > 0 ? `⚠️ ${failed} transfers failed` : '✅ All transfers successful'}`;

      await ctx.reply(receipt, { parse_mode: "Markdown" });

      logger.info(`Split payment: ${masterPaymentId}, ${successful}/${transfers.length} successful`);
    } else {
      await ctx.reply("❌ All split transfers failed.");
    }

  } catch (error) {
    logger.error("Split command error:", error);
    await ctx.reply("❌ Split payment failed. Please try again.");
  }
}
