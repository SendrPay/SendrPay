import { BotContext } from "../bot";
import { prisma } from "../infra/prisma";
import { logger } from "../infra/logger";
import { InlineKeyboard } from "grammy";

// Create locked post command
export async function commandPostLocked(ctx: BotContext) {
  if (ctx.chat?.type !== "private") {
    return ctx.reply("This command only works in DM.");
  }

  const userId = String(ctx.from!.id);

  // Check if user has any configured channels
  const channels = await prisma.kolChannel.findMany({
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

  // Single channel - proceed directly to post creation
  const channel = channels[0];

  // Create or update draft post in database
  const existingDraft = await prisma.draftPost.findFirst({
    where: { 
      authorTgId: userId,
      channelId: channel.tgChatId
    }
  });

  const draftPost = existingDraft ? await prisma.draftPost.update({
    where: { id: existingDraft.id },
    data: {
      currentStep: "set_title",
      channelTitle: channel.channelTitle,
      defaultToken: channel.defaultToken,
      defaultPrice: channel.defaultPrice,
      // Reset content for new post
      title: null,
      teaserText: null,
      textContent: null,
      attachments: null,
      priceAmount: null,
      priceToken: null,
      displayPrice: null
    }
  }) : await prisma.draftPost.create({
    data: {
      authorTgId: userId,
      channelId: channel.tgChatId,
      channelTitle: channel.channelTitle,
      defaultToken: channel.defaultToken,
      defaultPrice: channel.defaultPrice,
      currentStep: "set_title"
    }
  });

  // Store draft ID in session for quick access
  (ctx.session as any).postCreation = {
    draftId: draftPost.id,
    step: "set_title"
  };

  await ctx.reply(
    `📝 **Create Locked Post**\n` +
    `Channel: **${channel.channelTitle}**\n\n` +
    `Enter a title for your post (optional).\n` +
    `Type "skip" to continue without a title:`,
    { parse_mode: "Markdown" }
  );
}

// Handle channel selection for post
export async function handlePostChannelSelection(ctx: BotContext, channelId: string) {
  await ctx.answerCallbackQuery();
  
  const channel = await prisma.kolChannel.findUnique({
    where: { id: channelId }
  });

  if (!channel) {
    return ctx.editMessageText("❌ Channel not found. Please try again.");
  }

  const userId = String(ctx.from!.id);

  // Create or update draft post in database
  const existingDraft = await prisma.draftPost.findFirst({
    where: { 
      authorTgId: userId,
      channelId: channel.tgChatId
    }
  });

  const draftPost = existingDraft ? await prisma.draftPost.update({
    where: { id: existingDraft.id },
    data: {
      currentStep: "set_title",
      channelTitle: channel.channelTitle,
      defaultToken: channel.defaultToken,
      defaultPrice: channel.defaultPrice,
      // Reset content for new post
      title: null,
      teaserText: null,
      textContent: null,
      attachments: null,
      priceAmount: null,
      priceToken: null,
      displayPrice: null
    }
  }) : await prisma.draftPost.create({
    data: {
      authorTgId: userId,
      channelId: channel.tgChatId,
      channelTitle: channel.channelTitle,
      defaultToken: channel.defaultToken,
      defaultPrice: channel.defaultPrice,
      currentStep: "set_title"
    }
  });

  (ctx.session as any).postCreation = {
    draftId: draftPost.id,
    step: "set_title"
  };

  await ctx.editMessageText(
    `📝 **Create Locked Post**\n` +
    `Channel: **${channel.channelTitle}**\n\n` +
    `Enter a title for your post (optional).\n` +
    `Type "skip" to continue without a title:`,
    { 
      parse_mode: "Markdown"
    }
  );
}

// Content type selection is removed - posts are now mixed content

// Handle title input
export async function handlePostTitleInput(ctx: BotContext) {
  const session = ctx.session as any;
  
  if (!session.postCreation || session.postCreation.step !== "set_title") {
    return;
  }

  const title = ctx.message?.text;
  if (!title) return;

  // Update draft in database
  const draftPost = await prisma.draftPost.update({
    where: { id: session.postCreation.draftId },
    data: {
      title: title.toLowerCase() !== "skip" ? title : null,
      currentStep: "set_teaser"
    }
  });

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

  // Update draft in database
  await prisma.draftPost.update({
    where: { id: session.postCreation.draftId },
    data: {
      teaserText: teaser,
      currentStep: "set_content"
    }
  });

  session.postCreation.step = "set_content";
  
  await ctx.reply(
    `✅ Teaser set!\n\n` +
    `Now send the **full content** that will be unlocked:\n\n` +
    `• **Text**: Type your message\n` +
    `• **Images**: Upload photos (max 10MB each)\n` +
    `• **Video**: Upload video (max 50MB)\n\n` +
    `You can combine text with images/video.\n` +
    `Type "done" when finished:`,
    { parse_mode: "Markdown" }
  );
}

// Handle mixed content input (text, images, video)
export async function handlePostContentInput(ctx: BotContext) {
  const session = ctx.session as any;
  
  if (!session.postCreation || session.postCreation.step !== "set_content") {
    return;
  }

  // Get current draft from database
  const draftPost = await prisma.draftPost.findUnique({
    where: { id: session.postCreation.draftId }
  });

  if (!draftPost) {
    return ctx.reply("❌ Session expired. Please use /post_locked to start over.");
  }

  // Handle "done" command to finish content creation
  if (ctx.message?.text?.toLowerCase() === "done") {
    const hasText = draftPost.textContent && draftPost.textContent.trim();
    const attachments = draftPost.attachments ? JSON.parse(draftPost.attachments) : [];
    const hasAttachments = attachments.length > 0;

    if (!hasText && !hasAttachments) {
      return ctx.reply("❌ Please add some content (text, images, or video) before typing 'done'.");
    }
    
    // Update step in database
    await prisma.draftPost.update({
      where: { id: draftPost.id },
      data: { currentStep: "set_price" }
    });

    session.postCreation.step = "set_price";
    const defaultPrice = convertFromRawUnits(draftPost.defaultPrice!, draftPost.defaultToken!);
    
    return ctx.reply(
      `✅ Content ready!\n\n` +
      `**Content summary:**\n` +
      `${hasText ? "• Text content ✓\n" : ""}` +
      `${hasAttachments ? `• ${attachments.length} attachment(s) ✓\n` : ""}\n` +
      `Set the unlock price (default: ${defaultPrice} ${draftPost.defaultToken}).\n` +
      `Enter amount or type "default":`,
      { parse_mode: "Markdown" }
    );
  }

  // Handle text content
  const text = ctx.message?.text;
  if (text) {
    await prisma.draftPost.update({
      where: { id: draftPost.id },
      data: { textContent: text }
    });

    await ctx.reply(
      `✅ Text content added!\n\n` +
      `You can now:\n` +
      `• Add more text (will replace current)\n` +
      `• Upload images or video\n` +
      `• Type "done" when finished`,
      { parse_mode: "Markdown" }
    );
  }
}

// Handle media uploads (images and video) for mixed content
export async function handlePostMediaUpload(ctx: BotContext) {
  const session = ctx.session as any;
  
  if (!session.postCreation || session.postCreation.step !== "set_content") {
    return;
  }

  // Get current draft from database
  const draftPost = await prisma.draftPost.findUnique({
    where: { id: session.postCreation.draftId }
  });

  if (!draftPost) {
    return ctx.reply("❌ Session expired. Please use /post_locked to start over.");
  }

  // Parse existing attachments
  let attachments = draftPost.attachments ? JSON.parse(draftPost.attachments) : [];

  // Handle photo uploads
  if (ctx.message?.photo) {
    const photo = ctx.message.photo;
    const largestPhoto = photo[photo.length - 1];
    
    // Check file size (Telegram API provides file_size)
    if (largestPhoto.file_size && largestPhoto.file_size > 10 * 1024 * 1024) { // 10MB limit
      return ctx.reply("❌ Image too large! Maximum size is 10MB per image.");
    }
    
    attachments.push({
      type: "photo",
      file_id: largestPhoto.file_id,
      file_size: largestPhoto.file_size || 0
    });

    // Update database
    await prisma.draftPost.update({
      where: { id: draftPost.id },
      data: { attachments: JSON.stringify(attachments) }
    });

    await ctx.reply(
      `✅ Image ${attachments.filter(a => a.type === "photo").length} added!\n\n` +
      `Current content:\n` +
      `${draftPost.textContent ? "• Text content ✓\n" : ""}` +
      `• ${attachments.length} attachment(s)\n\n` +
      `Continue adding content or type "done" when finished.`,
      { parse_mode: "Markdown" }
    );
  }
  
  // Handle video uploads
  if (ctx.message?.video) {
    const video = ctx.message.video;
    
    // Check file size (50MB limit for video)
    if (video.file_size && video.file_size > 50 * 1024 * 1024) {
      return ctx.reply("❌ Video too large! Maximum size is 50MB.");
    }
    
    // Only allow one video per post
    const hasVideo = attachments.some(a => a.type === "video");
    if (hasVideo) {
      return ctx.reply("❌ Only one video allowed per post. Remove existing video first.");
    }
    
    attachments.push({
      type: "video",
      file_id: video.file_id,
      file_size: video.file_size || 0
    });

    // Update database
    await prisma.draftPost.update({
      where: { id: draftPost.id },
      data: { attachments: JSON.stringify(attachments) }
    });

    await ctx.reply(
      `✅ Video added!\n\n` +
      `Current content:\n` +
      `${draftPost.textContent ? "• Text content ✓\n" : ""}` +
      `• ${attachments.length} attachment(s)\n\n` +
      `Continue adding content or type "done" when finished.`,
      { parse_mode: "Markdown" }
    );
  }
}

// Video upload is now handled by handlePostMediaUpload

// Handle price input for post
export async function handlePostPriceInput(ctx: BotContext) {
  const session = ctx.session as any;
  
  if (!session.postCreation || session.postCreation.step !== "set_price") {
    return;
  }

  // Get current draft from database
  const draftPost = await prisma.draftPost.findUnique({
    where: { id: session.postCreation.draftId }
  });

  if (!draftPost) {
    return ctx.reply("❌ Session expired. Please use /post_locked to start over.");
  }

  const input = ctx.message?.text?.toLowerCase();
  if (!input) return;

  let rawPrice: string;
  let displayPrice: number;

  if (input === "default") {
    rawPrice = draftPost.defaultPrice!;
    displayPrice = convertFromRawUnits(rawPrice, draftPost.defaultToken!);
  } else {
    const price = parseFloat(input);
    if (isNaN(price) || price <= 0) {
      return ctx.reply("❌ Please enter a valid positive number or type 'default'.");
    }
    displayPrice = price;
    rawPrice = convertToRawUnits(price, draftPost.defaultToken!);
  }

  // Update draft in database
  await prisma.draftPost.update({
    where: { id: draftPost.id },
    data: {
      priceAmount: rawPrice,
      displayPrice: displayPrice.toString(),
      currentStep: "select_token"
    }
  });

  session.postCreation.step = "select_token";

  // Ask for token selection
  const keyboard = new InlineKeyboard()
    .text(`Use ${draftPost.defaultToken}`, `post_token_${draftPost.defaultToken}`).row()
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

  // Get current draft from database
  const draftPost = await prisma.draftPost.findUnique({
    where: { id: session.postCreation.draftId }
  });

  if (!draftPost) {
    return ctx.editMessageText("❌ Session expired. Please use /post_locked to start over.");
  }

  // Update draft with selected token
  let finalPriceAmount = draftPost.priceAmount;
  const displayPrice = parseFloat(draftPost.displayPrice!);

  // Recalculate price if token changed
  if (token !== draftPost.defaultToken) {
    finalPriceAmount = convertToRawUnits(displayPrice, token);
  }

  await prisma.draftPost.update({
    where: { id: draftPost.id },
    data: {
      priceToken: token,
      priceAmount: finalPriceAmount
    }
  });

  // Create the locked post
  try {
    const attachments = draftPost.attachments ? JSON.parse(draftPost.attachments) : [];
    
    const post = await prisma.lockedPost.create({
      data: {
        tgChatId: draftPost.channelId,
        channelMsgId: "", // Will be updated after posting
        contentType: "mixed",
        priceAmount: finalPriceAmount!,
        priceToken: token,
        payloadRef: JSON.stringify({
          textContent: draftPost.textContent || "",
          attachments: attachments
        }),
        title: draftPost.title || null,
        teaserText: draftPost.teaserText
      }
    });

    // Create the channel post with unlock button
    const keyboard = new InlineKeyboard()
      .text(`🔓 Unlock (${displayPrice} ${token})`, `unlock:${post.id}`).row()
      .text("💖 Tip Creator", `tip_channel:${draftPost.channelId}`);

    const hasAttachments = attachments.length > 0;
    const hasText = draftPost.textContent && draftPost.textContent.trim();
    
    let contentDescription = "content";
    if (hasText && hasAttachments) {
      contentDescription = "content with media";
    } else if (hasAttachments) {
      const photos = attachments.filter(a => a.type === "photo").length;
      const videos = attachments.filter(a => a.type === "video").length;
      if (photos > 0 && videos > 0) {
        contentDescription = `${photos} image(s) and ${videos} video(s)`;
      } else if (photos > 0) {
        contentDescription = photos === 1 ? "image" : `${photos} images`;
      } else if (videos > 0) {
        contentDescription = "video";
      }
    } else if (hasText) {
      contentDescription = "text content";
    }

    const messageText = 
      `${draftPost.title ? `**${draftPost.title}**\n\n` : ""}` +
      `${draftPost.teaserText}\n\n` +
      `━━━━━━━━━━━━━━━\n` +
      `🔒 Unlock to view full ${contentDescription}`;

    // Post to channel
    const channelMessage = await ctx.api.sendMessage(
      draftPost.channelId,
      messageText,
      { 
        parse_mode: "Markdown",
        reply_markup: keyboard
      }
    );

    // Update post with message ID
    await prisma.lockedPost.update({
      where: { id: post.id },
      data: { channelMsgId: String(channelMessage.message_id) }
    });

    // Clean up draft post after successful creation
    await prisma.draftPost.delete({
      where: { id: draftPost.id }
    });
    
    // Clear session
    delete session.postCreation;

    await ctx.editMessageText(
      `✅ **Post Published!**\n\n` +
      `Your locked content has been published to the channel.\n\n` +
      `• Price: **${displayPrice} ${token}**\n` +
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
  // Post type selection removed - using mixed content now
  } else if (data.startsWith("post_token_")) {
    const token = data.replace("post_token_", "");
    await handlePostTokenSelection(ctx, token);
  }
}