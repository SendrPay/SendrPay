import type { BotContext } from "../bot";
import { prisma } from "../infra/prisma";
import { getWalletBalance } from "../core/wallets";
import { resolveTokenByMint } from "../core/tokens";
import { InlineKeyboard } from "grammy";
import { logger } from "../infra/logger";

export async function commandBalance(ctx: BotContext) {
  try {
    // Get user
    const userId = ctx.from?.id.toString();
    if (!userId) {
      return ctx.reply("❌ Could not identify user.");
    }

    const user = await prisma.user.findUnique({
      where: { telegramId: userId },
      include: { wallets: { where: { isActive: true } } }
    });

    if (!user || !user.wallets[0]) {
      return ctx.reply("❌ You need to create a wallet first. DM me with /start.");
    }

    const wallet = user.wallets[0];

    // Get balances
    const balances = await getWalletBalance(wallet.address);
    
    if (!balances || balances.length === 0) {
      const keyboard = new InlineKeyboard()
        .text("💰 Deposit", "deposit")
        .text("📤 Withdraw", "withdraw");

      await ctx.reply(`💰 **Your Balance**

Wallet: \`${wallet.address.slice(0, 8)}...\`

No tokens found. Deposit some tokens to get started!`, {
        parse_mode: "Markdown",
        reply_markup: keyboard
      });
      return;
    }

    // Format balance display
    let balanceText = `💰 **Your Balance**\n\nWallet: \`${wallet.address.slice(0, 8)}...\`\n\n`;
    
    // Sort by USD value (if available) or amount
    balances.sort((a, b) => (b.uiAmount || 0) - (a.uiAmount || 0));
    
    for (const balance of balances.slice(0, 10)) { // Show top 10
      const token = await resolveTokenByMint(balance.mint);
      const symbol = token?.ticker || balance.mint.slice(0, 4);
      const amount = balance.uiAmount?.toFixed(4) || "0";
      
      balanceText += `${symbol}: ${amount}\n`;
    }

    if (balances.length > 10) {
      balanceText += `\n... and ${balances.length - 10} more tokens`;
    }

    const keyboard = new InlineKeyboard()
      .text("💰 Deposit", "deposit")
      .text("📤 Withdraw", "withdraw")
      .row()
      .text("🔄 Refresh", "refresh_balance");

    await ctx.reply(balanceText, {
      parse_mode: "Markdown",
      reply_markup: keyboard
    });

  } catch (error) {
    logger.error("Balance command error:", error);
    await ctx.reply("❌ Failed to fetch balance. Please try again.");
  }
}

// Handle inline keyboard callbacks
export async function handleBalanceCallbacks(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;

  if (data === "deposit") {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    const user = await prisma.user.findUnique({
      where: { telegramId: userId },
      include: { wallets: { where: { isActive: true } } }
    });

    if (!user || !user.wallets[0]) {
      return ctx.answerCallbackQuery("❌ Wallet not found");
    }

    const wallet = user.wallets[0];
    const depositText = `💰 **Deposit Address**

Send any supported token to:
\`${wallet.address}\`

Supported tokens: SOL, USDC, BONK, JUP

[View QR Code](${process.env.APP_BASE_URL}/qr/${wallet.address})`;

    await ctx.editMessageText(depositText, { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery("Deposit info updated");
  }
  
  if (data === "withdraw") {
    await ctx.answerCallbackQuery("DM me to withdraw funds");
    if (ctx.chat?.type !== "private") {
      await ctx.reply("Please DM me @" + ctx.me.username + " to withdraw funds securely.");
    }
  }
  
  if (data === "refresh_balance") {
    await ctx.answerCallbackQuery("Refreshing...");
    await commandBalance(ctx);
  }
}
