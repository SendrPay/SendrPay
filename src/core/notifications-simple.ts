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
    let message = `💰 **Payment Received!**\n\n`;
    message += `**From:** @${senderHandle} (${senderName})\n`;
    message += `**Amount:** ${amount} ${tokenTicker}\n`;
    
    if (note) {
      message += `**Note:** ${note}\n`;
    }
    
    if (isNewWallet) {
      message += `\n🎉 Welcome! Your wallet was automatically set up to receive this payment.\n`;
    }
    
    message += `\n**Transaction:** [View on Solana Explorer](${getSolanaExplorerLink(signature)})`;

    // Create shorter callback data (Telegram limit is 64 bytes)
    const shortSig = signature.slice(0, 20); // Use first 20 chars of signature
    
    // Create inline keyboard with reaction options
    const keyboard = new InlineKeyboard()
      .text("❤️ Heart", `react_heart_${shortSig}`)
      .text("🔥 Fire", `react_fire_${shortSig}`)
      .row()
      .text("💬 Thank You Message", `thank_msg_${shortSig}`)
      .text("🎁 Send GIF", `thank_gif_${shortSig}`);

    // Send notification and store message ID for reply functionality
    const sentMessage = await botApi.sendMessage(recipientTelegramId, message, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
      disable_web_page_preview: false
    });

    // Send a follow-up message for easy replying (like trading bots do)
    await botApi.sendMessage(recipientTelegramId, 
      "💬 Reply to this message to send a thank you note to the sender!", 
      {
        reply_to_message_id: sentMessage.message_id,
        reply_markup: {
          force_reply: true,
          input_field_placeholder: "Type your thank you message here..."
        }
      }
    );

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

// Enhanced reaction handler that sends reaction to original sender
export async function handleReactionCallback(ctx: any) {
  try {
    const data = ctx.callbackQuery?.data;
    if (!data || !data.startsWith("react_")) return;

    const parts = data.split("_");
    const reaction = parts[1]; // "heart" or "fire"
    const shortSig = parts.slice(2).join("_");

    const emoji = reaction === "heart" ? "❤️" : "🔥";
    
    // Acknowledge the reaction
    await ctx.answerCallbackQuery(`${emoji} Reaction sent to sender!`);
    
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

      if (transaction && transaction.senderTelegramId) {
        // Send reaction notification to original sender
        const reactionMessage = `${emoji} **Payment Reaction Received!**\n\n` +
          `@${ctx.from?.username || 'Someone'} reacted to your payment with ${emoji}\n` +
          `**Amount:** ${Number(transaction.amount) / Math.pow(10, 9)} ${transaction.tokenTicker}`;

        await ctx.api.sendMessage(transaction.senderTelegramId, reactionMessage, {
          parse_mode: "Markdown"
        });

        logger.info("Reaction sent to sender", {
          reaction: emoji,
          sender: transaction.senderTelegramId,
          recipient: ctx.from?.id
        });
      }
    } catch (dbError) {
      logger.error("Database error in reaction handler", dbError);
    } finally {
      await prisma.$disconnect();
    }

  } catch (error) {
    logger.error("Failed to handle reaction callback", error);
    await ctx.answerCallbackQuery("Failed to send reaction");
  }
}

// Enhanced thank you handler
export async function handleThankYouCallback(ctx: any) {
  try {
    const data = ctx.callbackQuery?.data;
    if (!data || !data.startsWith("thank_")) return;

    const parts = data.split("_");
    const type = parts[1]; // "msg" or "gif"
    const shortSig = parts.slice(2).join("_");

    if (type === "msg") {
      // Create a highlighted reply prompt like trading bots
      await ctx.api.sendMessage(ctx.from?.id, 
        "💬 **Send Your Thank You Message**\n\nReply to this message with your thank you note:", 
        {
          parse_mode: "Markdown",
          reply_markup: {
            force_reply: true,
            input_field_placeholder: "Type your thank you message..."
          }
        }
      );
      await ctx.answerCallbackQuery("Thank you message prompt sent!");
    } else if (type === "gif") {
      await ctx.api.sendMessage(ctx.from?.id,
        "🎁 **Send a GIF or Sticker**\n\nReply to this message with a GIF or sticker:",
        {
          parse_mode: "Markdown", 
          reply_markup: {
            force_reply: true,
            input_field_placeholder: "Send a GIF or sticker..."
          }
        }
      );
      await ctx.answerCallbackQuery("GIF/sticker prompt sent!");
    }
    
    logger.info("Thank you callback handled", {
      type,
      shortSig,
      user: ctx.from?.id
    });

  } catch (error) {
    logger.error("Failed to handle thank you callback", error);
    await ctx.answerCallbackQuery("Failed to set up thank you message");
  }
}

// Enhanced reply handlers that send thank you messages to original sender
export async function handleThankYouReply(ctx: any) {
  try {
    if (!ctx.message?.reply_to_message || !ctx.message?.text) return;

    const thankYouText = ctx.message.text;
    const senderUsername = ctx.from?.username;
    
    // Find recent transaction where this user was the recipient
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    
    try {
      const transaction = await prisma.transaction.findFirst({
        where: {
          recipientTelegramId: ctx.from?.id?.toString()
        },
        orderBy: { createdAt: 'desc' }
      });

      if (transaction && transaction.senderTelegramId) {
        // Send thank you message to original sender
        const message = `💝 **Thank You Message Received!**\n\n` +
          `**From:** @${senderUsername || 'Someone'}\n` +
          `**Message:** "${thankYouText}"\n\n` +
          `*This is a thank you for your recent payment of ${Number(transaction.amount) / Math.pow(10, 9)} ${transaction.tokenTicker}*`;

        await ctx.api.sendMessage(transaction.senderTelegramId, message, {
          parse_mode: "Markdown"
        });

        await ctx.reply("✅ Thank you message sent to the sender! 💝");
        
        logger.info("Thank you message forwarded to sender", {
          sender: transaction.senderTelegramId,
          recipient: ctx.from?.id,
          message: thankYouText
        });
      } else {
        await ctx.reply("❌ Couldn't find the original payment to send thank you message.");
      }
    } catch (dbError) {
      logger.error("Database error in thank you reply", dbError);
      await ctx.reply("❌ Failed to send thank you message.");
    } finally {
      await prisma.$disconnect();
    }

  } catch (error) {
    logger.error("Failed to handle thank you reply", error);
    await ctx.reply("❌ Failed to process thank you message.");
  }
}

export async function handleThankYouMedia(ctx: any) {
  try {
    if (!ctx.message?.reply_to_message) return;
    
    const isGif = !!ctx.message?.animation;
    const isSticker = !!ctx.message?.sticker;
    
    if (!isGif && !isSticker) return;

    const senderUsername = ctx.from?.username;
    
    // Find recent transaction where this user was the recipient
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    
    try {
      const transaction = await prisma.transaction.findFirst({
        where: {
          recipientTelegramId: ctx.from?.id?.toString()
        },
        orderBy: { createdAt: 'desc' }
      });

      if (transaction && transaction.senderTelegramId) {
        // Send thank you message to original sender
        const message = `🎉 **Thank You ${isGif ? 'GIF' : 'Sticker'} Received!**\n\n` +
          `**From:** @${senderUsername || 'Someone'}\n\n` +
          `*This is a thank you for your recent payment of ${Number(transaction.amount) / Math.pow(10, 9)} ${transaction.tokenTicker}*`;

        // Forward the GIF/sticker first
        if (isGif && ctx.message.animation) {
          await ctx.api.sendAnimation(transaction.senderTelegramId, ctx.message.animation.file_id);
        } else if (isSticker && ctx.message.sticker) {
          await ctx.api.sendSticker(transaction.senderTelegramId, ctx.message.sticker.file_id);
        }
        
        // Then send the explanation message
        await ctx.api.sendMessage(transaction.senderTelegramId, message, {
          parse_mode: "Markdown"
        });

        await ctx.reply(`✅ Thank you ${isGif ? 'GIF' : 'sticker'} sent to the sender! 🎉`);
        
        logger.info("Thank you media forwarded to sender", {
          sender: transaction.senderTelegramId,
          recipient: ctx.from?.id,
          type: isGif ? 'gif' : 'sticker'
        });
      } else {
        await ctx.reply("❌ Couldn't find the original payment to send thank you message.");
      }
    } catch (dbError) {
      logger.error("Database error in thank you media", dbError);
      await ctx.reply("❌ Failed to send thank you message.");
    } finally {
      await prisma.$disconnect();
    }

  } catch (error) {
    logger.error("Failed to handle thank you media", error);
    await ctx.reply("❌ Failed to process thank you message.");
  }
}