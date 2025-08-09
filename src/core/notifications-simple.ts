import { InlineKeyboard } from "grammy";
import { logger } from "../infra/logger";

export interface PaymentNotificationData {
  senderHandle: string;
  senderName: string;
  recipientTelegramId: string;
  amount: number;
  tokenTicker: string;
  signature: string;
  note?: string;
  isNewWallet?: boolean;
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
      senderName,
      recipientTelegramId,
      amount,
      tokenTicker,
      signature,
      note,
      isNewWallet
    } = data;

    // Create notification message
    let message = `🎉 You've Got ${tokenTicker}!\n\n`;
    message += `From: @${senderHandle}\n`;
    message += `Amount: ${amount} ${tokenTicker}\n`;
    
    if (note) {
      message += `Note: ${note}\n`;
    }
    
    if (isNewWallet) {
      message += `\n✨ Welcome! Your wallet was set up automatically.\n`;
    }
    
    message += `\n🔍 [View Transaction](${getSolanaExplorerLink(signature)})`;

    // Create shorter callback data (Telegram limit is 64 bytes)
    const shortSig = signature.slice(0, 20); // Use first 20 chars of signature
    
    // Create inline keyboard with 4 emoji reactions
    const keyboard = new InlineKeyboard()
      .text("❤️", `react_heart_${shortSig}`)
      .text("🔥", `react_fire_${shortSig}`)
      .text("🙏", `react_pray_${shortSig}`)
      .text("👍", `react_thumbs_${shortSig}`);

    // Send notification and store message ID for reply functionality
    const sentMessage = await botApi.sendMessage(recipientTelegramId, message, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
      disable_web_page_preview: false
    });

    // Note: Removed auto-reply feature as we're keeping it simple with just emoji reactions

    logger.info("Payment notification sent successfully", {
      recipient: recipientTelegramId,
      sender: senderHandle,
      amount,
      token: tokenTicker,
      signature
    });

  } catch (error) {
    logger.error("Failed to send payment notification", {
      error: error instanceof Error ? error.message : String(error),
      recipient: data.recipientTelegramId,
      signature: data.signature
    });
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

      logger.info("Reaction sent to sender", {
        reaction: emoji,
        sender: transaction.senderTelegramId,
        recipient: ctx.from?.id
      });

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