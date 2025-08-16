import { BotContext } from "../bot";
import { db } from "../infra/prisma";
import { logger } from "../infra/logger";
import { InlineKeyboard } from "grammy";

// Channel initialization command
export async function commandChannelInit(ctx: BotContext) {
  if (ctx.chat?.type !== "private") {
    return ctx.reply("This command only works in DM.");
  }

  const userId = ctx.from!.id;
  const telegramId = String(userId);

  // Set up session state for channel setup
  (ctx.session as any).channelSetup = {
    step: "forward_message",
    ownerTgId: telegramId
  };

  await ctx.reply(
    `🎬 **Channel Setup**\n\n` +
    `To set up your channel for paywalled content:\n\n` +
    `1. Go to your channel\n` +
    `2. Forward ANY message from your channel to me\n` +
    `3. I'll verify you're an admin and configure the channel\n\n` +
    `Please forward a message from your channel now.`,
    { parse_mode: "Markdown" }
  );
}

// Handle forwarded messages for channel setup
export async function handleChannelForward(ctx: BotContext) {
  const session = ctx.session as any;
  
  if (!session.channelSetup || session.channelSetup.step !== "forward_message") {
    return;
  }

  const forwardedFrom = ctx.message?.forward_from_chat;
  if (!forwardedFrom || forwardedFrom.type !== "channel") {
    return ctx.reply("❌ Please forward a message from a channel, not a group or user.");
  }

  const channelId = String(forwardedFrom.id);
  const channelTitle = forwardedFrom.title || "Unknown Channel";
  
  // Verify bot is admin in the channel
  try {
    const member = await ctx.api.getChatMember(channelId, ctx.me.id);
    if (member.status !== "administrator") {
      return ctx.reply(
        `❌ I'm not an admin in **${channelTitle}**.\n\n` +
        `Please:\n` +
        `1. Add me as an admin to the channel\n` +
        `2. Grant me "Post Messages" permission\n` +
        `3. Then forward a message again`,
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
  } catch (error) {
    logger.error("Error checking channel permissions:", error);
    return ctx.reply("❌ Could not verify channel permissions. Make sure I'm added as an admin.");
  }

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
    await db.kolChannel.upsert({
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
    delete session.channelSetup;
    await ctx.reply("❌ Failed to save channel configuration. Please try again.");
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