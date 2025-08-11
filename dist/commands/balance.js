"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commandBalance = commandBalance;
exports.handleBalanceCallbacks = handleBalanceCallbacks;
const prisma_1 = require("../infra/prisma");
const wallets_1 = require("../core/wallets");
const tokens_1 = require("../core/tokens");
const grammy_1 = require("grammy");
const logger_1 = require("../infra/logger");
const message_templates_1 = require("../core/message-templates");
async function commandBalance(ctx) {
    try {
        // Get user
        const userId = ctx.from?.id.toString();
        if (!userId) {
            return ctx.reply("❌ Could not identify user.");
        }
        const user = await prisma_1.prisma.user.findUnique({
            where: { telegramId: userId },
            include: { wallets: { where: { isActive: true } } }
        });
        if (!user || !user.wallets[0]) {
            return ctx.reply("❌ You need to create a wallet first. DM me with /start.");
        }
        const wallet = user.wallets[0];
        // Get balances
        const balances = await (0, wallets_1.getWalletBalance)(wallet.address);
        if (!balances || balances.length === 0) {
            const keyboard = new grammy_1.InlineKeyboard()
                .text("📱 Receive", "deposit")
                .text("💸 Withdraw", "withdraw");
            await ctx.reply(`💳 **Balance**

\`${wallet.address.slice(0, 8)}...${wallet.address.slice(-4)}\`

Ready to receive payments`, {
                parse_mode: "Markdown",
                reply_markup: keyboard
            });
            return;
        }
        // Format balance display using message templates
        const balanceList = [];
        // Sort by USD value (if available) or amount
        balances.sort((a, b) => (b.uiAmount || 0) - (a.uiAmount || 0));
        for (const balance of balances.slice(0, 8)) { // Show top 8
            const token = await (0, tokens_1.resolveTokenByMint)(balance.mint);
            const symbol = token?.ticker || balance.mint.slice(0, 4);
            const amount = balance.uiAmount?.toFixed(4) || "0";
            balanceList.push({
                token: symbol,
                amount: amount
            });
        }
        const messageData = {
            balance: (0, message_templates_1.formatBalanceList)(balanceList)
        };
        let balanceText = message_templates_1.messages.dm.balance_display(messageData);
        balanceText += `\n\n\`${wallet.address.slice(0, 8)}...${wallet.address.slice(-4)}\``;
        if (balances.length > 8) {
            balanceText += `\n\n+${balances.length - 8} more tokens`;
        }
        const keyboard = new grammy_1.InlineKeyboard()
            .text("📱 Receive", "deposit")
            .text("💸 Withdraw", "withdraw")
            .row()
            .text("🔄 Refresh", "refresh_balance");
        await ctx.reply(balanceText, {
            parse_mode: "Markdown",
            reply_markup: keyboard
        });
    }
    catch (error) {
        logger_1.logger.error("Balance command error:", error);
        await ctx.reply("❌ Failed to fetch balance. Please try again.");
    }
}
// Handle inline keyboard callbacks
async function handleBalanceCallbacks(ctx) {
    const data = ctx.callbackQuery?.data;
    if (data === "deposit") {
        const userId = ctx.from?.id.toString();
        if (!userId)
            return;
        const user = await prisma_1.prisma.user.findUnique({
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
