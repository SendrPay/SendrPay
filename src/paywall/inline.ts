import { BotContext } from "../bot";
import { db } from "../infra/prisma";
import { logger } from "../infra/logger";
import { InlineKeyboard } from "grammy";
import { resolveToken } from "../core/tokens";
import { calculatePlatformFee } from "../core/platform-fees";

// Format price for display
export function fmtPrice(post: { priceAmount: string; priceToken: string }): string {
  const token = resolveTokenSync(post.priceToken);
  const amount = parseFloat(post.priceAmount) / Math.pow(10, token?.decimals || 6);
  return `${amount} ${post.priceToken}`;
}

// Create watermark string
export function wmString(user: { username?: string; id: number }, channelId: string, txRef?: string): string {
  const username = user.username || `user${user.id}`;
  const date = new Date().toISOString().split('T')[0];
  const txShort = txRef ? txRef.slice(0, 8) : "no-tx";
  return `@${username} • Channel ${channelId} • ${date} • ${txShort}`;
}

// Sync token resolution (simple version)
function resolveTokenSync(ticker: string): { decimals: number } | null {
  const tokens: Record<string, { decimals: number }> = {
    "USDC": { decimals: 6 },
    "SOL": { decimals: 9 },
    "BONK": { decimals: 5 },
    "JUP": { decimals: 6 }
  };
  return tokens[ticker] || null;
}

// Handle unlock button click
export async function handleUnlockCallback(ctx: BotContext) {
  try {
    await ctx.answerCallbackQuery();
    
    const data = ctx.callbackQuery?.data || "";
    const match = data.match(/^unlock:(\d+)$/);
    if (!match) return;
    
    const postId = parseInt(match[1]);
    const userId = String(ctx.from!.id);
    
    // Check if user already has access
    const existingAccess = await db.postAccess.findUnique({
      where: {
        postId_userTgId: {
          postId,
          userTgId: userId
        }
      }
    });
    
    if (existingAccess) {
      const keyboard = new InlineKeyboard()
        .text("📥 Resend to DM", `resend:${postId}`)
        .text("✖️ Cancel", "cancel");
      
      return ctx.editMessageText(
        `✅ You already unlocked this post!\n\n` +
        `Want me to resend it to your DM?`,
        { 
          parse_mode: "Markdown",
          reply_markup: keyboard
        }
      );
    }
    
    // Get post details
    const post = await db.lockedPost.findUnique({
      where: { id: postId },
      include: { channel: true }
    });
    
    if (!post) {
      return ctx.editMessageText("❌ Post not found.");
    }
    
    // Calculate platform fee
    const amountBigInt = BigInt(post.priceAmount);
    const platformFee = calculatePlatformFee(amountBigInt, 'group_access');
    const netAmount = amountBigInt - platformFee;
    
    const keyboard = new InlineKeyboard()
      .text(`✅ Pay ${fmtPrice(post)}`, `unlock_go:${postId}`)
      .text("✖️ Cancel", "cancel");
    
    await ctx.editMessageText(
      `You're unlocking **${post.title ?? `Post #${postId}`}** for **${fmtPrice(post)}**.\n\n` +
      `_Creator covers a small platform fee (5%)._`,
      { 
        parse_mode: "Markdown",
        reply_markup: keyboard
      }
    );
  } catch (error) {
    logger.error("Error in handleUnlockCallback:", error);
    await ctx.editMessageText("❌ An error occurred. Please try again.");
  }
}

// Handle payment confirmation
export async function handleUnlockGoCallback(ctx: BotContext) {
  try {
    await ctx.answerCallbackQuery();
    
    const data = ctx.callbackQuery?.data || "";
    const match = data.match(/^unlock_go:(\d+)$/);
    if (!match) return;
    
    const postId = parseInt(match[1]);
    const userId = String(ctx.from!.id);
    
    // Get post and user details
    const [post, user] = await Promise.all([
      db.lockedPost.findUnique({
        where: { id: postId },
        include: { channel: true }
      }),
      db.user.findUnique({
        where: { telegramId: userId },
        include: { wallets: { where: { isActive: true } } }
      })
    ]);
    
    if (!post) {
      return ctx.editMessageText("❌ Post not found.");
    }
    
    if (!user?.wallets?.[0]) {
      return ctx.editMessageText(
        `❌ You need a wallet to unlock posts.\n\n` +
        `Use /start to set up your wallet.`,
        { parse_mode: "Markdown" }
      );
    }
    
    // Get channel owner
    const channelOwner = await db.user.findFirst({
      where: { telegramId: post.channel.ownerTgId },
      include: { wallets: { where: { isActive: true } } }
    });
    
    if (!channelOwner?.wallets?.[0]) {
      return ctx.editMessageText("❌ Channel owner wallet not found.");
    }
    
    // Create payment intent
    const intent = await createPaymentIntent({
      payerId: user.id,
      recipientId: channelOwner.id,
      amount: post.priceAmount,
      tokenTicker: post.priceToken,
      paymentType: 'post_unlock',
      metadata: { postId: String(postId) }
    });
    
    const keyboard = new InlineKeyboard()
      .text("I've paid ✅", `unlock_chk:${intent.id}:${postId}`)
      .text("✖️ Cancel", "cancel");
    
    // Generate payment deeplink
    const deeplink = `https://t.me/${ctx.me.username}?start=pay_${intent.id}`;
    
    await ctx.editMessageText(
      `💳 **Payment Required**\n\n` +
      `Amount: **${fmtPrice(post)}**\n` +
      `To: **${post.channel.channelTitle || "Channel"}**\n` +
      `Payment ID: \`${intent.id.slice(0, 8)}\`\n\n` +
      `[Click here to pay](${deeplink})\n\n` +
      `After payment, click "I've paid" below.`,
      { 
        parse_mode: "Markdown",
        reply_markup: keyboard,
        disable_web_page_preview: true
      }
    );
  } catch (error) {
    logger.error("Error in handleUnlockGoCallback:", error);
    await ctx.editMessageText("❌ Failed to create payment. Please try again.");
  }
}

// Check payment status
export async function handleUnlockCheckCallback(ctx: BotContext) {
  try {
    await ctx.answerCallbackQuery();
    
    const data = ctx.callbackQuery?.data || "";
    const match = data.match(/^unlock_chk:([^:]+):(\d+)$/);
    if (!match) return;
    
    const [intentId, postIdStr] = [match[1], match[2]];
    const postId = parseInt(postIdStr);
    const userId = String(ctx.from!.id);
    
    // Check payment status
    const result = await waitForPaymentIntent(intentId);
    
    if (!result?.success) {
      const keyboard = new InlineKeyboard()
        .text("🔁 Check again", `unlock_chk:${intentId}:${postId}`)
        .text("✖️ Cancel", "cancel");
      
      return ctx.editMessageText(
        `⏳ Payment still pending...\n\n` +
        `Please complete the payment and try again.`,
        { 
          parse_mode: "Markdown",
          reply_markup: keyboard
        }
      );
    }
    
    // Grant access
    await db.postAccess.upsert({
      where: {
        postId_userTgId: {
          postId,
          userTgId: userId
        }
      },
      update: {
        txnRef: result.signature
      },
      create: {
        postId,
        userTgId: userId,
        txnRef: result.signature
      }
    });
    
    // Get post content
    const post = await db.lockedPost.findUnique({
      where: { id: postId },
      include: { channel: true }
    });
    
    if (!post) {
      return ctx.editMessageText("❌ Post not found.");
    }
    
    // Deliver content via DM
    const watermark = wmString(ctx.from!, post.channel.tgChatId, result.signature);
    
    try {
      if (post.contentType === "text") {
        await ctx.api.sendMessage(
          ctx.from!.id,
          `${post.title ? `📝 **${post.title}**\n\n` : ""}` +
          `${post.payloadRef}\n\n` +
          `━━━━━━━━━━━━━━━\n` +
          `_${watermark}_`,
          { parse_mode: "Markdown" }
        );
      } else {
        // Send video with watermark caption
        await ctx.api.sendVideo(
          ctx.from!.id,
          post.payloadRef,
          {
            caption: `${post.title ? `🎥 **${post.title}**\n\n` : ""}` +
                    `━━━━━━━━━━━━━━━\n` +
                    `_${watermark}_`,
            parse_mode: "Markdown"
          }
        );
      }
    } catch (dmError) {
      logger.error("Error sending DM:", dmError);
      return ctx.editMessageText(
        `❌ Could not send content to your DM.\n\n` +
        `Please start a chat with me first: @${ctx.me.username}`,
        { parse_mode: "Markdown" }
      );
    }
    
    await ctx.editMessageText(
      `✅ **Unlocked!**\n\n` +
      `Check your DM for the full content.\n\n` +
      `Transaction: [View on Explorer](${result.explorerLink})`,
      { 
        parse_mode: "Markdown",
        disable_web_page_preview: true
      }
    );
    
    // Notify creator
    try {
      const creatorTgId = parseInt(post.channel.ownerTgId);
      await ctx.api.sendMessage(
        creatorTgId,
        `🔓 **Post Unlocked!**\n\n` +
        `${post.title ?? `Post #${postId}`} was unlocked by @${ctx.from!.username || ctx.from!.id}\n\n` +
        `Amount: **${fmtPrice(post)}**\n` +
        `Platform fee: **5%**\n` +
        `You received: **${(parseFloat(post.priceAmount) * 0.95 / Math.pow(10, resolveTokenSync(post.priceToken)?.decimals || 6)).toFixed(2)} ${post.priceToken}**\n\n` +
        `[View Transaction](${result.explorerLink})`,
        { 
          parse_mode: "Markdown",
          disable_web_page_preview: true
        }
      );
    } catch (notifyError) {
      logger.error("Error notifying creator:", notifyError);
    }
  } catch (error) {
    logger.error("Error in handleUnlockCheckCallback:", error);
    await ctx.editMessageText("❌ An error occurred checking payment. Please try again.");
  }
}

// Handle resend request
export async function handleResendCallback(ctx: BotContext) {
  try {
    await ctx.answerCallbackQuery();
    
    const data = ctx.callbackQuery?.data || "";
    const match = data.match(/^resend:(\d+)$/);
    if (!match) return;
    
    const postId = parseInt(match[1]);
    const userId = String(ctx.from!.id);
    
    // Verify access
    const access = await db.postAccess.findUnique({
      where: {
        postId_userTgId: {
          postId,
          userTgId: userId
        }
      }
    });
    
    if (!access) {
      return ctx.editMessageText("❌ You don't have access to this post.");
    }
    
    // Get post content
    const post = await db.lockedPost.findUnique({
      where: { id: postId },
      include: { channel: true }
    });
    
    if (!post) {
      return ctx.editMessageText("❌ Post not found.");
    }
    
    // Resend content with watermark
    const watermark = wmString(ctx.from!, post.channel.tgChatId, access.txnRef || undefined);
    
    try {
      if (post.contentType === "text") {
        await ctx.api.sendMessage(
          ctx.from!.id,
          `${post.title ? `📝 **${post.title}**\n\n` : ""}` +
          `${post.payloadRef}\n\n` +
          `━━━━━━━━━━━━━━━\n` +
          `_${watermark}_`,
          { parse_mode: "Markdown" }
        );
      } else {
        await ctx.api.sendVideo(
          ctx.from!.id,
          post.payloadRef,
          {
            caption: `${post.title ? `🎥 **${post.title}**\n\n` : ""}` +
                    `━━━━━━━━━━━━━━━\n` +
                    `_${watermark}_`,
            parse_mode: "Markdown"
          }
        );
      }
      
      await ctx.editMessageText(
        `✅ **Resent!**\n\n` +
        `Check your DM for the content.`,
        { parse_mode: "Markdown" }
      );
    } catch (dmError) {
      logger.error("Error resending content:", dmError);
      await ctx.editMessageText(
        `❌ Could not send content to your DM.\n\n` +
        `Please start a chat with me first: @${ctx.me.username}`,
        { parse_mode: "Markdown" }
      );
    }
  } catch (error) {
    logger.error("Error in handleResendCallback:", error);
    await ctx.editMessageText("❌ An error occurred. Please try again.");
  }
}

// Handle channel tip button
export async function handleChannelTipCallback(ctx: BotContext) {
  try {
    await ctx.answerCallbackQuery();
    
    const data = ctx.callbackQuery?.data || "";
    const match = data.match(/^tip_channel:(.+)$/);
    if (!match) return;
    
    const channelId = match[1];
    
    // Get channel details
    const channel = await db.kolChannel.findUnique({
      where: { tgChatId: channelId }
    });
    
    if (!channel) {
      return ctx.editMessageText("❌ Channel not found.");
    }
    
    // Parse tip presets
    const presets = JSON.parse(channel.tipPresets);
    const keyboard = new InlineKeyboard();
    
    // Add preset buttons
    presets.forEach((amount: number, i: number) => {
      keyboard.text(`${amount} ${channel.defaultToken}`, `tip_amount:${channelId}:${amount}:${channel.defaultToken}`);
      if ((i + 1) % 3 === 0) keyboard.row();
    });
    
    keyboard.row()
      .text("💎 Custom Amount", `tip_custom:${channelId}:${channel.defaultToken}`)
      .text("✖️ Cancel", "cancel");
    
    await ctx.editMessageText(
      `💖 **Send a Tip**\n\n` +
      `Select tip amount for **${channel.channelTitle || "this channel"}**:`,
      { 
        parse_mode: "Markdown",
        reply_markup: keyboard
      }
    );
  } catch (error) {
    logger.error("Error in handleChannelTipCallback:", error);
    await ctx.editMessageText("❌ An error occurred. Please try again.");
  }
}

// Handle cancel button
export async function handleCancelCallback(ctx: BotContext) {
  await ctx.answerCallbackQuery("Cancelled");
  await ctx.deleteMessage().catch(() => {});
}

// Register all paywall callbacks
export function registerPaywallCallbacks(bot: any) {
  bot.callbackQuery(/^unlock:\d+$/, handleUnlockCallback);
  bot.callbackQuery(/^unlock_go:\d+$/, handleUnlockGoCallback);
  bot.callbackQuery(/^unlock_chk:[^:]+:\d+$/, handleUnlockCheckCallback);
  bot.callbackQuery(/^resend:\d+$/, handleResendCallback);
  bot.callbackQuery(/^tip_channel:.+$/, handleChannelTipCallback);
  bot.callbackQuery("cancel", handleCancelCallback);
}