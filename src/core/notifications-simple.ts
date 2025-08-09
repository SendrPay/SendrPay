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

    // Send notification
    await botApi.sendMessage(recipientTelegramId, message, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
      disable_web_page_preview: false
    });

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

// Simple reaction handler
export async function handleReactionCallback(ctx: any) {
  try {
    const data = ctx.callbackQuery?.data;
    if (!data || !data.startsWith("react_")) return;

    const parts = data.split("_");
    const reaction = parts[1]; // "heart" or "fire"
    const signature = parts.slice(2).join("_");

    const emoji = reaction === "heart" ? "❤️" : "🔥";
    
    await ctx.answerCallbackQuery(`${emoji} Reaction sent!`);
    
    logger.info("Payment reaction handled", {
      reaction,
      signature,
      user: ctx.from?.id
    });

  } catch (error) {
    logger.error("Failed to handle reaction callback", error);
    await ctx.answerCallbackQuery("Failed to send reaction");
  }
}

// Simple thank you handler
export async function handleThankYouCallback(ctx: any) {
  try {
    const data = ctx.callbackQuery?.data;
    if (!data || !data.startsWith("thank_")) return;

    const parts = data.split("_");
    const type = parts[1]; // "msg" or "gif"
    const shortSig = parts.slice(2).join("_");

    if (type === "msg") {
      await ctx.answerCallbackQuery("Send your thank you message as a reply to this notification!");
    } else if (type === "gif") {
      await ctx.answerCallbackQuery("Send a GIF or sticker as a reply to this notification!");
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

// Placeholder handlers for reply messages
export async function handleThankYouReply(ctx: any) {
  // Simple acknowledgment for now
  await ctx.reply("Thank you message received! 💝");
}

export async function handleThankYouMedia(ctx: any) {
  // Simple acknowledgment for now  
  await ctx.reply("Thank you GIF/sticker received! 🎉");
}