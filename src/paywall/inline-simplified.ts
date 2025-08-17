import { BotContext } from "../bot";
import { prisma } from "../infra/prisma";
import { logger } from "../infra/logger";
import { InlineKeyboard } from "grammy";
import { resolveToken } from "../core/tokens";
import { calculatePlatformFee, executePaymentWithPlatformFee } from "../core/platform-fees";
import { v4 as uuidv4 } from 'uuid';

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
    const existingAccess = await prisma.postAccess.findUnique({
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
    const post = await prisma.lockedPost.findUnique({
      where: { id: postId },
      include: { channel: true }
    });
    
    if (!post) {
      return ctx.editMessageText("❌ Post not found.");
    }
    
    // Store unlock intent in session
    (ctx.session as any).unlockIntent = {
      postId,
      channelId: post.channel.tgChatId,
      ownerTgId: post.channel.ownerTgId,
      priceAmount: post.priceAmount,
      priceToken: post.priceToken,
      title: post.title
    };
    
    const keyboard = new InlineKeyboard()
      .text(`✅ Pay ${fmtPrice(post)}`, `unlock_pay:${postId}`)
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

// Handle payment execution
export async function handleUnlockPayCallback(ctx: BotContext) {
  try {
    await ctx.answerCallbackQuery("Processing payment...");
    
    const data = ctx.callbackQuery?.data || "";
    const match = data.match(/^unlock_pay:(\d+)$/);
    if (!match) return;
    
    const postId = parseInt(match[1]);
    const userId = String(ctx.from!.id);
    const session = ctx.session as any;
    
    if (!session.unlockIntent || session.unlockIntent.postId !== postId) {
      return ctx.editMessageText("❌ Session expired. Please try again.");
    }
    
    // Get post and check again
    const post = await prisma.lockedPost.findUnique({
      where: { id: postId },
      include: { channel: true }
    });
    
    if (!post) {
      return ctx.editMessageText("❌ Post not found.");
    }
    
    // Verify user is signed up and has funds
    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) }
    });
    
    if (!user) {
      // Send DM instead of editing public message
      try {
        await ctx.api.sendMessage(
          ctx.from!.id,
          `❌ **Account Required**\n\n` +
          `You need to create an account first. Send me /start in a private message to get started.\n\n` +
          `[Start here](https://t.me/${ctx.me.username})`,
          { parse_mode: "Markdown" }
        );
        return ctx.editMessageText("🔒 Payment processing moved to DM for privacy.");
      } catch (dmError) {
        return ctx.editMessageText("❌ Please start a private chat with me first to process payments.");
      }
    }

    // Check if user has sufficient funds before proceeding
    const tokenAmount = parseFloat(post.priceAmount) / Math.pow(10, resolveTokenSync(post.priceToken)?.decimals || 6);
    
    // Note: We'll let the payment function handle insufficient funds validation
    // This keeps the payment flow consistent and maintains error handling
    
    // Execute payment with platform fee
    const amount = parseFloat(post.priceAmount) / Math.pow(10, resolveTokenSync(post.priceToken)?.decimals || 6);
    
    const result = await executePaymentWithPlatformFee({
      senderId: userId,
      recipientId: post.channel.ownerTgId,
      tokenTicker: post.priceToken,
      amount,
      paymentType: 'group_access',
      platformFeePercent: 0.05,
      note: `Unlock: ${post.title || `Post #${postId}`}`
    });
    
    if (!result.success) {
      // Send failure notification via DM for privacy
      try {
        await ctx.api.sendMessage(
          ctx.from!.id,
          `❌ **Payment Failed**\n\n` +
          `${result.error}\n\n` +
          `Please check your balance and try again.\n\n` +
          `Use /balance to check your wallet.`,
          { parse_mode: "Markdown" }
        );
        return ctx.editMessageText("🔒 Payment details sent to your DM.");
      } catch (dmError) {
        return ctx.editMessageText(
          `❌ Payment failed: ${result.error}\n\n` +
          `Please check your balance and try again.`,
          { parse_mode: "Markdown" }
        );
      }
    }
    
    // Grant access
    await prisma.postAccess.create({
      data: {
        postId,
        userTgId: userId,
        txnRef: result.signature
      }
    });
    
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
    
    // Clear session
    delete session.unlockIntent;
    
    // Send success confirmation via DM for privacy
    try {
      await ctx.api.sendMessage(
        ctx.from!.id,
        `✅ **Payment Successful!**\n\n` +
        `You've unlocked: **${post.title || `Post #${postId}`}**\n\n` +
        `Amount paid: **${amount} ${post.priceToken}**\n` +
        `Transaction: [View on Explorer](${result.explorerLink})\n\n` +
        `Content delivered above. ⬆️`,
        { 
          parse_mode: "Markdown"
        }
      );
    } catch (dmError) {
      logger.error("Error sending payment confirmation DM:", dmError);
    }
    
    // Update public message to show completion without details
    await ctx.editMessageText(
      `🔓 **Unlocked!**\n\n` +
      `Content has been sent to your DM.\n\n` +
      `_Privacy protected - details in your DM_`,
      { parse_mode: "Markdown" }
    );
    
    // Notify creator
    try {
      const creatorTgId = parseInt(post.channel.ownerTgId);
      const netAmount = amount * 0.95; // After 5% fee
      
      await ctx.api.sendMessage(
        creatorTgId,
        `🔓 **Post Unlocked!**\n\n` +
        `${post.title ?? `Post #${postId}`} was unlocked by @${ctx.from!.username || ctx.from!.id}\n\n` +
        `Amount: **${amount} ${post.priceToken}**\n` +
        `Platform fee: **5%**\n` +
        `You received: **${netAmount.toFixed(2)} ${post.priceToken}**\n\n` +
        `[View Transaction](${result.explorerLink})`,
        { 
          parse_mode: "Markdown"
        }
      );
    } catch (notifyError) {
      logger.error("Error notifying creator:", notifyError);
    }
  } catch (error) {
    logger.error("Error in handleUnlockPayCallback:", error);
    await ctx.editMessageText("❌ An error occurred processing payment. Please try again.");
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
    const access = await prisma.postAccess.findUnique({
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
    const post = await prisma.lockedPost.findUnique({
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
    const channel = await prisma.kolChannel.findUnique({
      where: { tgChatId: channelId }
    });
    
    if (!channel) {
      return ctx.editMessageText("❌ Channel not found.");
    }
    
    // Store tip intent in session
    (ctx.session as any).channelTipIntent = {
      channelId,
      ownerTgId: channel.ownerTgId,
      channelTitle: channel.channelTitle,
      defaultToken: channel.defaultToken
    };
    
    // Parse tip presets
    const presets = JSON.parse(channel.tipPresets);
    const keyboard = new InlineKeyboard();
    
    // Add preset buttons
    presets.forEach((amount: number, i: number) => {
      keyboard.text(`${amount} ${channel.defaultToken}`, `channel_tip_amount:${amount}:${channel.defaultToken}`);
      if ((i + 1) % 3 === 0) keyboard.row();
    });
    
    keyboard.row()
      .text("💎 Custom Amount", `channel_tip_custom`)
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

// Handle channel tip amount selection
export async function handleChannelTipAmountCallback(ctx: BotContext) {
  try {
    await ctx.answerCallbackQuery("Processing tip...");
    
    const data = ctx.callbackQuery?.data || "";
    const match = data.match(/^channel_tip_amount:(\d+(?:\.\d+)?):([A-Z]+)$/);
    if (!match) return;
    
    const [_, amountStr, token] = match;
    const amount = parseFloat(amountStr);
    const userId = String(ctx.from!.id);
    const session = ctx.session as any;
    
    if (!session.channelTipIntent) {
      return ctx.editMessageText("❌ Session expired. Please try again.");
    }
    
    // Execute tip payment with 2% platform fee
    const result = await executePaymentWithPlatformFee({
      senderId: userId,
      recipientId: session.channelTipIntent.ownerTgId,
      tokenTicker: token,
      amount,
      paymentType: 'tip',
      platformFeePercent: 0.02,
      note: `Tip to ${session.channelTipIntent.channelTitle || "channel"}`
    });
    
    if (!result.success) {
      return ctx.editMessageText(
        `❌ Tip failed: ${result.error}\n\n` +
        `Please check your balance and try again.`,
        { parse_mode: "Markdown" }
      );
    }
    
    // Clear session
    delete session.channelTipIntent;
    
    await ctx.editMessageText(
      `✅ **Tip Sent!**\n\n` +
      `You sent **${amount} ${token}** to the channel.\n\n` +
      `[View Transaction](${result.explorerLink})`,
      { 
        parse_mode: "Markdown"
      }
    );
    
    // Notify channel owner
    try {
      const ownerTgId = parseInt(session.channelTipIntent?.ownerTgId || "0");
      const netAmount = amount * 0.98; // After 2% fee
      
      await ctx.api.sendMessage(
        ownerTgId,
        `💖 **Tip Received!**\n\n` +
        `@${ctx.from!.username || ctx.from!.id} sent you a tip!\n\n` +
        `Amount: **${amount} ${token}**\n` +
        `Platform fee: **2%**\n` +
        `You received: **${netAmount.toFixed(2)} ${token}**\n\n` +
        `[View Transaction](${result.explorerLink})`,
        { 
          parse_mode: "Markdown"
        }
      );
    } catch (notifyError) {
      logger.error("Error notifying owner:", notifyError);
    }
  } catch (error) {
    logger.error("Error in handleChannelTipAmountCallback:", error);
    await ctx.editMessageText("❌ An error occurred processing tip. Please try again.");
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
  bot.callbackQuery(/^unlock_pay:\d+$/, handleUnlockPayCallback);
  bot.callbackQuery(/^resend:\d+$/, handleResendCallback);
  bot.callbackQuery(/^tip_channel:.+$/, handleChannelTipCallback);
  bot.callbackQuery(/^channel_tip_amount:/, handleChannelTipAmountCallback);
  bot.callbackQuery("channel_tip_custom", async (ctx: BotContext) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `💎 **Custom Tip Amount**\n\n` +
      `Please send the amount you want to tip (e.g., "10" for 10 tokens):`,
      { parse_mode: "Markdown" }
    );
    (ctx.session as any).channelTipIntent.awaitingCustomAmount = true;
  });
  bot.callbackQuery("cancel", handleCancelCallback);
}