import { Context } from "grammy";
import { prisma } from "../db/prisma";
import { InlineKeyboard } from "grammy";

interface SessionData {
  channelVerification?: {
    step: 'username' | 'verifying' | 'pricing';
    channelUsername?: string;
    channelId?: string;
  };
}

type BotContext = Context & {
  session: SessionData;
};

export async function handleChannelVerification(ctx: BotContext) {
  const text = ctx.message?.text?.trim();
  const userId = ctx.from?.id.toString();
  
  if (!text || !userId) return;
  
  // Remove @ if user included it
  const channelUsername = text.replace('@', '').toLowerCase();
  
  ctx.session.channelVerification = {
    step: 'verifying',
    channelUsername
  };
  
  await ctx.reply("🔍 Verifying channel access...");
  
  try {
    // Try to get chat info to verify bot is admin
    const chat = await ctx.api.getChat(`@${channelUsername}`);
    
    if (chat.type !== 'channel') {
      await ctx.reply(
        "❌ This doesn't appear to be a channel.\n\n" +
        "Please make sure you're providing a channel username, not a group or user.",
        {
          reply_markup: new InlineKeyboard()
            .text("🔄 Try Again", "channel_start_verification")
            .text("❌ Cancel", "cancel_verification")
        }
      );
      return;
    }
    
    // Try to get bot's member status in the channel
    try {
      const botMember = await ctx.api.getChatMember(chat.id, ctx.me.id);
      
      if (botMember.status !== 'administrator') {
        await ctx.reply(
          "❌ **Bot is not an admin**\n\n" +
          "I'm not an administrator in @" + channelUsername + "\n\n" +
          "Please:\n" +
          "1. Go to your channel settings\n" +
          "2. Add me as an administrator\n" +
          "3. Grant 'Post messages' permission\n" +
          "4. Try verification again",
          {
            parse_mode: "Markdown",
            reply_markup: new InlineKeyboard()
              .text("🔄 Try Again", "channel_start_verification")
              .text("❌ Cancel", "cancel_verification")
          }
        );
        return;
      }
      
      // Check if bot has post permission
      if (!botMember.can_post_messages) {
        await ctx.reply(
          "⚠️ **Missing Permissions**\n\n" +
          "I'm an admin but don't have 'Post messages' permission.\n\n" +
          "Please update my permissions and try again.",
          {
            parse_mode: "Markdown",
            reply_markup: new InlineKeyboard()
              .text("🔄 Try Again", "channel_start_verification")
              .text("❌ Cancel", "cancel_verification")
          }
        );
        return;
      }
      
      // Success! Bot is admin with correct permissions
      ctx.session.channelVerification = {
        step: 'pricing',
        channelUsername,
        channelId: chat.id.toString()
      };
      
      const keyboard = new InlineKeyboard()
        .text("💵 0.1 SOL", "set_price:0.1:SOL").row()
        .text("💵 0.5 SOL", "set_price:0.5:SOL").row()
        .text("💵 1 SOL", "set_price:1:SOL").row()
        .text("💰 1 USDC", "set_price:1:USDC").row()
        .text("💰 5 USDC", "set_price:5:USDC").row()
        .text("✏️ Custom Amount", "set_custom_price");
      
      await ctx.reply(
        "✅ **Channel Verified!**\n\n" +
        `Channel: @${channelUsername}\n` +
        "Status: Bot is admin with posting rights\n\n" +
        "**Now set your default post price:**\n" +
        "This will be the default price for all paywalled posts.\n" +
        "You can override it for individual posts.",
        {
          parse_mode: "Markdown",
          reply_markup: keyboard
        }
      );
      
    } catch (error) {
      // Bot is not in the channel
      await ctx.reply(
        "❌ **Bot not in channel**\n\n" +
        "I'm not a member of @" + channelUsername + "\n\n" +
        "Please:\n" +
        "1. Go to @" + channelUsername + "\n" +
        "2. Click channel name → Administrators\n" +
        "3. Add Administrator → Search for @" + ctx.me.username + "\n" +
        "4. Grant 'Post messages' permission\n" +
        "5. Try verification again",
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard()
            .text("🔄 Try Again", "channel_start_verification")
            .text("❌ Cancel", "cancel_verification")
        }
      );
    }
    
  } catch (error) {
    console.error("Channel verification error:", error);
    await ctx.reply(
      "❌ **Channel not found**\n\n" +
      "Couldn't find a channel with username: @" + channelUsername + "\n\n" +
      "Please check:\n" +
      "• Is the username correct?\n" +
      "• Is the channel public?\n" +
      "• Did you include the @ symbol? (don't include it)",
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("🔄 Try Again", "channel_start_verification")
          .text("❌ Cancel", "cancel_verification")
      }
    );
  }
}

// Handle price setting callbacks
export async function handleChannelPriceCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;
  
  await ctx.answerCallbackQuery();
  
  const userId = ctx.from?.id.toString();
  if (!userId) return;
  
  if (data === "set_custom_price") {
    ctx.session.channelVerification = {
      ...ctx.session.channelVerification!,
      step: 'pricing'
    };
    
    await ctx.editMessageText(
      "💰 **Set Custom Price**\n\n" +
      "Enter your default price in this format:\n" +
      "`amount TOKEN`\n\n" +
      "Examples:\n" +
      "• `0.25 SOL`\n" +
      "• `10 USDC`\n" +
      "• `1000 BONK`\n\n" +
      "Supported tokens: SOL, USDC, BONK, JUP",
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("❌ Cancel", "cancel_verification")
      }
    );
    return;
  }
  
  // Parse price from callback data
  const match = data.match(/^set_price:([0-9.]+):([A-Z]+)$/);
  if (!match) return;
  
  const [_, amount, token] = match;
  await saveChannelWithPrice(ctx, userId, amount, token);
}

export async function handleCustomPriceInput(ctx: BotContext) {
  const text = ctx.message?.text?.trim();
  const userId = ctx.from?.id.toString();
  
  if (!text || !userId) return;
  
  // Parse custom price input
  const match = text.match(/^([0-9.]+)\s+([A-Z]+)$/i);
  if (!match) {
    await ctx.reply(
      "❌ Invalid format. Please use: `amount TOKEN`\n" +
      "Example: `0.5 SOL` or `10 USDC`",
      { parse_mode: "Markdown" }
    );
    return;
  }
  
  const [_, amount, token] = match;
  await saveChannelWithPrice(ctx, userId, amount, token.toUpperCase());
}

async function saveChannelWithPrice(ctx: BotContext, userId: string, amount: string, token: string) {
  const channelData = ctx.session.channelVerification;
  if (!channelData?.channelId || !channelData.channelUsername) {
    await ctx.reply("❌ Session expired. Please start verification again.");
    return;
  }
  
  try {
    // Check if channel already exists
    const existing = await prisma.channel.findUnique({
      where: { chatId: channelData.channelId }
    });
    
    if (existing) {
      // Update existing channel
      await prisma.channel.update({
        where: { chatId: channelData.channelId },
        data: {
          defaultPrice: amount,
          defaultToken: token,
          updatedAt: new Date()
        }
      });
    } else {
      // Create new channel
      await prisma.channel.create({
        data: {
          chatId: channelData.channelId,
          adminId: userId,
          username: channelData.channelUsername,
          defaultPrice: amount,
          defaultToken: token
        }
      });
    }
    
    // Clear session
    ctx.session.channelVerification = undefined;
    
    const keyboard = new InlineKeyboard()
      .text("📝 Create First Post", "create_post_in:" + channelData.channelId).row()
      .text("➕ Add Another Channel", "channel_start_verification").row()
      .text("🏠 Back to Menu", "back_to_main");
    
    const message = ctx.callbackQuery?.message || ctx;
    await (message.editMessageText ? message.editMessageText : ctx.reply).call(message,
      "🎉 **Channel Successfully Set Up!**\n\n" +
      `Channel: @${channelData.channelUsername}\n` +
      `Default Price: ${amount} ${token}\n` +
      `Status: ✅ Verified & Ready\n\n` +
      "You can now create paywalled posts in this channel!\n\n" +
      "**Next Steps:**\n" +
      "• Create your first paywalled post\n" +
      "• Share your channel to start earning\n" +
      "• Track performance in Content Stats",
      {
        parse_mode: "Markdown",
        reply_markup: keyboard
      }
    );
    
  } catch (error) {
    console.error("Error saving channel:", error);
    await ctx.reply("❌ Error saving channel. Please try again.");
  }
}