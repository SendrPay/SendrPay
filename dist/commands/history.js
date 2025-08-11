"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commandHistory = commandHistory;
const prisma_1 = require("../infra/prisma");
const logger_1 = require("../infra/logger");
const tokens_1 = require("../core/tokens");
const message_templates_1 = require("../core/message-templates");
async function commandHistory(ctx) {
    const chat = ctx.chat;
    if (!chat) {
        return ctx.reply("❌ Could not identify chat.");
    }
    const userId = ctx.from?.id.toString();
    if (!userId) {
        return ctx.reply("❌ Could not identify user.");
    }
    logger_1.logger.info("History command received");
    try {
        // Get user
        const user = await prisma_1.prisma.user.findUnique({
            where: { telegramId: userId },
            include: { wallets: { where: { isActive: true } } }
        });
        if (!user || !user.wallets[0]) {
            return ctx.reply("❌ You need to create a wallet first. Use /start to set up your wallet.");
        }
        // Get recent transactions (last 10)
        const transactions = await prisma_1.prisma.payment.findMany({
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
        // Format transactions using message templates
        const transactionList = [];
        for (const tx of transactions) {
            const isOutgoing = tx.fromUserId === user.id;
            // Get token info first to get correct decimals
            const token = await (0, tokens_1.resolveToken)(tx.mint);
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
            const type = isOutgoing ? "Sent" : "Received";
            const amountStr = amount.toString();
            transactionList.push({
                type,
                amount: amountStr,
                token: tokenTicker,
                counterpart,
                timestamp: `${date} ${time}`
            });
        }
        const messageData = {
            balance: (0, message_templates_1.formatTransactionList)(transactionList) // Reusing balance field for transaction list
        };
        let historyMessage = message_templates_1.messages.dm.transaction_history(messageData);
        historyMessage += "\n\n*Showing last 10 transactions*\n";
        historyMessage += "*All transactions on Solana devnet*";
        await ctx.reply(historyMessage, {
            parse_mode: "Markdown"
        });
    }
    catch (error) {
        logger_1.logger.error("History command error:", error);
        await ctx.reply("❌ Failed to get transaction history. Please try again.");
    }
}
