import { BotContext } from "../bot";
import { db } from "../infra/prisma";
import { logger } from "../infra/logger";
import { InlineKeyboard } from "grammy";

// Create locked post command
export async function commandPostLocked(ctx: BotContext) {
  if (ctx.chat?.type !== "private") {
    return ctx.reply("This command only works in DM.");
  }

  const userId = String(ctx.from!.id);

  // Check if user has any configured channels
  const channels = await db.kolChannel.findMany({
    where: { 
      ownerTgId: userId,
      isActive: true
    }
  });

  if (channels.length === 0) {
    return ctx.reply(
      `❌ **No channels configured**\n\n` +
      `You need to set up a channel first.\n` +
      `Use /channel_init to get started.`,
      { parse_mode: "Markdown" }
    );
  }

  // If multiple channels, let user choose
  if (channels.length > 1) {
    const keyboard = new InlineKeyboard();
    channels.forEach(ch => {
      keyboard.text(ch.channelTitle || "Unknown Channel", `post_channel_${ch.id}`).row();
    });

    (ctx.session as any).postCreation = {
      step: "select_channel"
    };

    return ctx.reply(
      `📝 **Create Locked Post**\n\n` +
      `Select the channel for this post:`,
      { 
        parse_mode: "Markdown",
        reply_markup: keyboard
      }
    );
  }

  // Single channel - proceed directly
  const channel = channels[0];
  (ctx.session as any).postCreation = {
    step: "select_type",
    channelId: channel.tgChatId,
    channelTitle: channel.channelTitle,
    defaultToken: channel.defaultToken,
    defaultPrice: channel.defaultPrice
  };

  const keyboard = new InlineKeyboard()
    .text("📝 Text Post", "post_type_text")
    .text("🎥 Video Post", "post_type_video");

  await ctx.reply(
    `📝 **Create Locked Post**\n` +
    `Channel: **${channel.channelTitle}**\n\n` +
    `Select content type:`,
    { 
      parse_mode: "Markdown",
      reply_markup: keyboard
    }
  );
}

// Handle channel selection for post
export async function handlePostChannelSelection(ctx: BotContext, channelId: string) {
  await ctx.answerCallbackQuery();
  
  const channel = await db.kolChannel.findUnique({
    where: { id: channelId }
  });

  if (!channel) {
    return ctx.editMessageText("❌ Channel not found. Please try again.");
  }

  (ctx.session as any).postCreation = {
    step: "select_type",
    channelId: channel.tgChatId,
    channelTitle: channel.channelTitle,
    defaultToken: channel.defaultToken,
    defaultPrice: channel.defaultPrice
  };

  const keyboard = new InlineKeyboard()
    .text("📝 Text Post", "post_type_text")
    .text("🎥 Video Post", "post_type_video");

  await ctx.editMessageText(
    `📝 **Create Locked Post**\n` +
    `Channel: **${channel.channelTitle}**\n\n` +
    `Select content type:`,
    { 
      parse_mode: "Markdown",
      reply_markup: keyboard
    }
  );
}

// Handle content type selection
export async function handlePostTypeSelection(ctx: BotContext, type: string) {
  await ctx.answerCallbackQuery();
  
  const session = ctx.session as any;
  if (!session.postCreation) {
    return ctx.editMessageText("❌ Session expired. Please use /post_locked to start over.");
  }

  session.postCreation.contentType = type;
  session.postCreation.step = "set_title";

  await ctx.editMessageText(
    `📝 **Create ${type === "text" ? "Text" : "Video"} Post**\n\n` +
    `Enter a title for your post (optional).\n` +
    `Type "skip" to continue without a title:`,
    { parse_mode: "Markdown" }
  );
}

// Handle title input
export async function handlePostTitleInput(ctx: BotContext) {
  const session = ctx.session as any;
  
  if (!session.postCreation || session.postCreation.step !== "set_title") {
    return;
  }

  const title = ctx.message?.text;
  if (!title) return;

  if (title.toLowerCase() !== "skip") {
    session.postCreation.title = title;
  }

  session.postCreation.step = "set_teaser";

  await ctx.reply(
    `✅ Title set${title.toLowerCase() !== "skip" ? `: **${title}**` : " (skipped)"}\n\n` +
    `Now enter a teaser/preview text.\n` +
    `This will be shown publicly in the channel:`,
    { parse_mode: "Markdown" }
  );
}

// Handle teaser input
export async function handlePostTeaserInput(ctx: BotContext) {
  const session = ctx.session as any;
  
  if (!session.postCreation || session.postCreation.step !== "set_teaser") {
    return;
  }

  const teaser = ctx.message?.text;
  if (!teaser) return;

  session.postCreation.teaserText = teaser;

  if (session.postCreation.contentType === "text") {
    session.postCreation.step = "set_content";
    await ctx.reply(
      `✅ Teaser set!\n\n` +
      `Now send the **full text content** that will be unlocked.\n` +
      `This will only be sent via DM after payment:`,
      { parse_mode: "Markdown" }
    );
  } else {
    session.postCreation.step = "upload_video";
    await ctx.reply(
      `✅ Teaser set!\n\n` +
      `Now **upload the video** that will be unlocked.\n` +
      `This will only be sent via DM after payment:`,
      { parse_mode: "Markdown" }
    );
  }
}

// Handle text content input
export async function handlePostContentInput(ctx: BotContext) {
  const session = ctx.session as any;
  
  if (!session.postCreation || session.postCreation.step !== "set_content") {
    return;
  }

  const content = ctx.message?.text;
  if (!content) return;

  session.postCreation.payloadRef = content;
  session.postCreation.step = "set_price";

  // Ask for price with default suggestion
  const defaultPrice = convertFromRawUnits(session.postCreation.defaultPrice, session.postCreation.defaultToken);
  
  await ctx.reply(
    `✅ Content saved!\n\n` +
    `Set the unlock price (default: ${defaultPrice} ${session.postCreation.defaultToken}).\n` +
    `Enter amount or type "default":`,
    { parse_mode: "Markdown" }
  );
}

// Handle video upload
export async function handlePostVideoUpload(ctx: BotContext) {
  const session = ctx.session as any;
  
  if (!session.postCreation || session.postCreation.step !== "upload_video") {
    return;
  }

  const video = ctx.message?.video;
  if (!video) {
    return ctx.reply("❌ Please upload a video file.");
  }

  session.postCreation.payloadRef = video.file_id;
  session.postCreation.step = "set_price";

  // Ask for price with default suggestion
  const defaultPrice = convertFromRawUnits(session.postCreation.defaultPrice, session.postCreation.defaultToken);
  
  await ctx.reply(
    `✅ Video uploaded!\n\n` +
    `Set the unlock price (default: ${defaultPrice} ${session.postCreation.defaultToken}).\n` +
    `Enter amount or type "default":`,
    { parse_mode: "Markdown" }
  );
}

// Handle price input for post
export async function handlePostPriceInput(ctx: BotContext) {
  const session = ctx.session as any;
  
  if (!session.postCreation || session.postCreation.step !== "set_price") {
    return;
  }

  const input = ctx.message?.text?.toLowerCase();
  if (!input) return;

  let rawPrice: string;
  let displayPrice: number;

  if (input === "default") {
    rawPrice = session.postCreation.defaultPrice;
    displayPrice = convertFromRawUnits(rawPrice, session.postCreation.defaultToken);
  } else {
    const price = parseFloat(input);
    if (isNaN(price) || price <= 0) {
      return ctx.reply("❌ Please enter a valid positive number or type 'default'.");
    }
    displayPrice = price;
    rawPrice = convertToRawUnits(price, session.postCreation.defaultToken);
  }

  session.postCreation.priceAmount = rawPrice;
  session.postCreation.displayPrice = displayPrice;
  session.postCreation.step = "select_token";

  // Ask for token selection
  const keyboard = new InlineKeyboard()
    .text(`Use ${session.postCreation.defaultToken}`, `post_token_${session.postCreation.defaultToken}`).row()
    .text("USDC 💵", "post_token_USDC")
    .text("SOL ☀️", "post_token_SOL").row()
    .text("BONK 🐕", "post_token_BONK")
    .text("JUP 🪐", "post_token_JUP");

  await ctx.reply(
    `✅ Price: **${displayPrice}**\n\n` +
    `Select payment token:`,
    { 
      parse_mode: "Markdown",
      reply_markup: keyboard
    }
  );
}

// Handle token selection for post
export async function handlePostTokenSelection(ctx: BotContext, token: string) {
  await ctx.answerCallbackQuery();
  
  const session = ctx.session as any;
  if (!session.postCreation) {
    return ctx.editMessageText("❌ Session expired. Please use /post_locked to start over.");
  }

  session.postCreation.priceToken = token;

  // Recalculate price if token changed
  if (token !== session.postCreation.defaultToken) {
    const rawPrice = convertToRawUnits(session.postCreation.displayPrice, token);
    session.postCreation.priceAmount = rawPrice;
  }

  // Create the locked post
  try {
    const post = await db.lockedPost.create({
      data: {
        tgChatId: session.postCreation.channelId,
        channelMsgId: "", // Will be updated after posting
        contentType: session.postCreation.contentType,
        priceAmount: session.postCreation.priceAmount,
        priceToken: token,
        payloadRef: session.postCreation.payloadRef,
        title: session.postCreation.title || null,
        teaserText: session.postCreation.teaserText
      }
    });

    // Create the channel post with unlock button
    const keyboard = new InlineKeyboard()
      .text(`🔓 Unlock (${session.postCreation.displayPrice} ${token})`, `unlock:${post.id}`).row()
      .text("💖 Tip Creator", `tip_channel:${session.postCreation.channelId}`);

    const messageText = 
      `${session.postCreation.title ? `**${session.postCreation.title}**\n\n` : ""}` +
      `${session.postCreation.teaserText}\n\n` +
      `━━━━━━━━━━━━━━━\n` +
      `🔒 Unlock to view full ${session.postCreation.contentType}`;

    // Post to channel
    const channelMessage = await ctx.api.sendMessage(
      session.postCreation.channelId,
      messageText,
      { 
        parse_mode: "Markdown",
        reply_markup: keyboard
      }
    );

    // Update post with message ID
    await db.lockedPost.update({
      where: { id: post.id },
      data: { channelMsgId: String(channelMessage.message_id) }
    });

    // Clear session
    delete session.postCreation;

    await ctx.editMessageText(
      `✅ **Post Published!**\n\n` +
      `Your locked ${session.postCreation?.contentType} post has been published to the channel.\n\n` +
      `• Price: **${session.postCreation?.displayPrice} ${token}**\n` +
      `• Platform fee: **5%** (paid by you)\n` +
      `• Buyers will receive content via DM\n` +
      `• Content is watermarked with buyer info\n\n` +
      `You'll be notified for each unlock! 🎉`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    logger.error("Error creating locked post:", error);
    delete session.postCreation;
    await ctx.editMessageText("❌ Failed to create post. Please try again.");
  }
}

// Utility functions
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

// Export callback handlers
export async function handlePostCallbacks(ctx: BotContext) {
  const data = ctx.callbackQuery?.data || "";
  
  if (data.startsWith("post_channel_")) {
    const channelId = data.replace("post_channel_", "");
    await handlePostChannelSelection(ctx, channelId);
  } else if (data.startsWith("post_type_")) {
    const type = data.replace("post_type_", "");
    await handlePostTypeSelection(ctx, type);
  } else if (data.startsWith("post_token_")) {
    const token = data.replace("post_token_", "");
    await handlePostTokenSelection(ctx, token);
  }
}