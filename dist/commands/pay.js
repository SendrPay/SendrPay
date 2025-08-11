"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commandPay = commandPay;
exports.handlePaymentConfirmation = handlePaymentConfirmation;
const prisma_1 = require("../infra/prisma");
const parse_1 = require("../core/parse");
const tokens_1 = require("../core/tokens");
const fees_1 = require("../core/fees");
const transfer_1 = require("../core/transfer");
const receipts_1 = require("../core/receipts");
const ratelimit_1 = require("../core/ratelimit");
const idempotency_1 = require("../core/idempotency");
const notifications_simple_1 = require("../core/notifications-simple");
const logger_1 = require("../infra/logger");
const uuid_1 = require("uuid");
const message_templates_1 = require("../core/message-templates");
async function commandPay(ctx) {
    const chat = ctx.chat;
    if (!chat) {
        return ctx.reply("❌ Could not identify chat.");
    }
    // Handle group payments differently than DM payments
    const isGroupChat = chat.type !== "private";
    try {
        // Check if group chat is whitelisted (skip for DMs)
        if (isGroupChat) {
            const chatRecord = await prisma_1.prisma.chat.findUnique({
                where: { chatId: chat.id.toString() }
            });
            if (!chatRecord?.whitelisted) {
                return ctx.reply("❌ Bot not enabled. Admins: use /enable first.");
            }
        }
        // Rate limiting
        const rateLimitKey = `${chat.id}:${ctx.from?.id}`;
        if (!(0, ratelimit_1.checkRateLimit)(rateLimitKey)) {
            return ctx.reply("⏰ Rate limit exceeded. Please wait before sending again.");
        }
        // Parse command
        const parsed = await (0, parse_1.parsePayCommand)(ctx);
        if (!parsed) {
            return ctx.reply("❌ Usage: \`/pay @username amount TOKEN [note]\`", { parse_mode: "Markdown" });
        }
        const { payeeId, payeeHandle, amount, tokenTicker, note } = parsed;
        // Username verification: payments only succeed when directed to verified usernames
        if (!payeeHandle) {
            return ctx.reply("❌ Specify recipient username: \`/pay @username amount TOKEN\`", { parse_mode: "Markdown" });
        }
        // Resolve token
        const token = await (0, tokens_1.resolveToken)(tokenTicker);
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
        const payer = await prisma_1.prisma.user.findUnique({
            where: { telegramId: payerId },
            include: { wallets: { where: { isActive: true } } }
        });
        if (!payer || !payer.wallets[0]) {
            return ctx.reply("❌ Create wallet first: DM me with \`/start\`", { parse_mode: "Markdown" });
        }
        const payerWallet = payer.wallets[0];
        // Calculate fees with flexible service fee system
        const feeCalc = await (0, fees_1.calculateFee)(amountRaw, token.mint);
        const feeRaw = feeCalc.feeRaw;
        const serviceFeeRaw = feeCalc.serviceFeeRaw;
        const serviceFeeToken = feeCalc.serviceFeeToken;
        const netRaw = feeCalc.netRaw;
        // Generate payment ID
        const paymentId = (0, uuid_1.v4)();
        const clientIntentId = (0, idempotency_1.generateClientIntentId)(payerId, paymentId);
        // Check for existing payment with same intent
        const existing = await prisma_1.prisma.payment.findUnique({
            where: { clientIntentId }
        });
        if (existing) {
            return ctx.reply("❌ Duplicate payment detected.");
        }
        // Username verification: Find user by their actual Telegram handle only
        // Look up user by their verified Telegram handle (case-insensitive like Telegram)
        const payee = await prisma_1.prisma.user.findFirst({
            where: {
                handle: {
                    equals: payeeHandle,
                    mode: 'insensitive' // Case-insensitive matching like Telegram
                }
            },
            include: { wallets: { where: { isActive: true } } }
        });
        if (!payee) {
            return ctx.reply(`❌ User @${payeeHandle} not found. They need to start the bot to register their Telegram username.`);
        }
        // Strict verification: the handle must exactly match their registered Telegram username
        if (payee.handle?.toLowerCase() !== payeeHandle.toLowerCase()) {
            return ctx.reply(`❌ Username verification failed. This user's verified handle is @${payee.handle}.`);
        }
        const payeeWallet = payee.wallets[0];
        if (!payeeWallet) {
            return ctx.reply(`❌ User @${payeeHandle} needs to create a wallet first.`);
        }
        // Show payment confirmation using message templates
        const recipientReceives = Number(amountRaw) / (10 ** token.decimals);
        const transactionFee = Number(feeRaw) / (10 ** token.decimals);
        const serviceFeeAmount = Number(serviceFeeRaw) / (10 ** token.decimals);
        const totalYouPay = Number(amountRaw + feeRaw + serviceFeeRaw) / (10 ** token.decimals);
        // Get service fee confirmation message
        const serviceFeeMessage = await (0, fees_1.generateFeeConfirmationMessage)(amountRaw, token.mint, token);
        // Use standardized payment confirmation template
        const messageData = {
            recipient: `@${payeeHandle}`,
            amount: recipientReceives.toString(),
            token: token.ticker,
            network_fee: `${transactionFee} ${token.ticker}`,
            service_fee: serviceFeeMessage,
            total: `${totalYouPay} ${token.ticker}`,
            note: note || undefined
        };
        const confirmationText = message_templates_1.messages.dm.payment_confirmation(messageData);
        const confirmationKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "✅ Send Payment", callback_data: `confirm_pay_${paymentId}` },
                        { text: "❌ Cancel", callback_data: `cancel_pay_${paymentId}` }
                    ]
                ]
            }
        };
        // Create payment record in pending state
        const payment = await prisma_1.prisma.payment.create({
            data: {
                id: paymentId,
                clientIntentId,
                chatId: chat.id.toString(),
                fromUserId: payer.id,
                toUserId: payee.id,
                fromWallet: payerWallet.address,
                toWallet: payeeWallet.address,
                mint: token.mint,
                amountRaw: amountRaw.toString(),
                feeRaw: feeRaw.toString(),
                // @ts-ignore - New fields from schema update
                serviceFeeRaw: serviceFeeRaw.toString(),
                // @ts-ignore - New fields from schema update  
                serviceFeeToken,
                note,
                status: "awaiting_confirmation"
            }
        });
        await ctx.reply(confirmationText, {
            parse_mode: "Markdown",
            ...confirmationKeyboard
        });
    }
    catch (error) {
        logger_1.logger.error("Pay command error:", error);
        await ctx.reply("❌ Payment failed. Please try again.");
    }
}
async function handlePaymentConfirmation(ctx, confirmed) {
    try {
        const paymentId = ctx.callbackQuery?.data?.split('_')[2];
        if (!paymentId) {
            return ctx.reply("❌ Invalid payment confirmation.");
        }
        // Get payment record
        const payment = await prisma_1.prisma.payment.findUnique({
            where: { id: paymentId },
            include: {
                from: true,
                to: true
            }
        });
        if (!payment) {
            return ctx.reply("❌ Payment not found.");
        }
        if (payment.status !== "awaiting_confirmation") {
            return ctx.reply("❌ Payment already processed.");
        }
        if (!confirmed) {
            // Cancel payment
            await prisma_1.prisma.payment.update({
                where: { id: paymentId },
                data: { status: "cancelled" }
            });
            return ctx.reply("❌ Payment cancelled.");
        }
        // Get token info
        const token = await (0, tokens_1.resolveToken)(payment.mint === "So11111111111111111111111111111111111111112" ? "SOL" : payment.mint);
        if (!token) {
            return ctx.reply("❌ Token not found.");
        }
        // Get wallet info
        const payerWallet = await prisma_1.prisma.wallet.findFirst({
            where: {
                address: payment.fromWallet,
                isActive: true
            }
        });
        if (!payerWallet) {
            return ctx.reply("❌ Payer wallet not found.");
        }
        const amountRaw = BigInt(payment.amountRaw);
        const feeRaw = BigInt(payment.feeRaw);
        // @ts-ignore - New fields from schema update
        const serviceFeeRaw = BigInt(payment.serviceFeeRaw || "0");
        // IMPORTANT: Recipient gets the FULL amount, sender pays amount + fees
        const recipientReceives = amountRaw; // Full amount goes to recipient
        // Execute transfer with flexible service fee and notification data
        const result = await (0, transfer_1.executeTransfer)({
            fromWallet: payerWallet,
            toAddress: payment.toWallet,
            mint: token.mint,
            amountRaw: recipientReceives, // Recipient gets full amount
            feeRaw,
            serviceFeeRaw,
            // @ts-ignore - New fields from schema update
            serviceFeeToken: payment.serviceFeeToken || payment.mint,
            token,
            senderTelegramId: payment.from?.telegramId || undefined,
            recipientTelegramId: payment.to?.telegramId || undefined,
            note: payment.note || undefined,
            type: "payment"
        });
        if (result.success) {
            // Update payment status
            await prisma_1.prisma.payment.update({
                where: { id: paymentId },
                data: {
                    status: "sent",
                    txSig: result.signature
                }
            });
            // Send confirmation
            const recipientAmount = Number(recipientReceives) / (10 ** token.decimals);
            const feeAmount = Number(feeRaw) / (10 ** token.decimals);
            const serviceFeeAmount = Number(serviceFeeRaw) / (10 ** token.decimals);
            const totalPaid = Number(amountRaw + feeRaw + serviceFeeRaw) / (10 ** token.decimals);
            const receipt = (0, receipts_1.formatReceipt)({
                from: `@${payment.from?.handle || 'user'}`,
                to: `@${payment.to?.handle || 'user'}`,
                gross: totalPaid,
                fee: feeAmount,
                net: recipientAmount,
                token: token.ticker,
                signature: result.signature,
                note: payment.note || undefined
            });
            // Use standardized payment confirmation message
            const confirmMessageData = {
                amount: recipientAmount.toString(),
                token: token.ticker,
                recipient: `@${payment.to?.handle || 'user'}`,
                explorer_link: (0, message_templates_1.formatExplorerLink)(result.signature || '')
            };
            const successMessage = message_templates_1.messages.dm.payment_sent_confirmation(confirmMessageData);
            await ctx.reply(successMessage, { parse_mode: "Markdown" });
            logger_1.logger.info(`Payment confirmed and sent: ${paymentId}, tx: ${result.signature}`);
            // Send payment notification to recipient
            logger_1.logger.info("Checking notification requirements");
            if (payment.to?.telegramId && payment.from?.handle && result.signature) {
                try {
                    logger_1.logger.info("Sending payment notification");
                    await (0, notifications_simple_1.sendPaymentNotification)(ctx.api, {
                        senderHandle: payment.from.handle,
                        senderName: payment.from.handle,
                        recipientTelegramId: payment.to.telegramId,
                        amount: recipientAmount,
                        tokenTicker: token.ticker,
                        signature: result.signature,
                        note: payment.note || undefined,
                        isNewWallet: false
                    });
                    logger_1.logger.info("Payment notification sent successfully");
                }
                catch (notificationError) {
                    logger_1.logger.error("Failed to send payment notification");
                }
            }
            else {
                logger_1.logger.warn("Payment notification skipped - missing required data");
            }
        }
        else {
            // Update payment as failed
            await prisma_1.prisma.payment.update({
                where: { id: paymentId },
                data: {
                    status: "failed",
                    errorMsg: result.error
                }
            });
            await ctx.reply(`❌ Transfer failed: ${result.error}`);
        }
    }
    catch (error) {
        logger_1.logger.error("Payment confirmation error:", error);
        await ctx.reply("❌ Payment confirmation failed. Please try again.");
    }
}
