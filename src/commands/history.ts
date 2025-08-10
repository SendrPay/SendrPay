import { BotContext } from "../bot";
import { prisma } from "../infra/prisma";
import { logger } from "../infra/logger";
import { resolveToken } from "../core/tokens";

export async function commandHistory(ctx: BotContext) {
  const chat = ctx.chat;
  if (!chat) {
    return ctx.reply("❌ Could not identify chat.");
  }

  const userId = ctx.from?.id.toString();
  if (!userId) {
    return ctx.reply("❌ Could not identify user.");
  }

  logger.info("History command received");

  try {
    // Get user
    const user = await prisma.user.findUnique({
      where: { telegramId: userId },
      include: { wallets: { where: { isActive: true } } }
    });

    if (!user || !user.wallets[0]) {
      return ctx.reply("❌ You need to create a wallet first. Use /start to set up your wallet.");
    }

    // Get recent transactions (last 10)
    const transactions = await prisma.payment.findMany({
      where: {
        OR: [
          { fromUserId: user.id },
          { toUserId: user.id }
        ],
        status: "sent"
      },
      include: {
        from: true,
        to: true
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 10
    });

    if (transactions.length === 0) {
      return ctx.reply("📋 **Transaction History**\n\nNo transactions found. Start by using /pay or /tip to send crypto!");
    }

    let historyMessage = "📋 **Transaction History**\n\n";
    
    for (const tx of transactions) {
      const isOutgoing = tx.fromUserId === user.id;
      // Get token info first to get correct decimals
      const token = await resolveToken(tx.mint);
      const decimals = token?.decimals || 6; // Default to 6 if token not found
      const amount = Number(tx.amountRaw) / Math.pow(10, decimals);
      
      const tokenTicker = token?.ticker || (tx.mint === "So11111111111111111111111111111111111111112" ? "SOL" : "TOKEN");
      
      // Format counterpart
      const counterpart = isOutgoing 
        ? (tx.to?.handle ? `@${tx.to.handle}` : `User ${tx.to?.telegramId}`)
        : (tx.from?.handle ? `@${tx.from.handle}` : `User ${tx.from?.telegramId}`);
      
      // Format date
      const date = tx.createdAt.toLocaleDateString();
      const time = tx.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      const direction = isOutgoing ? "→" : "←";
      const amountDisplay = isOutgoing ? `-${amount}` : `+${amount}`;
      
      historyMessage += `${direction} **${amountDisplay} ${tokenTicker}**\n`;
      historyMessage += `${isOutgoing ? 'To' : 'From'}: ${counterpart}\n`;
      
      if (tx.note && tx.note !== "tip") {
        historyMessage += `Note: ${tx.note}\n`;
      }
      
      historyMessage += `${date} ${time}\n`;
      
      if (tx.txSig) {
        historyMessage += `[View Transaction](https://explorer.solana.com/tx/${tx.txSig}?cluster=devnet)\n`;
      }
      
      historyMessage += "\n";
    }

    historyMessage += "*Showing last 10 transactions*\n";
    historyMessage += "*All transactions on Solana devnet*";

    await ctx.reply(historyMessage, { 
      parse_mode: "Markdown"
    });
    
  } catch (error) {
    logger.error("History command error:", error);
    await ctx.reply("❌ Failed to get transaction history. Please try again.");
  }
}