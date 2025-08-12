import type { BotContext } from "../bot";
import { Bot, InlineKeyboard } from "grammy";
import { logger } from "../infra/logger";
import { PrismaClient } from "@prisma/client";
import { client as discordClient } from "../discord/bot";

const prisma = new PrismaClient();

export interface PaymentNotificationData {
  senderHandle: string;
  senderName: string;
  recipientTelegramId?: string;
  recipientDiscordId?: string;
  amount: number;
  tokenTicker: string;
  signature: string;
  note?: string;
  isNewWallet?: boolean;
}

export interface ThankYouData {
  senderTelegramId: string;
  recipientTelegramId: string;
  messageType: "reaction" | "message" | "gif";
  content: string;
  originalSignature: string;
}

// Generate Solana Explorer link for transaction
function getSolanaExplorerLink(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

// Send payment notification to recipient (supports both Telegram and Discord)
export async function sendPaymentNotification(
  botApi: any, // Use any instead of Bot type to avoid import issues
  data: PaymentNotificationData
): Promise<void> {
  try {
    const {
      senderHandle,
      senderName,
      recipientTelegramId,
      recipientDiscordId,
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

    // Send to Telegram if recipient has Telegram ID
    if (recipientTelegramId) {
      // Create inline keyboard with reaction options
      const keyboard = new InlineKeyboard()
        .text("❤️ Heart", `react_heart_${signature}`)
        .text("🔥 Fire", `react_fire_${signature}`)
        .row()
        .text("💬 Thank You Message", `thank_message_${signature}`)
        .text("🎁 Send GIF", `thank_gif_${signature}`);

      // Send notification
      await botApi.sendMessage(recipientTelegramId, message, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
        disable_web_page_preview: true
      });

      logger.info("Telegram payment notification sent", {
        sender: senderHandle,
        recipient: recipientTelegramId,
        amount,
        token: tokenTicker,
        signature
      });
    }

    // Send to Discord if recipient has Discord ID
    if (recipientDiscordId) {
      try {
        const discordUser = await discordClient.users.fetch(recipientDiscordId);
        
        // Convert markdown to Discord format
        const discordMessage = message
          .replace(/\*\*(.*?)\*\*/g, '**$1**') // Keep bold
          .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2'); // Convert links
        
        await discordUser.send(discordMessage);
        
        logger.info("Discord payment notification sent", {
          sender: senderHandle,
          recipient: recipientDiscordId,
          amount,
          token: tokenTicker,
          signature
        });
      } catch (discordError) {
        logger.error("Failed to send Discord notification", discordError);
      }
    }

  } catch (error) {
    logger.error("Failed to send payment notification", error);
  }
}
      disable_web_page_preview: false
    });

    logger.info("Payment notification sent", {
      recipient: recipientTelegramId,
      sender: senderHandle,
      amount,
      token: tokenTicker,
      signature
    });

  } catch (error) {
    logger.error("Failed to send payment notification", {
      error: error instanceof Error ? error.message : "Unknown error",
      recipient: data.recipientTelegramId,
      signature: data.signature
    });
  }
}

// Handle reaction button presses
export async function handleReactionCallback(ctx: BotContext): Promise<void> {
  try {
    if (!ctx.callbackQuery?.data) return;
    
    const data = ctx.callbackQuery.data;
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    // Parse callback data: react_type_signature
    const [action, reactionType, signature] = data.split('_');
    
    if (action !== 'react') return;

    // Get transaction details to find sender
    const senderMessage = await findTransactionSender(signature);
    if (!senderMessage) {
      await ctx.answerCallbackQuery("❌ Could not find transaction details.");
      return;
    }

    // Send reaction to sender
    const reactionEmoji = reactionType === 'heart' ? '❤️' : '🔥';
    const thankYouMessage = `${reactionEmoji} @${ctx.from?.username || 'Someone'} reacted to your payment! (Transaction: ${signature.slice(0, 8)}...)`;

    await ctx.api.sendMessage(senderMessage.senderTelegramId, thankYouMessage);
    
    // Update button to show it was used
    await ctx.answerCallbackQuery(`${reactionEmoji} Reaction sent!`);
    
    // Log the interaction
    logger.info("Payment reaction sent", {
      from: userId,
      to: senderMessage.senderTelegramId,
      reaction: reactionType,
      signature
    });

  } catch (error) {
    logger.error("Failed to handle reaction", error);
    await ctx.answerCallbackQuery("❌ Failed to send reaction.");
  }
}

// Handle thank you message callback
export async function handleThankYouCallback(ctx: BotContext): Promise<void> {
  try {
    if (!ctx.callbackQuery?.data) return;
    
    const data = ctx.callbackQuery.data;
    const [action, type, signature] = data.split('_');
    
    if (action !== 'thank') return;

    if (type === 'message') {
      // Prompt user to type a thank you message
      await ctx.answerCallbackQuery();
      await ctx.reply(
        `💬 **Send Your Thank You Message**\n\nType your message below and I'll send it to the sender!\n\n*Reply to this message with your thank you note.*`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            force_reply: true,
            input_field_placeholder: "Type your thank you message..."
          }
        }
      );
      
      // Store pending thank you in session or database
      await storePendingThankYou(ctx.from?.id.toString() || '', signature);
      
    } else if (type === 'gif') {
      // Prompt user to send a GIF
      await ctx.answerCallbackQuery();
      await ctx.reply(
        `🎁 **Send a Thank You GIF**\n\nSend any GIF or sticker and I'll forward it to the sender as a thank you!\n\n*Send a GIF or sticker now.*`,
        {
          parse_mode: "Markdown"
        }
      );
      
      // Store pending GIF thank you
      await storePendingThankYou(ctx.from?.id.toString() || '', signature, 'gif');
    }

  } catch (error) {
    logger.error("Failed to handle thank you callback", error);
    await ctx.answerCallbackQuery("❌ Failed to set up thank you.");
  }
}

// Store pending thank you in database
async function storePendingThankYou(
  recipientTelegramId: string, 
  signature: string, 
  type: string = 'message'
): Promise<void> {
  try {
    // Store pending thank you in database
    await prisma.pendingThankYou.upsert({
      where: { recipientTelegramId },
      update: { signature, type },
      create: { recipientTelegramId, signature, type }
    });
    
    logger.info("Stored pending thank you", {
      recipient: recipientTelegramId,
      signature,
      type
    });
    
  } catch (error) {
    logger.error("Failed to store pending thank you", error);
  }
}

// Find transaction sender details
async function findTransactionSender(signature: string): Promise<{ senderTelegramId: string } | null> {
  try {
    // In a real implementation, you'd store transaction metadata in database
    // For now, return a placeholder - this should be enhanced to track transactions
    
    // Query transactions table to find sender
    const transaction = await prisma.transaction.findUnique({
      where: { signature },
      select: { senderTelegramId: true }
    });
    
    if (transaction) {
      return { senderTelegramId: transaction.senderTelegramId };
    }
    
    return null;
    
  } catch (error) {
    logger.error("Failed to find transaction sender", error);
    return null;
  }
}

// Handle thank you message replies
export async function handleThankYouReply(ctx: BotContext): Promise<void> {
  try {
    if (!ctx.message?.reply_to_message || !ctx.message.text) return;
    
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    // Check if this is a reply to a thank you prompt
    const replyText = ctx.message.reply_to_message.text;
    if (!replyText?.includes("Send Your Thank You Message")) return;

    // Get pending thank you
    const pending = await getPendingThankYou(userId);
    if (!pending) {
      await ctx.reply("❌ No pending thank you found.");
      return;
    }

    // Find sender and send thank you
    const senderInfo = await findTransactionSender(pending.signature);
    if (!senderInfo) {
      await ctx.reply("❌ Could not find payment sender.");
      return;
    }

    // Send thank you message to sender
    const thankYouText = `💬 **Thank You Message from @${ctx.from?.username || 'Anonymous'}**\n\n"${ctx.message.text}"\n\n*(Reply to payment: ${pending.signature.slice(0, 8)}...)*`;
    
    await ctx.api.sendMessage(senderInfo.senderTelegramId, thankYouText, {
      parse_mode: "Markdown"
    });

    // Confirm to recipient
    await ctx.reply("✅ Your thank you message has been sent!");

    // Clean up pending thank you
    await clearPendingThankYou(userId);

    logger.info("Thank you message sent", {
      from: userId,
      to: senderInfo.senderTelegramId,
      signature: pending.signature
    });

  } catch (error) {
    logger.error("Failed to handle thank you reply", error);
    await ctx.reply("❌ Failed to send thank you message.");
  }
}

// Handle GIF/sticker thank you
export async function handleThankYouMedia(ctx: BotContext): Promise<void> {
  try {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    // Check if user has pending GIF thank you
    const pending = await getPendingThankYou(userId);
    if (!pending || pending.type !== 'gif') return;

    // Find sender
    const senderInfo = await findTransactionSender(pending.signature);
    if (!senderInfo) {
      await ctx.reply("❌ Could not find payment sender.");
      return;
    }

    // Forward the media to sender with context
    const caption = `🎁 **Thank You from @${ctx.from?.username || 'Anonymous'}**\n\n*(For payment: ${pending.signature.slice(0, 8)}...)*`;
    
    if (ctx.message?.animation) {
      // GIF
      await ctx.api.sendAnimation(senderInfo.senderTelegramId, ctx.message.animation.file_id, {
        caption,
        parse_mode: "Markdown"
      });
    } else if (ctx.message?.sticker) {
      // Sticker
      await ctx.api.sendSticker(senderInfo.senderTelegramId, ctx.message.sticker.file_id);
      await ctx.api.sendMessage(senderInfo.senderTelegramId, caption, {
        parse_mode: "Markdown"
      });
    } else {
      return; // Not a GIF or sticker
    }

    // Confirm to recipient
    await ctx.reply("✅ Your thank you GIF has been sent!");

    // Clean up pending thank you
    await clearPendingThankYou(userId);

    logger.info("Thank you GIF sent", {
      from: userId,
      to: senderInfo.senderTelegramId,
      signature: pending.signature
    });

  } catch (error) {
    logger.error("Failed to handle thank you media", error);
    await ctx.reply("❌ Failed to send thank you GIF.");
  }
}

// Get pending thank you
async function getPendingThankYou(recipientTelegramId: string): Promise<{ signature: string; type: string } | null> {
  try {
    const result = await prisma.pendingThankYou.findFirst({
      where: { 
        recipientTelegramId,
        createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } // Last 10 minutes
      },
      orderBy: { createdAt: 'desc' }
    });
    
    return result ? { signature: result.signature, type: result.type } : null;
    
  } catch (error) {
    logger.error("Failed to get pending thank you", error);
    return null;
  }
}

// Clear pending thank you
async function clearPendingThankYou(recipientTelegramId: string): Promise<void> {
  try {
    await prisma.pendingThankYou.deleteMany({
      where: { recipientTelegramId }
    });
  } catch (error) {
    logger.error("Failed to clear pending thank you", error);
  }
}