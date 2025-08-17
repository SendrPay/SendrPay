import { BotContext } from "../bot";
import { prisma } from "../infra/prisma";
import { logger } from "../infra/logger";
import { InlineKeyboard } from "grammy";
import { resolveToken } from "../core/tokens";
import { executeTransfer } from "../core/transfer";
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
      // Send DM instead of editing channel message
      try {
        await ctx.api.sendMessage(
          ctx.from!.id,
          `✅ **You already unlocked this post!**\n\n` +
          `Want me to resend the content to you?`,
          { 
            parse_mode: "Markdown",
            reply_markup: new InlineKeyboard()
              .text("📥 Resend Content", `resend:${postId}`)
              .text("✖️ Cancel", "cancel")
          }
        );
        return ctx.answerCallbackQuery("Check your DM for options!");
      } catch (dmError) {
        return ctx.answerCallbackQuery("Please start a chat with me first: @" + ctx.me.username);
      }
    }
    
    // Get post details
    const post = await prisma.lockedPost.findUnique({
      where: { id: postId },
      include: { channel: true }
    });
    
    if (!post) {
      return ctx.editMessageText("❌ Post not found.");
    }
    
    // Send payment confirmation in DM instead of editing channel message
    try {
      // Embed all necessary data in the callback to avoid session dependency
      const unlockData = `${postId}:${post.channel.ownerTgId}:${post.priceAmount}:${post.priceToken}`;
      const keyboard = new InlineKeyboard()
        .text(`✅ Pay ${fmtPrice(post)}`, `unlock_pay:${unlockData}`)
        .text("✖️ Cancel", "cancel");
      
      await ctx.api.sendMessage(
        ctx.from!.id,
        `🔓 **Unlock Content**\n\n` +
        `**${post.title ?? `Post #${postId}`}**\n` +
        `Price: **${fmtPrice(post)}**\n\n` +
        `_Platform fee (5%) covered by creator_\n\n` +
        `Ready to unlock this content?`,
        { 
          parse_mode: "Markdown",
          reply_markup: keyboard
        }
      );
      
      return ctx.answerCallbackQuery("Check your DM to complete payment!");
    } catch (dmError) {
      return ctx.answerCallbackQuery("Please start a chat with me first: @" + ctx.me.username);
    }
  } catch (error) {
    logger.error("Error in handleUnlockCallback:", error);
    return ctx.answerCallbackQuery("❌ An error occurred. Please try again.");
  }
}

// Handle payment execution
export async function handleUnlockPayCallback(ctx: BotContext) {
  try {
    await ctx.answerCallbackQuery("Processing payment...");
    
    const data = ctx.callbackQuery?.data || "";
    logger.info(`Processing unlock payment callback: ${data}`);
    
    const match = data.match(/^unlock_pay:(\d+):([^:]+):([^:]+):([^:]+)$/);
    if (!match) {
      logger.error(`Invalid callback data format: ${data}`);
      return ctx.editMessageText("❌ Invalid payment data. Please try again.");
    }
    
    const [_, postIdStr, ownerTgId, priceAmount, priceToken] = match;
    const postId = parseInt(postIdStr);
    const userId = String(ctx.from!.id);
    
    logger.info(`Payment details: postId=${postId}, userId=${userId}, amount=${priceAmount}, token=${priceToken}`);
    
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
      where: { telegramId: userId },
      include: { wallets: { where: { isActive: true } } }
    });
    
    if (!user || !user.wallets?.[0]) {
      // User needs to create account first
      try {
        await ctx.api.sendMessage(
          ctx.from!.id,
          `❌ **Account Required**\n\n` +
          `You need to create an account first. Send me /start to get started.\n\n` +
          `[Start here](https://t.me/${ctx.me.username})`,
          { parse_mode: "Markdown" }
        );
        return ctx.answerCallbackQuery("Check your DM to create an account!");
      } catch (dmError) {
        return ctx.answerCallbackQuery("Please start a chat with me first: @" + ctx.me.username);
      }
    }

    // Check if user has sufficient funds before proceeding
    const tokenAmount = parseFloat(post.priceAmount) / Math.pow(10, resolveTokenSync(post.priceToken)?.decimals || 6);
    
    // Note: We'll let the payment function handle insufficient funds validation
    // This keeps the payment flow consistent and maintains error handling
    
    // Resolve token to get proper decimals
    const tokenInfo = await resolveToken(priceToken);
    if (!tokenInfo) {
      logger.error(`Token not found: ${priceToken}`);
      return ctx.editMessageText(
        `❌ **Token Error**\n\n` +
        `Token "${priceToken}" not recognized.\n\n` +
        `Please contact support.`,
        { parse_mode: "Markdown" }
      );
    }
    
    // Get recipient user and wallet
    const recipient = await prisma.user.findUnique({
      where: { telegramId: ownerTgId },
      include: { wallets: { where: { isActive: true } } }
    });
    
    if (!recipient?.wallets?.[0]) {
      return ctx.editMessageText(
        `❌ **Creator Wallet Error**\n\n` +
        `Content creator hasn't set up their wallet yet.\n\n` +
        `Please contact the creator.`,
        { parse_mode: "Markdown" }
      );
    }
    
    // Use the working executeTransfer function instead
    const amountRaw = BigInt(priceAmount);
    const serviceFeeRaw = amountRaw * 5n / 100n; // 5% platform fee
    const netAmountRaw = amountRaw - serviceFeeRaw;
    
    logger.info(`PAYMENT DEBUG: amount=${priceAmount} raw units ${priceToken}, serviceFee=${serviceFeeRaw}`);
    logger.info(`PAYMENT DEBUG: from=${user.wallets[0].address}, to=${recipient.wallets[0].address}`);
    logger.info(`PAYMENT DEBUG: sender TG=${userId}, recipient TG=${ownerTgId}`);
    
    const result = await executeTransfer({
      fromWallet: { address: user.wallets[0].address },
      toAddress: recipient.wallets[0].address,
      mint: tokenInfo.mint,
      amountRaw: netAmountRaw,
      feeRaw: 0n,
      serviceFeeRaw,
      token: tokenInfo,
      senderTelegramId: userId,
      recipientTelegramId: ownerTgId,
      note: `Unlock: ${post.title || `Post #${postId}`}`,
      type: "group_access"
    });
    
    logger.info(`Transfer result: success=${result.success}, error=${result.error}`);
    
    if (!result.success) {
      return ctx.editMessageText(
        `❌ **Payment Failed**\n\n` +
        `${result.error}\n\n` +
        `Please check your balance and try again.\n\n` +
        `Use /balance to check your wallet.`,
        { 
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text("🔓 Try Again", `unlock:${postId}`)
        }
      );
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
      // Parse the new mixed content format
      const content = JSON.parse(post.payloadRef);
      const { textContent, attachments } = content;
      
      // Send text content first if exists
      if (textContent && textContent.trim()) {
        await ctx.api.sendMessage(
          ctx.from!.id,
          `${post.title ? `📝 **${post.title}**\n\n` : ""}` +
          `${textContent}\n\n` +
          `━━━━━━━━━━━━━━━\n` +
          `_${watermark}_`,
          { parse_mode: "Markdown" }
        );
      }
      
      // Send media attachments
      if (attachments && attachments.length > 0) {
        for (let i = 0; i < attachments.length; i++) {
          const attachment = attachments[i];
          
          if (attachment.type === "photo") {
            await ctx.api.sendPhoto(
              ctx.from!.id,
              attachment.file_id,
              {
                caption: `${post.title && !textContent ? `🖼️ **${post.title}**\n\n` : ""}` +
                        `${attachments.length > 1 ? `Image ${i + 1} of ${attachments.length}\n` : ""}` +
                        `━━━━━━━━━━━━━━━\n` +
                        `_${watermark}_`,
                parse_mode: "Markdown"
              }
            );
          } else if (attachment.type === "video") {
            await ctx.api.sendVideo(
              ctx.from!.id,
              attachment.file_id,
              {
                caption: `${post.title && !textContent ? `🎥 **${post.title}**\n\n` : ""}` +
                        `━━━━━━━━━━━━━━━\n` +
                        `_${watermark}_`,
                parse_mode: "Markdown"
              }
            );
          }
        }
      }
      
      // If no content at all, send title only
      if ((!textContent || !textContent.trim()) && (!attachments || attachments.length === 0)) {
        await ctx.api.sendMessage(
          ctx.from!.id,
          `${post.title ? `📝 **${post.title}**\n\n` : ""}` +
          `[Content unavailable]\n\n` +
          `━━━━━━━━━━━━━━━\n` +
          `_${watermark}_`,
          { parse_mode: "Markdown" }
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
    
    // Session data no longer needed since we use callback data
    
    // Send success confirmation via DM for privacy
    try {
      await ctx.api.sendMessage(
        ctx.from!.id,
        `✅ **Payment Successful!**\n\n` +
        `You've unlocked: **${post.title || `Post #${postId}`}**\n\n` +
        `Amount paid: **${(Number(amountRaw) / Math.pow(10, tokenInfo.decimals)).toFixed(6)} ${priceToken}**\n` +
        `Transaction: [View on Explorer](https://explorer.solana.com/tx/${result.signature}?cluster=devnet)\n\n` +
        `Content delivered above. ⬆️`,
        { 
          parse_mode: "Markdown"
        }
      );
    } catch (dmError) {
      logger.error("Error sending payment confirmation DM:", dmError);
    }
    
    // Update DM message to show completion
    await ctx.editMessageText(
      `✅ **Content Unlocked!**\n\n` +
      `**${post.title || `Post #${postId}`}** has been unlocked and delivered.\n\n` +
      `Content is now available above. ⬆️`,
      { parse_mode: "Markdown" }
    );
    
    // Notify creator
    try {
      const creatorTgId = parseInt(post.channel.ownerTgId);
      const netAmount = (Number(amountRaw) / Math.pow(10, tokenInfo.decimals)) * 0.95; // After 5% fee
      
      await ctx.api.sendMessage(
        creatorTgId,
        `🔓 **Post Unlocked!**\n\n` +
        `${post.title ?? `Post #${postId}`} was unlocked by @${ctx.from!.username || ctx.from!.id}\n\n` +
        `Amount: **${(Number(amountRaw) / Math.pow(10, tokenInfo.decimals)).toFixed(6)} ${priceToken}**\n` +
        `Platform fee: **5%**\n` +
        `You received: **${(Number(netAmountRaw) / Math.pow(10, tokenInfo.decimals)).toFixed(6)} ${priceToken}**\n\n` +
        `[View Transaction](https://explorer.solana.com/tx/${result.signature}?cluster=devnet)`,
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
    
    // Get tip details from session - this function still uses sessions for tips
    // For now, return an error - channel tips need to be updated to work like unlock payments
    return ctx.editMessageText(
      `❌ **Channel tips temporarily disabled**\n\n` +
      `Use the unlock payment system for now.\n\n` +
      `We're updating the tip system to match the working unlock flow.`,
      { parse_mode: "Markdown" }
    );
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
  bot.callbackQuery(/^unlock_pay:\d+:\d+:\d+:[A-Z]+$/, handleUnlockPayCallback);
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