import type { BotContext } from "../bot";
import { prisma } from "../infra/prisma";
import { parsePayCommand } from "../core/parse";
import { resolveToken } from "../core/tokens";
import { calculateFee, generateFeeConfirmationMessage } from "../core/fees";
import { executeTransfer } from "../core/transfer";
import { createEscrow, sendEscrowNotification, sendRecipientEscrowDM } from "../core/escrow";
import { formatReceipt } from "../core/receipts";
import { checkRateLimit } from "../core/ratelimit";
import { generateClientIntentId } from "../core/idempotency";
import { sendPaymentNotification } from "../core/notifications-simple";
import { logger } from "../infra/logger";
import { v4 as uuidv4 } from "uuid";

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
      return ctx.reply("❌ Usage: \`/pay @username amount TOKEN [note]\`", { parse_mode: "Markdown" });
    }

    const { payeeId, payeeHandle, amount, tokenTicker, note } = parsed;

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

    const payer = await prisma.user.findUnique({
      where: { telegramId: payerId },
      include: { wallets: { where: { isActive: true } } }
    });

    if (!payer || !payer.wallets[0]) {
      return ctx.reply("❌ Create wallet first: DM me with \`/start\`", { parse_mode: "Markdown" });
    }

    const payerWallet = payer.wallets[0];

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

    // Username verification: Find user by their actual Telegram handle only
    // Look up user by their verified Telegram handle (case-insensitive like Telegram)
    const payee = await prisma.user.findFirst({
      where: { 
        handle: {
          equals: payeeHandle,
          mode: 'insensitive' // Case-insensitive matching like Telegram
        }
      },
      include: { wallets: { where: { isActive: true } } }
    });

    // Check if recipient has signed up and has a wallet
    const isEscrowPayment = !payee || !payee.wallets[0];
    let payeeWallet = payee?.wallets[0];

    // For display purposes
    const recipientReceives = Number(amountRaw) / (10 ** token.decimals);
    const transactionFee = Number(feeRaw) / (10 ** token.decimals);
    const serviceFeeAmount = Number(serviceFeeRaw) / (10 ** token.decimals);
    const totalYouPay = Number(amountRaw + feeRaw + serviceFeeRaw) / (10 ** token.decimals);
    
    // Get service fee confirmation message
    const serviceFeeMessage = await generateFeeConfirmationMessage(amountRaw, token.mint, token);
    
    let confirmationText: string;
    
    if (isEscrowPayment) {
      // Show escrow confirmation
      confirmationText = `💸 **Confirm Payment (Escrow)**

**To:** @${payeeHandle} ${!payee ? '(not signed up)' : '(no wallet)'}
**Amount:** ${recipientReceives} ${token.ticker}
${note ? `**Note:** ${note}\n` : ''}
**Network Fee:** ${transactionFee} ${token.ticker}
**Service Fee:** ${serviceFeeMessage}

**Total:** ${totalYouPay} ${token.ticker}

⏳ **This will go to escrow** since @${payeeHandle} hasn't signed up with the bot yet. They'll be notified to claim within 7 days.

Proceed with escrow payment?`;
    } else {
      // Strict verification: the handle must exactly match their registered Telegram username
      if (payee.handle?.toLowerCase() !== payeeHandle.toLowerCase()) {
        return ctx.reply(`❌ Username verification failed. This user's verified handle is @${payee.handle}.`);
      }

      // Show direct payment confirmation
      confirmationText = `💸 **Confirm Payment**

**To:** @${payeeHandle}
**Amount:** ${recipientReceives} ${token.ticker}
${note ? `**Note:** ${note}\n` : ''}
**Network Fee:** ${transactionFee} ${token.ticker}
**Service Fee:** ${serviceFeeMessage}

**Total:** ${totalYouPay} ${token.ticker}

Proceed with payment?`;
    }

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
        toUserId: payee?.id || null,
        fromWallet: payerWallet.address,
        toWallet: payeeWallet?.address || 'ESCROW_PENDING',
        mint: token.mint,
        amountRaw: amountRaw.toString(),
        feeRaw: feeRaw.toString(),
        serviceFeeRaw: serviceFeeRaw.toString(),
        serviceFeeToken,
        note,
        status: isEscrowPayment ? "awaiting_escrow_confirmation" : "awaiting_confirmation"
      }
    });

    // Store metadata for escrow handling
    if (isEscrowPayment) {
      // We'll need this info when processing the confirmation
      const metadata = {
        isEscrow: true,
        payeeHandle,
        payeeTid: payeeId
      };
      // In production, store this in Redis or a separate table
      // For now, we'll handle it in the confirmation handler
    }

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

    if (payment.status !== "awaiting_confirmation" && payment.status !== "awaiting_escrow_confirmation") {
      return ctx.reply("❌ Payment already processed.");
    }

    const isEscrowPayment = payment.status === "awaiting_escrow_confirmation";

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
    const serviceFeeRaw = BigInt(payment.serviceFeeRaw || "0");
    
    if (isEscrowPayment) {
      // Create escrow instead of direct transfer
      const escrowResult = await createEscrow({
        paymentId: payment.id,
        chatId: payment.chatId || undefined,
        payerWallet: payment.fromWallet,
        payerTelegramId: payment.from?.telegramId || undefined,
        payeeHandle: 'unknown', // Will be extracted from payment context
        payeeTid: payment.to?.telegramId || undefined,
        mint: token.mint,
        amountRaw,
        feeRaw,
        serviceFeeRaw,
        serviceFeeToken: payment.serviceFeeToken || payment.mint,
        note: payment.note || undefined,
        type: "payment"
      });

      if (!escrowResult.success) {
        await prisma.payment.update({
          where: { id: paymentId },
          data: { status: "failed", errorMsg: escrowResult.error }
        });
        return ctx.reply(`❌ Escrow creation failed: ${escrowResult.error}`);
      }

      // Update payment status to escrow created
      await prisma.payment.update({
        where: { id: paymentId },
        data: { 
          status: "escrowed",
          txSig: escrowResult.escrowId // Store escrow ID instead of tx signature
        }
      });

      const amount = Number(amountRaw) / (10 ** token.decimals);
      
      // Send group notification about escrow
      if (payment.chatId) {
        await sendEscrowNotification(
          ctx,
          payment.chatId,
          escrowResult.escrowId!,
          amount,
          token.ticker,
          'recipient', // We need to extract this from context  
          payment.from?.handle || 'sender',
          payment.note || undefined
        );
      }

      // Send DM to recipient if we have their Telegram ID
      if (payment.to?.telegramId) {
        await sendRecipientEscrowDM(
          ctx,
          payment.to.telegramId,
          escrowResult.escrowId!,
          amount,
          token.ticker,
          payment.from?.handle || 'Someone',
          payment.note || undefined
        );
      }

      await ctx.reply(`✅ **Escrow Created**

Your payment of **${amount.toFixed(4)} ${token.ticker}** has been placed in escrow. The recipient will be notified to claim it within 7 days.

**Escrow ID:** \`${escrowResult.escrowId}\``, { parse_mode: "Markdown" });

      return;
    }

    // Regular direct payment flow
    const recipientReceives = amountRaw; // Full amount goes to recipient

    // Execute transfer with flexible service fee and notification data
    const result = await executeTransfer({
      fromWallet: payerWallet,
      toAddress: payment.toWallet,
      mint: token.mint,
      amountRaw: recipientReceives, // Recipient gets full amount
      feeRaw,
      serviceFeeRaw,
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

      await ctx.reply(`✅ **Payment Sent**\n\n${receipt}`, { parse_mode: "Markdown" });
      logger.info(`Payment confirmed and sent: ${paymentId}, tx: ${result.signature}`);

      // Send payment notification to recipient
      logger.info("Checking notification requirements");

      if (payment.to?.telegramId && payment.from?.handle && result.signature) {
        try {
          logger.info("Sending payment notification");

          await sendPaymentNotification(ctx.api, {
            senderHandle: payment.from.handle,
            senderName: payment.from.handle,
            recipientTelegramId: payment.to.telegramId,
            amount: recipientAmount,
            tokenTicker: token.ticker,
            signature: result.signature,
            note: payment.note || undefined,
            isNewWallet: false
          });
          
          logger.info("Payment notification sent successfully");
        } catch (notificationError) {
          logger.error("Failed to send payment notification", notificationError);
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
