import { InlineKeyboard } from "grammy";
import { logger } from "../infra/logger";
import { messages, formatTimestamp, formatExplorerLink, MessageData } from "./message-templates";

export interface PaymentNotificationData {
  senderHandle: string;
  senderName: string;
  recipientTelegramId: string;
  amount: number;
  tokenTicker: string;
  signature: string;
  note?: string;
  isNewWallet?: boolean;
  type?: 'payment' | 'tip';
}

// Generate Solana Explorer link for transaction
function getSolanaExplorerLink(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

// Send payment notification to recipient (simplified version)
export async function sendPaymentNotification(
  botApi: any,
  data: PaymentNotificationData
): Promise<void> {
  try {
    const {
      senderHandle,
      recipientTelegramId,
      amount,
      tokenTicker,
      signature,
      note,
      isNewWallet,
      type = 'payment'
    } = data;

    // Create standardized notification message using templates
    const messageData: MessageData = {
      amount: amount.toString(),
      token: tokenTicker,
      sender: senderHandle,
      timestamp: formatTimestamp(),
      explorer_link: formatExplorerLink(signature)
    };

    const baseMessage = type === 'tip' 
      ? messages.dm.tip_received(messageData)
      : messages.dm.payment_received(messageData);

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
    const keyboard = new InlineKeyboard()
      .text("❤️", `react_heart_${shortSig}`)
      .text("🔥", `react_fire_${shortSig}`)
      .text("🙏", `react_pray_${shortSig}`)
      .text("👍", `react_thumbs_${shortSig}`);

    await botApi.sendMessage(recipientTelegramId, message, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
      disable_web_page_preview: false
    });

    logger.info(`${type} notification sent successfully`);

  } catch (error) {
    logger.error(`Failed to send ${data.type || 'payment'} notification`);
    throw error;
  }
}

// Enhanced reaction handler with one-reaction-per-payment limit
export async function handleReactionCallback(ctx: any) {
  try {
    const data = ctx.callbackQuery?.data;
    if (!data || !data.startsWith("react_")) return;

    const parts = data.split("_");
    const reaction = parts[1]; // "heart", "fire", "pray", or "thumbs"
    const shortSig = parts.slice(2).join("_");

    const emojiMap: { [key: string]: string } = {
      "heart": "❤️",
      "fire": "🔥", 
      "pray": "🙏",
      "thumbs": "👍"
    };
    const emoji = emojiMap[reaction] || "❤️";
    
    // Find the original transaction to get sender info
    const { PrismaClient } = await import("@prisma/client");
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

      logger.info("Reaction sent to sender");

    } catch (dbError) {
      logger.error("Database error in reaction handler", dbError);
      await ctx.answerCallbackQuery("Failed to send reaction");
    } finally {
      await prisma.$disconnect();
    }

  } catch (error) {
    logger.error("Failed to handle reaction callback", error);
    await ctx.answerCallbackQuery("Failed to send reaction");
  }
}

// Handle already reacted callback (for disabled buttons)
export async function handleAlreadyReacted(ctx: any) {
  await ctx.answerCallbackQuery("You've already reacted to this payment!");
}