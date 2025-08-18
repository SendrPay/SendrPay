import { InlineKeyboard } from "grammy";
import { BotContext } from "../bot";
import { prisma } from "../infra/prisma";
import { logger } from "../infra/logger";

// Command for KOLs to post group join messages to channels
export async function commandKolPost(ctx: BotContext) {
  try {
    if (ctx.chat?.type !== "private") {
      return ctx.reply("❌ Use this command in DM only.");
    }

    const userId = ctx.from?.id?.toString();
    if (!userId) return;

    // Get KOL user and settings
    const user = await prisma.user.findUnique({
      where: { telegramId: userId },
      include: { kolSettings: true }
    });

    if (!user) {
      return ctx.reply("❌ Please create a wallet first using /start");
    }

    if (!user.kolSettings?.groupAccessEnabled || !user.kolSettings.privateGroupChatId) {
      return ctx.reply(
        "❌ **Group Access Not Configured**\n\n" +
        "You need to set up group access first:\n" +
        "1. Use `/setup` to configure your KOL settings\n" +
        "2. Enable group access and set a price\n" +
        "3. Link your private group using `/linkgroup`",
        { parse_mode: "Markdown" }
      );
    }

    const price = convertFromRawUnits(user.kolSettings.groupAccessPrice!, user.kolSettings.groupAccessToken!);
    
    // Create the join group message with inline button
    const keyboard = new InlineKeyboard()
      .text(`💎 Join for ${price} ${user.kolSettings.groupAccessToken}`, `group_join:${userId}`)
      .row()
      .text(`💖 Tip @${user.handle}`, `tip_select:${userId}`);

    const groupMessageText = 
      `🎭 **Exclusive Private Group Access**\n\n` +
      `Join @${user.handle || 'this KOL'}'s exclusive private community!\n\n` +
      `✨ **What you get:**\n` +
      `• Direct access to premium content\n` +
      `• Interact with the community\n` +
      `• Exclusive discussions and insights\n` +
      `• Early access to announcements\n\n` +
      `💰 **Price:** ${price} ${user.kolSettings.groupAccessToken}\n` +
      `🔒 **Private & Exclusive** - Limited access\n\n` +
      `Click below to join instantly!`;

    // Ask where to post
    const postKeyboard = new InlineKeyboard()
      .text("📢 Post to Channel", `post_to_channel:${userId}`)
      .text("👥 Post to Group", `post_to_group:${userId}`)
      .row()
      .text("📋 Copy Message", `copy_message:${userId}`)
      .text("❌ Cancel", "cancel_post");

    await ctx.reply(
      `📢 **Post Group Join Message**\n\n` +
      `Your join message is ready! Where would you like to post it?\n\n` +
      `**Preview:**\n${groupMessageText.substring(0, 200)}...\n\n` +
      `Choose posting option:`,
      {
        parse_mode: "Markdown",
        reply_markup: postKeyboard
      }
    );

    // Store the message for posting with better session management
    ctx.session = ctx.session || {};
    (ctx.session as any).groupMessage = {
      text: groupMessageText,
      keyboard: keyboard,
      userId: userId,
      timestamp: Date.now() // Add timestamp for session validation
    };

  } catch (error) {
    logger.error("Error in KOL post command:", error);
    await ctx.reply("❌ Error creating group message. Please try again.");
  }
}

// Handle channel input for posting
export async function handleKolPostChannelInput(ctx: BotContext) {
  try {
    const session = ctx.session as any;
    const awaitingInput = session?.awaitingChannelInput;
    
    if (!awaitingInput || awaitingInput.type !== 'post_group_message') {
      return; // Not our handler
    }

    const channelInput = ctx.message?.text?.trim();
    if (!channelInput) {
      return ctx.reply("❌ Please provide a valid channel username or ID.");
    }

    const groupMessage = awaitingInput.message;
    if (!groupMessage) {
      return ctx.reply("❌ Message session expired. Please try again.");
    }

    try {
      // Try to post to the channel
      let chatId = channelInput;
      if (channelInput.startsWith("@")) {
        chatId = channelInput; // Username format
      } else if (!chatId.startsWith("-")) {
        chatId = "@" + channelInput; // Add @ if missing
      }

      await ctx.api.sendMessage(
        chatId,
        groupMessage.text,
        {
          parse_mode: "Markdown",
          reply_markup: groupMessage.keyboard
        }
      );

      await ctx.reply(
        `✅ **Message Posted Successfully!**\n\n` +
        `Your group join message has been posted to ${channelInput}.\n\n` +
        `Users can now click the join button to access your private group!`,
        { parse_mode: "Markdown" }
      );

      // Clear the session
      delete session.awaitingChannelInput;

    } catch (postError: any) {
      logger.error("Error posting to channel:", postError);
      
      let errorMessage = "❌ **Posting Failed**\n\n";
      
      if (postError.error_code === 403) {
        errorMessage += "I don't have permission to post in that channel.\n\n" +
                      "Please:\n" +
                      "1. Add me as an admin to the channel\n" +
                      "2. Give me 'Post Messages' permission\n" +
                      "3. Try again";
      } else if (postError.error_code === 400) {
        errorMessage += "Channel not found or invalid.\n\n" +
                      "Please check:\n" +
                      "1. Channel username is correct (e.g., @mychannel)\n" +
                      "2. Channel exists and is public\n" +
                      "3. Try again with correct username";
      } else {
        errorMessage += `Error: ${postError.description || postError.message}\n\n` +
                      "Please check the channel settings and try again.";
      }

      await ctx.reply(errorMessage, { parse_mode: "Markdown" });
    }

  } catch (error) {
    logger.error("Error handling channel input:", error);
    await ctx.reply("❌ Error processing channel input. Please try again.");
  }
}

// Utility function
function convertFromRawUnits(rawAmount: string, token: string): number {
  const decimals: Record<string, number> = {
    "USDC": 6,
    "SOL": 9,
    "BONK": 5,
    "JUP": 6
  };
  
  const decimal = decimals[token] || 6;
  return parseFloat(rawAmount) / Math.pow(10, decimal);
}