import { BotContext } from "../bot";
import { prisma } from "../infra/prisma";
import { logger } from "../infra/logger";
import { InlineKeyboard } from "grammy";

// Channel initialization command
export async function commandChannelInit(ctx: BotContext) {
  if (ctx.chat?.type !== "private") {
    return ctx.reply("This command only works in DM.");
  }

  const userId = ctx.from!.id;
  const telegramId = String(userId);

  // Clear any existing session state to prevent conflicts
  const session = ctx.session as any;
  delete session.expectingGroupPrice;
  delete session.setupGroupToken;
  delete session.postCreation;
  delete session.linkingGroup;

  // Set up session state for channel setup
  (ctx.session as any).channelSetup = {
    step: "enter_channel_username",
    ownerTgId: telegramId
  };

  await ctx.reply(
    `🎬 **Channel Setup for Paywalled Content**\n\n` +
    `This sets up a channel where you can post content that users pay to unlock.\n\n` +
    `📺 **Different from Group Access:**\n` +
    `• Channel = Post paywalled content (like blog posts)\n` +
    `• Group Settings = Paid access to private groups\n\n` +
    `**Setup Steps:**\n` +
    `1. Add me as an admin to your channel\n` +
    `2. Grant me "Post Messages" permission\n` +
    `3. Send me your channel username (e.g., @yourchannel)\n\n` +
    `**Enter your channel username:**`,
    { parse_mode: "Markdown" }
  );
}

// Handle channel username input for setup
export async function handleChannelUsernameInput(ctx: BotContext) {
  const session = ctx.session as any;
  
  if (!session.channelSetup || session.channelSetup.step !== "enter_channel_username") {
    return;
  }

  const text = ctx.message?.text?.trim();
  if (!text) return;

  // Clean up channel username (remove @ if present)
  const channelUsername = text.startsWith('@') ? text : `@${text}`;
  
  // Verify channel exists and bot is admin
  try {
    const chat = await ctx.api.getChat(channelUsername);
    
    if (chat.type !== "channel") {
      return ctx.reply("❌ This is not a channel. Please provide a channel username.");
    }

    const channelId = String(chat.id);
    const channelTitle = chat.title || "Unknown Channel";
    
    // Verify bot is admin in the channel
    const member = await ctx.api.getChatMember(channelId, ctx.me.id);
    
    if (member.status !== "administrator") {
      return ctx.reply(
        `❌ I'm not an admin in **${channelTitle}**.\n\n` +
        `Please:\n` +
        `1. Add me as an admin to the channel\n` +
        `2. Grant me "Post Messages" permission\n` +
        `3. Then enter the channel username again`,
        { parse_mode: "Markdown" }
      );
    }

    // Check for post permission
    if (!member.can_post_messages) {
      return ctx.reply(
        `❌ I don't have permission to post in **${channelTitle}**.\n\n` +
        `Please grant me "Post Messages" permission and try again.`,
        { parse_mode: "Markdown" }
      );
    }

    // Verify the user is an admin in the channel
    const userMember = await ctx.api.getChatMember(channelId, ctx.from!.id);
    
    if (userMember.status !== "administrator" && userMember.status !== "creator") {
      return ctx.reply(
        `❌ You're not an admin in **${channelTitle}**.\n\n` +
        `Only channel admins can set up paywalled content.`,
        { parse_mode: "Markdown" }
      );
    }
  } catch (error: any) {
    if (error.error_code === 400 && error.description?.includes("not found")) {
      return ctx.reply(
        `❌ Channel not found.\n\n` +
        `Make sure you:\n` +
        `1. Added me as an admin first\n` +
        `2. Used the correct username (e.g., @yourchannel)`,
        { parse_mode: "Markdown" }
      );
    }
    logger.error("Error checking channel permissions:", error);
    return ctx.reply("❌ Could not verify channel. Make sure I'm added as an admin first.");
  }

  // Get channel info
  const chat = await ctx.api.getChat(channelUsername);
  const channelId = String(chat.id);
  const channelTitle = chat.title || "Unknown Channel";

  // Store channel info in session
  session.channelSetup = {
    step: "configure_defaults",
    channelId,
    channelTitle,
    ownerTgId: session.channelSetup.ownerTgId
  };

  // Ask for default token
  const keyboard = new InlineKeyboard()
    .text("USDC 💵", "channel_token_USDC")
    .text("SOL ☀️", "channel_token_SOL").row()
    .text("BONK 🐕", "channel_token_BONK")
    .text("JUP 🪐", "channel_token_JUP");

  await ctx.reply(
    `✅ **Channel Verified**: ${channelTitle}\n\n` +
    `Now let's configure defaults for your paywalled posts.\n\n` +
    `**Select default payment token:**`,
    { 
      parse_mode: "Markdown",
      reply_markup: keyboard
    }
  );
}

// Handle token selection for channel
export async function handleChannelTokenSelection(ctx: BotContext, token: string) {
  await ctx.answerCallbackQuery();
  
  const session = ctx.session as any;
  if (!session.channelSetup || session.channelSetup.step !== "configure_defaults") {
    return ctx.editMessageText("❌ Session expired. Please use /channel_init to start over.");
  }

  session.channelSetup.defaultToken = token;
  session.channelSetup.step = "set_price";

  await ctx.editMessageText(
    `✅ Default token: **${token}**\n\n` +
    `Now set the default price for unlocking posts.\n` +
    `You can change this per post later.\n\n` +
    `**Enter price amount** (e.g., 5 for 5 ${token}):`,
    { parse_mode: "Markdown" }
  );
}

// Handle price input for channel
export async function handleChannelPriceInput(ctx: BotContext) {
  const session = ctx.session as any;
  
  if (!session.channelSetup || session.channelSetup.step !== "set_price") {
    return;
  }

  const priceText = ctx.message?.text;
  if (!priceText) return;

  const price = parseFloat(priceText);
  if (isNaN(price) || price <= 0) {
    return ctx.reply("❌ Please enter a valid positive number for the price.");
  }

  // Convert to raw units based on token
  const rawPrice = convertToRawUnits(price, session.channelSetup.defaultToken);
  session.channelSetup.defaultPrice = rawPrice;
  session.channelSetup.step = "set_presets";

  // Ask for tip presets
  await ctx.reply(
    `✅ Default price: **${price} ${session.channelSetup.defaultToken}**\n\n` +
    `Finally, set tip preset amounts (comma-separated).\n` +
    `Default: 1, 5, 10, 25, 50\n\n` +
    `Enter your presets or type "default":`,
    { parse_mode: "Markdown" }
  );
}

// Handle tip presets input
export async function handleChannelPresetsInput(ctx: BotContext) {
  const session = ctx.session as any;
  
  if (!session.channelSetup || session.channelSetup.step !== "set_presets") {
    return;
  }

  const input = ctx.message?.text?.toLowerCase();
  if (!input) return;

  let presets: number[];
  if (input === "default") {
    presets = [1, 5, 10, 25, 50];
  } else {
    presets = input.split(",").map(s => parseFloat(s.trim())).filter(n => !isNaN(n) && n > 0);
    if (presets.length === 0) {
      return ctx.reply("❌ Please enter valid positive numbers separated by commas, or type 'default'.");
    }
  }

  // Save channel configuration to database
  try {
    await prisma.kolChannel.upsert({
      where: { tgChatId: session.channelSetup.channelId },
      update: {
        ownerTgId: session.channelSetup.ownerTgId,
        channelTitle: session.channelSetup.channelTitle,
        defaultToken: session.channelSetup.defaultToken,
        defaultPrice: session.channelSetup.defaultPrice,
        tipPresets: JSON.stringify(presets),
        isActive: true,
        updatedAt: new Date()
      },
      create: {
        tgChatId: session.channelSetup.channelId,
        ownerTgId: session.channelSetup.ownerTgId,
        channelTitle: session.channelSetup.channelTitle,
        defaultToken: session.channelSetup.defaultToken,
        defaultPrice: session.channelSetup.defaultPrice,
        tipPresets: JSON.stringify(presets),
        isActive: true
      }
    });

    // Calculate display price before clearing session
    const displayPrice = parseFloat(session.channelSetup.defaultPrice) / Math.pow(10, session.channelSetup.defaultToken === 'SOL' ? 9 : 6);
    const channelTitle = session.channelSetup.channelTitle;
    const defaultToken = session.channelSetup.defaultToken;
    
    // Clear session
    delete session.channelSetup;
    
    await ctx.reply(
      `✅ **Channel Setup Complete!**\n\n` +
      `Channel: **${channelTitle}**\n` +
      `Default Token: **${defaultToken}**\n` +
      `Default Price: **${displayPrice} ${defaultToken}**\n` +
      `Tip Presets: **${presets.join(", ")}**\n\n` +
      `You can now create paywalled posts with:\n` +
      `/post_locked - Create a new locked post\n\n` +
      `Each post will have:\n` +
      `• A public teaser in the channel\n` +
      `• An unlock button with your set price\n` +
      `• Full content delivered via DM after payment\n` +
      `• Watermarking to prevent leaks`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    logger.error("Error saving channel configuration:", error);
    
    // Store channel data before clearing session
    const channelId = session.channelSetup?.channelId;
    const channelTitle = session.channelSetup?.channelTitle;
    
    // Check if the data was actually saved despite the error
    if (channelId) {
      try {
        const savedChannel = await prisma.kolChannel.findUnique({
          where: { tgChatId: channelId }
        });
        
        if (savedChannel) {
          logger.info("Channel was saved successfully despite error");
          delete session.channelSetup;
          await ctx.reply("✅ Channel setup complete! The configuration was saved successfully.");
          return;
        }
      } catch (checkError) {
        logger.error("Error checking saved channel:", checkError);
      }
    }
    
    delete session.channelSetup;
    await ctx.reply("❌ Failed to save channel configuration. Please try again with /channel_init.");
  }
}

// Utility function to convert to raw units
function convertToRawUnits(amount: number, token: string): string {
  const decimals: Record<string, number> = {
    "USDC": 6,
    "SOL": 9,
    "BONK": 5,
    "JUP": 6
  };
  
  const decimal = decimals[token] || 6;
  return String(Math.floor(amount * Math.pow(10, decimal)));
}

// Export callback handlers
export async function handleChannelCallbacks(ctx: BotContext) {
  const data = ctx.callbackQuery?.data || "";
  
  if (data.startsWith("channel_token_")) {
    const token = data.replace("channel_token_", "");
    await handleChannelTokenSelection(ctx, token);
  }
}