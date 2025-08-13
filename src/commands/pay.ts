import type { BotContext } from "../bot";
import { prisma } from "../infra/prisma";
import { parsePayCommand } from "../core/parse";
import { resolveUserCrossPlatform } from "../core/cross-platform-resolver";
import { resolveToken } from "../core/tokens";
import { calculateFee, generateFeeConfirmationMessage } from "../core/fees";
import { executeTransfer } from "../core/transfer";
import { createEscrow } from "../core/escrow";
import { formatReceipt } from "../core/receipts";
import { checkRateLimit } from "../core/ratelimit";
import { generateClientIntentId } from "../core/idempotency";
import { sendPaymentNotification } from "../core/notifications-simple";
import { logger } from "../infra/logger";
import { v4 as uuidv4 } from "uuid";
import { messages, formatTimestamp, formatExplorerLink, MessageData } from "../core/message-templates";

export async function commandPay(ctx: BotContext) {
  const chat = ctx.chat;
  if (!chat) {
    return ctx.reply("❌ Could not identify chat.");
  }

  // Handle group payments differently than DM payments
  const isGroupChat = chat.type !== "private";

  try {
    // Check if group chat is whitelisted (skip for DMs)
    if (isGroupChat) {
      const chatRecord = await prisma.chat.findUnique({
        where: { chatId: chat.id.toString() }
      });

      if (!chatRecord?.whitelisted) {
        return ctx.reply("❌ Bot not enabled. Admins: use /enable first.");
      }
    }

    // Rate limiting
    const rateLimitKey = `${chat.id}:${ctx.from?.id}`;
    if (!checkRateLimit(rateLimitKey)) {
      return ctx.reply("⏰ Rate limit exceeded. Please wait before sending again.");
    }

    // Parse command
    const parsed = await parsePayCommand(ctx);
    if (!parsed) {
      return ctx.reply("❌ Usage: \`/pay @username amount TOKEN [note]\`\nCross-platform: \`/pay discord:username amount TOKEN\` or \`/pay telegram:username amount TOKEN\`", { parse_mode: "Markdown" });
    }

    const { payeeId, payeeHandle, targetPlatform, amount, tokenTicker, note } = parsed;

    // Username verification: payments only succeed when directed to verified usernames
    if (!payeeHandle) {
      return ctx.reply("❌ Specify recipient username: \`/pay @username amount TOKEN\`", { parse_mode: "Markdown" });
    }

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

    // Determine current platform - check if this is from Discord via context indicator
    const currentPlatform = ctx.from?.username === "discord_context" ? "discord" : "telegram";
    
    let payer;
    if (currentPlatform === "discord") {
      // Use the same robust user detection as balance command
      const { getOrCreateUserByDiscordId } = await import("../core/shared");
      payer = await getOrCreateUserByDiscordId(payerId);
    } else {
      payer = await prisma.user.findUnique({
        where: { telegramId: payerId },
        include: { wallets: { where: { isActive: true } } }
      });
    }

    // Enhanced wallet detection for Discord users (same as balance command)
    let payerWallet = payer?.wallets && payer.wallets.length > 0 ? payer.wallets[0] : null;
    if (!payerWallet && currentPlatform === "discord") {
      payerWallet = await prisma.wallet.findFirst({
        where: { 
          userId: payer?.id,
          isActive: true 
        }
      });
    }

    if (!payer || !payerWallet) {
      return ctx.reply("❌ Create wallet first: DM me with \`/start\`", { parse_mode: "Markdown" });
    }

    // payerWallet is already defined above with enhanced detection

    // Calculate fees with flexible service fee system
    const feeCalc = await calculateFee(amountRaw, token.mint);
    const feeRaw = feeCalc.feeRaw;
    const serviceFeeRaw = feeCalc.serviceFeeRaw;
    const serviceFeeToken = feeCalc.serviceFeeToken;
    const netRaw = feeCalc.netRaw;

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

    // Debug: Log the search parameters
    logger.info("Payment recipient search");
    
    // Cross-platform user resolution
    const resolvedPayee = await resolveUserCrossPlatform(payeeHandle, targetPlatform || null, currentPlatform);
    
    if (!resolvedPayee) {
      logger.warn("Recipient not found");
      if (targetPlatform) {
        return ctx.reply(`❌ User @${payeeHandle} not found on ${targetPlatform}. They need to start the bot to register.`);
      } else {
        return ctx.reply(`❌ User @${payeeHandle} not found. They need to start the bot to register their username.`);
      }
    }
    
    logger.info("Recipient resolved");

    // Get full user details with wallets
    const payee = await prisma.user.findUnique({
      where: { id: resolvedPayee.id },
      include: { wallets: { where: { isActive: true } } }
    });

    if (!payee) {
      return ctx.reply(`❌ User @${payeeHandle} not found.`);
    }

    const payeeWallet = payee.wallets[0];
    if (!payeeWallet) {
      return ctx.reply(`❌ User @${payeeHandle} needs to create a wallet first.`);
    }

    // Show cross-platform payment info if applicable
    let platformInfo = "";
    if (targetPlatform && targetPlatform !== currentPlatform) {
      platformInfo = ` (${targetPlatform} user)`;
    }

    // Show payment confirmation using message templates
    const recipientReceives = Number(amountRaw) / (10 ** token.decimals);
    const transactionFee = Number(feeRaw) / (10 ** token.decimals);
    const serviceFeeAmount = Number(serviceFeeRaw) / (10 ** token.decimals);
    const totalYouPay = Number(amountRaw + feeRaw + serviceFeeRaw) / (10 ** token.decimals);
    
    // Get service fee confirmation message
    const serviceFeeMessage = await generateFeeConfirmationMessage(amountRaw, token.mint, token);
    
    // Use standardized payment confirmation template
    const messageData: MessageData = {
      recipient: `@${payeeHandle}${platformInfo}`,
      amount: recipientReceives.toString(),
      token: token.ticker,
      network_fee: `${transactionFee} ${token.ticker}`,
      service_fee: serviceFeeMessage,
      total: `${totalYouPay} ${token.ticker}`,
      note: note || undefined
    };

    const confirmationText = messages.dm.payment_confirmation(messageData);

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
    const payment = await prisma.payment.create({
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

  } catch (error) {
    logger.error("Pay command error:", error);
    await ctx.reply("❌ Payment failed. Please try again.");
  }
}

export async function handlePaymentConfirmation(ctx: BotContext, confirmed: boolean) {
  try {
    const paymentId = ctx.callbackQuery?.data?.split('_')[2];
    if (!paymentId) {
      return ctx.reply("❌ Invalid payment confirmation.");
    }

    // Get payment record
    const payment = await prisma.payment.findUnique({
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
      await prisma.payment.update({
        where: { id: paymentId },
        data: { status: "cancelled" }
      });
      return ctx.reply("❌ Payment cancelled.");
    }

    // Get token info
    const token = await resolveToken(payment.mint === "So11111111111111111111111111111111111111112" ? "SOL" : payment.mint);
    if (!token) {
      return ctx.reply("❌ Token not found.");
    }

    // Get wallet info
    const payerWallet = await prisma.wallet.findFirst({
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
    const result = await executeTransfer({
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
      await prisma.payment.update({
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

      const receipt = formatReceipt({
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
      const confirmMessageData: MessageData = {
        amount: recipientAmount.toString(),
        token: token.ticker,
        recipient: `@${payment.to?.handle || 'user'}`,
        explorer_link: formatExplorerLink(result.signature || '')
      };
      
      const successMessage = messages.dm.payment_sent_confirmation(confirmMessageData);
      await ctx.reply(successMessage, { parse_mode: "Markdown" });
      logger.info(`Payment confirmed and sent: ${paymentId}, tx: ${result.signature}`);

      // Send payment notification to recipient
      logger.info("Checking notification requirements");

      if ((payment.to?.telegramId || payment.to?.discordId) && payment.from?.handle && result.signature) {
        try {
          logger.info("Sending payment notification");

          await sendPaymentNotification(ctx.api, {
            senderHandle: payment.from.handle,
            senderName: payment.from.handle,
            recipientTelegramId: payment.to.telegramId || undefined,
            recipientDiscordId: payment.to.discordId || undefined,
            amount: recipientAmount,
            tokenTicker: token.ticker,
            signature: result.signature,
            note: payment.note || undefined,
            isNewWallet: false
          });
          
          logger.info("Payment notification sent successfully");
        } catch (notificationError) {
          logger.error("Failed to send payment notification");
        }
      } else {
        logger.warn("Payment notification skipped - missing required data");
      }
    } else {
      // Update payment as failed
      await prisma.payment.update({
        where: { id: paymentId },
        data: { 
          status: "failed",
          errorMsg: result.error
        }
      });
      await ctx.reply(`❌ Transfer failed: ${result.error}`);
    }

  } catch (error) {
    logger.error("Payment confirmation error:", error);
    await ctx.reply("❌ Payment confirmation failed. Please try again.");
  }
}
