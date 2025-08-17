import { Bot, InlineKeyboard } from "grammy";
import { BotContext } from "../bot";
import { prisma } from "../infra/prisma";

const logger = {
  error: (msg: string, error?: any) => console.error(msg, error),
  info: (msg: string, data?: any) => console.log(msg, data)
};

// Enhanced paywall unlock with inline buttons and explanations
export async function showPaywallUnlockOptions(ctx: BotContext, postId: string, channelUsername: string) {
  try {
    // Find the post
    const post = await prisma.lockedPost.findUnique({
      where: { id: parseInt(postId) },
      include: { 
        channel: true,
        author: true 
      }
    });

    if (!post) {
      return ctx.reply("❌ Post not found");
    }

    // Check if user already has access
    const userId = ctx.from?.id;
    if (userId) {
      const existingAccess = await prisma.postAccess.findFirst({
        where: {
          postId: post.id,
          userTgId: String(userId)
        }
      });

      if (existingAccess) {
        return showUnlockedContent(ctx, post);
      }
    }

    // Build unlock options keyboard
    const keyboard = new InlineKeyboard();
    
    // Primary unlock button
    const price = convertFromRawUnits(post.priceAmount, post.priceToken);
    keyboard.text(
      `🔓 Unlock for ${price} ${post.priceToken}`,
      `unlock_post:${postId}`
    ).row();

    // Tip author button
    if (post.author) {
      keyboard.text(
        `💖 Tip Author`,
        `tip_author:${post.authorId}`
      ).row();
    }

    // Information buttons
    keyboard.text("ℹ️ What's Inside?", `preview_content:${postId}`)
         .text("💰 Pricing Info", `pricing_info:${postId}`).row();
    
    keyboard.text("❓ How It Works", `how_it_works:${postId}`).row();

    // Build content preview
    const contentPreview = buildContentPreview(post);
    
    const unlockText = 
      `🔒 **Premium Content**\n\n` +
      `📝 **"${post.title}"**\n\n` +
      `${post.teaser || "Exclusive content available for unlock"}\n\n` +
      `${contentPreview}\n\n` +
      `💰 **Price:** ${price} ${post.priceToken}\n` +
      `👤 **Creator:** @${post.author?.handle || "Anonymous"}\n\n` +
      `_Choose an option below to continue:_`;

    await ctx.reply(unlockText, {
      parse_mode: "Markdown",
      reply_markup: keyboard
    });

  } catch (error) {
    logger.error("Error showing paywall unlock options:", error);
    await ctx.reply("❌ Error loading content. Please try again.");
  }
}

// Handle all paywall-related callbacks
export async function handlePaywallInlineCallbacks(ctx: BotContext) {
  if (!ctx.callbackQuery?.data) return;
  
  const data = ctx.callbackQuery.data;
  
  try {
    if (data.startsWith("unlock_post:")) {
      const postId = data.split(":")[1];
      await processContentUnlock(ctx, postId);
    } else if (data.startsWith("tip_author:")) {
      const authorId = data.split(":")[1];
      await showAuthorTipOptions(ctx, authorId);
    } else if (data.startsWith("preview_content:")) {
      const postId = data.split(":")[1];
      await showContentPreview(ctx, postId);
    } else if (data.startsWith("pricing_info:")) {
      const postId = data.split(":")[1];
      await showPricingInfo(ctx, postId);
    } else if (data.startsWith("how_it_works:")) {
      const postId = data.split(":")[1];
      await showHowItWorks(ctx, postId);
    } else if (data.startsWith("confirm_unlock:")) {
      const postId = data.split(":")[1];
      await executeContentUnlock(ctx, postId);
    } else if (data === "cancel_unlock") {
      await ctx.editMessageText("❌ Unlock cancelled", { parse_mode: "Markdown" });
    } else if (data.startsWith("back_to_unlock:")) {
      const [, postId, channelUsername] = data.split(":");
      await showPaywallUnlockOptions(ctx, postId, channelUsername);
    }
    
    await ctx.answerCallbackQuery();
  } catch (error) {
    logger.error("Error handling paywall callback:", error);
    await ctx.answerCallbackQuery("❌ Error processing request");
  }
}

// Process content unlock with confirmation
async function processContentUnlock(ctx: BotContext, postId: string) {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Find the post
    const post = await prisma.lockedPost.findUnique({
      where: { id: parseInt(postId) },
      include: { 
        channel: true,
        author: true 
      }
    });

    if (!post) {
      return ctx.editMessageText("❌ Post not found");
    }

    // Find buyer
    const buyer = await prisma.user.findUnique({
      where: { telegramId: String(userId) }
    });

    if (!buyer?.activeWalletId) {
      return ctx.editMessageText("❌ You need to create a wallet first using /start");
    }

    const price = convertFromRawUnits(post.priceAmount, post.priceToken);
    const platformFee = price * 0.05; // 5% platform fee
    const authorReceives = price * 0.95;

    // Create confirmation keyboard
    const keyboard = new InlineKeyboard()
      .text("✅ Confirm Purchase", `confirm_unlock:${postId}`)
      .text("❌ Cancel", "cancel_unlock").row()
      .text("⬅️ Back", `back_to_unlock:${postId}:${post.channel.username}`);

    const confirmText = 
      `💰 **Confirm Content Purchase**\n\n` +
      `📝 **"${post.title}"**\n` +
      `👤 **Creator:** @${post.author.handle}\n\n` +
      `**Payment Details:**\n` +
      `• Content Price: ${price} ${post.priceToken}\n` +
      `• Platform Fee (5%): ${platformFee.toFixed(4)} ${post.priceToken}\n` +
      `• Author Receives: ${authorReceives.toFixed(4)} ${post.priceToken}\n\n` +
      `**Total Cost: ${price} ${post.priceToken}**\n\n` +
      `_After purchase, you'll get instant access to the full content._`;

    await ctx.editMessageText(confirmText, {
      parse_mode: "Markdown",
      reply_markup: keyboard
    });

  } catch (error) {
    logger.error("Error processing content unlock:", error);
    await ctx.editMessageText("❌ Error processing unlock. Please try again.");
  }
}

// Show author tip options
async function showAuthorTipOptions(ctx: BotContext, authorId: string) {
  try {
    const author = await prisma.user.findUnique({
      where: { id: parseInt(authorId) },
      include: { kolSettings: true }
    });

    if (!author?.kolSettings?.acceptedTipTokens?.length) {
      return ctx.editMessageText(
        `💖 **Tip @${author?.handle || "Creator"}**\n\n` +
        `This creator hasn't set up tip options yet.\n\n` +
        `_They can use /setup to configure accepted tokens._`,
        { parse_mode: "Markdown" }
      );
    }

    const keyboard = new InlineKeyboard();
    
    // Quick tip amounts for each accepted token
    const amounts = [1, 5, 10, 25];
    
    author.kolSettings.acceptedTipTokens.forEach(token => {
      keyboard.text(`💖 ${token}`, `tip_header_${token}`).row();
      amounts.forEach(amount => {
        keyboard.text(`${amount}`, `tip_amount:${amount}:${token}:${authorId}`);
      });
      keyboard.row();
    });

    keyboard.text("⬅️ Back", `back_to_author:${authorId}`);

    const tipText = 
      `💖 **Tip @${author?.handle || "Creator"}**\n\n` +
      `Show your appreciation for quality content!\n\n` +
      `**Accepted Tokens:** ${author.kolSettings.acceptedTipTokens.join(", ")}\n\n` +
      `_Platform fee: 2% (deducted from recipient)_\n\n` +
      `Choose amount and token:`;

    await ctx.editMessageText(tipText, {
      parse_mode: "Markdown",
      reply_markup: keyboard
    });

  } catch (error) {
    logger.error("Error showing author tip options:", error);
    await ctx.editMessageText("❌ Error loading tip options. Please try again.");
  }
}

// Show content preview with helpful info
async function showContentPreview(ctx: BotContext, postId: string) {
  try {
    const post = await prisma.lockedPost.findUnique({
      where: { id: parseInt(postId) },
      include: { channel: true, author: true }
    });

    if (!post) {
      return ctx.editMessageText("❌ Post not found");
    }

    const contentPreview = buildContentPreview(post);
    const keyboard = new InlineKeyboard()
      .text("⬅️ Back to Unlock", `back_to_unlock:${postId}:${post.channel.username}`);

    const previewText = 
      `👀 **Content Preview**\n\n` +
      `📝 **"${post.title}"**\n\n` +
      `${post.teaser || "No preview available"}\n\n` +
      `${contentPreview}\n\n` +
      `💡 **What you get:**\n` +
      `• Full access to premium content\n` +
      `• Support the creator directly\n` +
      `• Instant unlock after payment\n` +
      `• Access doesn't expire`;

    await ctx.editMessageText(previewText, {
      parse_mode: "Markdown",
      reply_markup: keyboard
    });

  } catch (error) {
    logger.error("Error showing content preview:", error);
    await ctx.editMessageText("❌ Error loading preview. Please try again.");
  }
}

// Show pricing information and explanation
async function showPricingInfo(ctx: BotContext, postId: string) {
  try {
    const post = await prisma.lockedPost.findUnique({
      where: { id: parseInt(postId) },
      include: { channel: true, author: true }
    });

    if (!post) {
      return ctx.editMessageText("❌ Post not found");
    }

    const price = convertFromRawUnits(post.priceAmount, post.priceToken);
    const platformFee = price * 0.05;
    const authorReceives = price * 0.95;

    const keyboard = new InlineKeyboard()
      .text("⬅️ Back to Unlock", `back_to_unlock:${postId}:${post.channel.username}`);

    const pricingText = 
      `💰 **Pricing Breakdown**\n\n` +
      `📝 **"${post.title}"**\n` +
      `👤 **Creator:** @${post.author.handle}\n\n` +
      `**Payment Structure:**\n` +
      `• Content Price: **${price} ${post.priceToken}**\n` +
      `• Platform Fee (5%): ${platformFee.toFixed(4)} ${post.priceToken}\n` +
      `• Creator Receives: ${authorReceives.toFixed(4)} ${post.priceToken}\n\n` +
      `**Why the platform fee?**\n` +
      `• Secure blockchain transactions\n` +
      `• Content hosting and delivery\n` +
      `• Support for creators\n` +
      `• Platform maintenance\n\n` +
      `_Fair pricing that supports both creators and platform sustainability._`;

    await ctx.editMessageText(pricingText, {
      parse_mode: "Markdown",
      reply_markup: keyboard
    });

  } catch (error) {
    logger.error("Error showing pricing info:", error);
    await ctx.editMessageText("❌ Error loading pricing info. Please try again.");
  }
}

// Show how the paywall system works
async function showHowItWorks(ctx: BotContext, postId: string) {
  try {
    const post = await prisma.lockedPost.findUnique({
      where: { id: parseInt(postId) },
      include: { channel: true }
    });

    if (!post) {
      return ctx.editMessageText("❌ Post not found");
    }

    const keyboard = new InlineKeyboard()
      .text("⬅️ Back to Unlock", `back_to_unlock:${postId}:${post.channel.username}`);

    const howItWorksText = 
      `❓ **How Paywalled Content Works**\n\n` +
      `**1. 🔍 Browse & Preview**\n` +
      `• See title and teaser for free\n` +
      `• Get content type preview (text, images, video)\n\n` +
      `**2. 💰 Pay to Unlock**\n` +
      `• One-time payment using crypto tokens\n` +
      `• Secure blockchain transactions\n` +
      `• Instant access after confirmation\n\n` +
      `**3. 🔓 Enjoy Content**\n` +
      `• Full access to premium content\n` +
      `• Download images and videos\n` +
      `• Access never expires\n\n` +
      `**4. 💖 Support Creators**\n` +
      `• 95% goes directly to the creator\n` +
      `• Help fund quality content creation\n` +
      `• Optional tips for extra support\n\n` +
      `**Security Features:**\n` +
      `• Blockchain-verified payments\n` +
      `• Encrypted content delivery\n` +
      `• No subscription required`;

    await ctx.editMessageText(howItWorksText, {
      parse_mode: "Markdown",
      reply_markup: keyboard
    });

  } catch (error) {
    logger.error("Error showing how it works:", error);
    await ctx.editMessageText("❌ Error loading information. Please try again.");
  }
}

// Execute the actual content unlock
async function executeContentUnlock(ctx: BotContext, postId: string) {
  await ctx.editMessageText(
    `⏳ **Processing Payment...**\n\n` +
    `Unlocking your content, please wait...\n\n` +
    `_This will integrate with the existing payment system._`,
    { parse_mode: "Markdown" }
  );
  
  // TODO: Integrate with existing payment system
  // This would call the existing unlock processing function
}

// Show unlocked content with proper formatting
async function showUnlockedContent(ctx: BotContext, post: any) {
  try {
    let message = `🔓 **"${post.title}"**\n\n`;
    
    // Add main content if available
    if (post.content) {
      message += `${post.content}\n\n`;
    }

    message += `✅ _Content unlocked successfully!_`;

    await ctx.reply(message, { parse_mode: "Markdown" });

  } catch (error) {
    logger.error("Error showing unlocked content:", error);
    await ctx.reply("❌ Error displaying content. Please try again.");
  }
}

// Build content preview based on post data
function buildContentPreview(post: any): string {
  try {
    let preview = "📋 **Content includes:**\n";
    
    if (post.content) {
      const wordCount = post.content.split(' ').length;
      preview += `• 📝 ${wordCount} words of premium content\n`;
    } else {
      preview += `• 📄 Premium content (details hidden until unlock)\n`;
    }

    return preview;
  } catch (error) {
    return "📄 Premium content available";
  }
}

// Utility function to convert from raw units  
function convertFromRawUnits(rawAmount: string | number, token: string): number {
  const decimals: Record<string, number> = {
    "USDC": 6,
    "SOL": 9,
    "BONK": 5,
    "JUP": 6
  };
  
  const decimal = decimals[token] || 6;
  const amount = typeof rawAmount === 'string' ? parseFloat(rawAmount) : rawAmount;
  return amount / Math.pow(10, decimal);
}