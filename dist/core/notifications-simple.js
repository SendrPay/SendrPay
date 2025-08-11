"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPaymentNotification = sendPaymentNotification;
exports.handleReactionCallback = handleReactionCallback;
exports.handleAlreadyReacted = handleAlreadyReacted;
const grammy_1 = require("grammy");
const logger_1 = require("../infra/logger");
const message_templates_1 = require("./message-templates");
// Generate Solana Explorer link for transaction
function getSolanaExplorerLink(signature) {
    return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}
// Send payment notification to recipient (simplified version)
async function sendPaymentNotification(botApi, data) {
    try {
        const { senderHandle, recipientTelegramId, amount, tokenTicker, signature, note, isNewWallet, type = 'payment' } = data;
        // Get recipient's wallet balance for notification
        const { PrismaClient } = await Promise.resolve().then(() => require("@prisma/client"));
        const prisma = new PrismaClient();
        let balanceText = "Calculating...";
        try {
            const user = await prisma.user.findUnique({
                where: { telegramId: recipientTelegramId },
                include: { wallet: true }
            });
            if (user?.wallet?.address) {
                const { Connection } = await Promise.resolve().then(() => require("@solana/web3.js"));
                const connection = new Connection(process.env.SOLANA_RPC_URL);
                const balance = await connection.getBalance(new (await Promise.resolve().then(() => require("@solana/web3.js"))).PublicKey(user.wallet.address));
                balanceText = `${(balance / 1e9).toFixed(4)} SOL`;
            }
        }
        catch (error) {
            console.error("Error fetching balance for notification:", error);
        }
        finally {
            await prisma.$disconnect();
        }
        // Create standardized notification message using templates
        const messageData = {
            amount: amount.toString(),
            token: tokenTicker,
            sender: senderHandle,
            timestamp: (0, message_templates_1.formatTimestamp)(),
            explorer_link: (0, message_templates_1.formatExplorerLink)(signature),
            balance: balanceText
        };
        const baseMessage = type === 'tip'
            ? message_templates_1.messages.dm.tip_received(messageData)
            : message_templates_1.messages.dm.payment_received(messageData);
        let message = baseMessage;
        if (note && note !== 'tip') {
            message += `\n**Note:** ${note}`;
        }
        if (isNewWallet) {
            message += `\n\n✨ Welcome! Your wallet was set up automatically.`;
        }
        // Create shorter callback data (Telegram limit is 64 bytes)
        const shortSig = signature.slice(0, 20);
        // Create inline keyboard with emoji reactions
        const keyboard = new grammy_1.InlineKeyboard()
            .text("❤️", `react_heart_${shortSig}`)
            .text("🔥", `react_fire_${shortSig}`)
            .text("🙏", `react_pray_${shortSig}`)
            .text("👍", `react_thumbs_${shortSig}`);
        await botApi.sendMessage(recipientTelegramId, message, {
            parse_mode: "Markdown",
            reply_markup: keyboard,
            disable_web_page_preview: false
        });
        logger_1.logger.info(`${type} notification sent successfully`);
    }
    catch (error) {
        logger_1.logger.error(`Failed to send ${data.type || 'payment'} notification`);
        throw error;
    }
}
// Enhanced reaction handler with one-reaction-per-payment limit
async function handleReactionCallback(ctx) {
    try {
        const data = ctx.callbackQuery?.data;
        if (!data || !data.startsWith("react_"))
            return;
        const parts = data.split("_");
        const reaction = parts[1]; // "heart", "fire", "pray", or "thumbs"
        const shortSig = parts.slice(2).join("_");
        const emojiMap = {
            "heart": "❤️",
            "fire": "🔥",
            "pray": "🙏",
            "thumbs": "👍"
        };
        const emoji = emojiMap[reaction] || "❤️";
        // Find the original transaction to get sender info
        const { PrismaClient } = await Promise.resolve().then(() => require("@prisma/client"));
        const prisma = new PrismaClient();
        try {
            // Look for transaction with matching signature prefix
            const transaction = await prisma.transaction.findFirst({
                where: {
                    signature: {
                        startsWith: shortSig
                    },
                    recipientTelegramId: ctx.from?.id?.toString()
                },
                orderBy: { createdAt: 'desc' }
            });
            if (!transaction || !transaction.senderTelegramId) {
                await ctx.answerCallbackQuery("Transaction not found");
                return;
            }
            // Check if user already reacted to this payment
            const existingReaction = await prisma.transaction.findFirst({
                where: {
                    signature: transaction.signature,
                    recipientTelegramId: ctx.from?.id?.toString(),
                    reactionSent: true
                }
            });
            if (existingReaction) {
                await ctx.answerCallbackQuery("You've already reacted to this payment!");
                return;
            }
            // Mark reaction as sent in database
            await prisma.transaction.update({
                where: { id: transaction.id },
                data: { reactionSent: true }
            });
            // Send reaction notification to original sender
            const reactionMessage = `${emoji} **Payment Reaction Received!**\n\n` +
                `@${ctx.from?.username || 'Someone'} reacted to your payment with ${emoji}\n` +
                `**Amount:** ${Number(transaction.amount) / Math.pow(10, 9)} ${transaction.tokenTicker}`;
            await ctx.api.sendMessage(transaction.senderTelegramId, reactionMessage, {
                parse_mode: "Markdown"
            });
            // Update the original notification to show reaction was sent
            await ctx.editMessageReplyMarkup({
                inline_keyboard: [[
                        { text: "✅ Reacted", callback_data: "already_reacted" }
                    ]]
            });
            await ctx.answerCallbackQuery(`${emoji} Reaction sent to sender!`);
            logger_1.logger.info("Reaction sent to sender");
        }
        catch (dbError) {
            logger_1.logger.error("Database error in reaction handler", dbError);
            await ctx.answerCallbackQuery("Failed to send reaction");
        }
        finally {
            await prisma.$disconnect();
        }
    }
    catch (error) {
        logger_1.logger.error("Failed to handle reaction callback", error);
        await ctx.answerCallbackQuery("Failed to send reaction");
    }
}
// Handle already reacted callback (for disabled buttons)
async function handleAlreadyReacted(ctx) {
    await ctx.answerCallbackQuery("You've already reacted to this payment!");
}
