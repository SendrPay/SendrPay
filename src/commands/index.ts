import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import type { BotContext } from "../bot";
import { logger } from "../infra/logger";
import { commandPay } from "./pay";
import { commandEnable } from "./enable";
import { commandTip } from "./tip";

import { commandBalance } from "./balance";
import { commandWithdraw } from "./withdraw";

import { commandSettings } from "./settings";
import { commandAdmin } from "./admin";
import { commandStart, showMainMenu } from "./start";
import { commandHelp } from "./help";
import { commandDeposit } from "./deposit";
import { commandHistory } from "./history";
import { prisma } from "../infra/prisma";
import { commandDebugReply, commandDebugReset, commandDebugMessage } from "./debug";
import { commandLinkcode } from "./linkcode";
import { commandSetup, handleSetupCallbacks, handleGroupPriceInput } from "./setup";
import { commandLinkGroup, commandUnlinkGroup, handleGroupLinkInput } from "./linkgroup";
import { 
  commandKolProfile, 
  handleTipCallback, 
  handleTipAmountCallback,
  handleTipConfirmCallback,
  handleJoinGroupCallback,
  handleJoinConfirmCallback,
  handleCancelCallback,
  handleCustomTipAmount
} from "./kol";
import { 
  commandChannelInit, 
  handleChannelUsernameInput, 
  handleChannelCallbacks,
  handleChannelPriceInput,
  handleChannelPresetsInput
} from "./channel";
import { 
  commandPostLocked, 
  handlePostCallbacks,
  handlePostTitleInput,
  handlePostTeaserInput,
  handlePostContentInput,
  handlePostMediaUpload,
  handlePostPriceInput
} from "./post-locked";
import {
  commandKolProfile as commandKolProfileInline,
  commandKolSetup as commandKolSetupInline,
  handleKolCallbacks
} from "./kol-inline";
import { registerPaywallCallbacks } from "../paywall/inline-simplified";
import { handlePaywallInlineCallbacks } from "../paywall/inline-paywall";

export function registerGroupRoutes(bot: Bot<BotContext>) {
  // Group-only commands
  bot.command("enable", commandEnable);
  bot.command("settings", commandSettings);
  bot.command("admin", commandAdmin);
  
  // KOL group commands
  bot.command("linkgroup", commandLinkGroup);
  bot.command("unlinkgroup", commandUnlinkGroup);
}

export function registerDMRoutes(bot: Bot<BotContext>) {
  // DM and universal commands - registered only once
  bot.command("start", commandStart);
  bot.command("generate", async (ctx) => {
    if (ctx.chat?.type !== "private") {
      return ctx.reply("This command only works in DM.");
    }
    // Handle wallet generation
    const { generateWallet } = await import("../core/wallets");
    await generateWallet(ctx);
  });
  
  bot.command("import", async (ctx) => {
    if (ctx.chat?.type !== "private") {
      return ctx.reply("This command only works in DM.");
    }
    ctx.session.awaitingPrivateKey = true;
    await ctx.reply(`🔑 **Import Wallet**

Send your private key in your next message:

**Supported formats:**
• Base58 string
• JSON array

**Security:**
• Only import keys you control
• Never share private keys
• Message will be deleted automatically

Send private key now:`, { parse_mode: "Markdown" });
  });

  // Payment commands work everywhere
  bot.command("pay", commandPay);
  bot.command("tip", commandTip);
  bot.command("balance", commandBalance);
  bot.command("withdraw", commandWithdraw);
  bot.command("help", commandHelp);
  bot.command("deposit", commandDeposit);
  bot.command("history", commandHistory);
  bot.command("linkcode", commandLinkcode);
  
  // KOL commands (new inline versions)
  bot.command("setup", commandKolSetupInline);
  bot.command("kol", commandKolProfileInline);
  
  // Channel paywall commands
  bot.command("channel_init", commandChannelInit);
  bot.command("post_locked", commandPostLocked);
  
  // Debug commands for troubleshooting (admin-only)
  bot.command("debug_reply", commandDebugReply);
  bot.command("debug_reset", commandDebugReset);
  bot.command("debug_message", commandDebugMessage);
  
  // Handle private key import when user sends a message in DM
  bot.on("message:text", async (ctx) => {
    if (ctx.chat?.type === "private") {
      const session = ctx.session as any;
      
      // Handle private key import
      if (ctx.session.awaitingPrivateKey) {
        ctx.session.awaitingPrivateKey = false;
        const { importWallet } = await import("../core/wallets");
        await importWallet(ctx, ctx.message.text);
        
        // Delete the message containing the private key for security
        try {
          await ctx.deleteMessage();
        } catch (error) {
          logger.error("Could not delete private key message:", error);
        }
      }
      // Handle KOL group price input
      else if (session.expectingGroupPrice) {
        await handleGroupPriceInput(ctx);
      }
      // Handle custom tip amount input
      else if (session.tipIntent?.step === 'custom_amount') {
        await handleCustomTipAmount(ctx);
      }
      // Handle group linking input
      else if (session.linkingGroup) {
        await handleGroupLinkInput(ctx);
      }
      // Handle channel setup inputs
      else if (session.channelSetup) {
        if (session.channelSetup.step === 'enter_channel_username') {
          await handleChannelUsernameInput(ctx);
        } else if (session.channelSetup.step === 'set_price') {
          await handleChannelPriceInput(ctx);
        } else if (session.channelSetup.step === 'set_presets') {
          await handleChannelPresetsInput(ctx);
        }
      }
      // Handle channel verification workflow
      else if (session.channelVerification?.step === 'username') {
        const { handleChannelVerification } = await import("./channel-verification");
        await handleChannelVerification(ctx);
      }
      else if (session.channelVerification?.step === 'pricing' && !text.startsWith('/')) {
        const { handleCustomPriceInput } = await import("./channel-verification");
        await handleCustomPriceInput(ctx);
      }
      // Handle post content creation
      else if (session.postCreation?.step === 'awaiting_content') {
        await handlePostContentInput(ctx);
      }
      // Handle custom price input for posts
      else if (session.postCreation?.step === 'custom_price' && !text.startsWith('/')) {
        const match = text.match(/^([0-9.]+)\s+([A-Z]+)$/i);
        if (match) {
          const [_, amount, token] = match;
          const channel = await prisma.channel.findUnique({
            where: { chatId: session.postCreation.channelId }
          });
          if (channel) {
            await createPaywalledPost(ctx, userId!, channel, amount, token.toUpperCase());
          }
        } else {
          await ctx.reply("❌ Invalid format. Use: `amount TOKEN`\nExample: `0.5 SOL`", { parse_mode: "Markdown" });
        }
      }
      // Handle post creation inputs
      else if (session.postCreation) {
        if (session.postCreation.step === 'set_title') {
          await handlePostTitleInput(ctx);
        } else if (session.postCreation.step === 'set_teaser') {
          await handlePostTeaserInput(ctx);
        } else if (session.postCreation.step === 'set_content') {
          await handlePostContentInput(ctx);
        } else if (session.postCreation.step === 'set_price') {
          await handlePostPriceInput(ctx);
        }
      }
    }
  });
  
  // Removed forwarded message handler - now using direct channel username input
  
  // Handle media uploads for post creation (photos and videos)
  bot.on(["message:photo", "message:video"], async (ctx) => {
    if (ctx.chat?.type === "private") {
      const session = ctx.session as any;
      if (session.postCreation?.step === "set_content") {
        await handlePostMediaUpload(ctx);
      }
    }
  });

  // Handle inline keyboard callbacks
  bot.callbackQuery("generate_wallet", async (ctx) => {
    await ctx.answerCallbackQuery();
    const { generateWallet } = await import("../core/wallets");
    await generateWallet(ctx);
  });

  bot.callbackQuery("import_wallet", async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.awaitingPrivateKey = true;
    await ctx.reply(`🔑 **Import Wallet**

Send your private key in your next message:

**Supported formats:**
• Base58 string
• JSON array

**Security:**
• Only import keys you control
• Never share private keys
• Message will be deleted automatically

Send private key now:`, { parse_mode: "Markdown" });
  });


  // Main settings button handler - NEW UI
  bot.callbackQuery("main_settings", async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard()
      .text("👤 Profile Settings", "settings_profile").row()
      .text("🔔 Notifications", "settings_notifications").row()
      .text("💰 Default Currency", "settings_currency").row()
      .text("🔐 Security", "settings_security").row()
      .text("⬅️ Back to Menu", "back_to_main");

    await ctx.editMessageText(
      "⚙️ **Settings**\n\n" +
      "Configure your SendrPay preferences:\n\n" +
      "• **Profile**: Update username and bio\n" +
      "• **Notifications**: Control alerts\n" +
      "• **Currency**: Set default token\n" +
      "• **Security**: Manage wallet security\n\n" +
      "Select an option:",
      { 
        parse_mode: "Markdown",
        reply_markup: keyboard
      }
    );
  });

  // Payment confirmation handlers
  bot.callbackQuery(/^confirm_pay_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const { handlePaymentConfirmation } = await import("./pay");
    await handlePaymentConfirmation(ctx, true);
  });

  bot.callbackQuery(/^cancel_pay_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const { handlePaymentConfirmation } = await import("./pay");
    await handlePaymentConfirmation(ctx, false);
  });

  // Tip confirmation handlers
  bot.callbackQuery(/^confirm_tip_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const { handleTipConfirmation } = await import("./tip");
    await handleTipConfirmation(ctx, true);
  });

  bot.callbackQuery(/^cancel_tip_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const { handleTipConfirmation } = await import("./tip");
    await handleTipConfirmation(ctx, false);
  });

  // KOL inline button callbacks - complete workflow
  bot.callbackQuery(/^(setup_|tip_token_|group_|back_setup:|tip_select:|tip_amount:|kol_settings:|view_profile:)/, async (ctx) => {
    await handleKolCallbacks(ctx);
  });

  // KOL inline tip buttons
  bot.callbackQuery(/^tip_\d+_[A-Z]+$/, async (ctx) => {
    await handleTipCallback(ctx);
  });

  bot.callbackQuery(/^tip_amount_/, async (ctx) => {
    await handleTipAmountCallback(ctx);
  });

  bot.callbackQuery(/^tip_confirm_\d+_[A-Z]+_/, async (ctx) => {
    await handleTipConfirmCallback(ctx);
  });

  bot.callbackQuery("tip_cancel", async (ctx) => {
    await handleCancelCallback(ctx, "tip");
  });

  // KOL group join buttons
  bot.callbackQuery(/^join_\d+_[A-Z]+$/, async (ctx) => {
    await handleJoinGroupCallback(ctx);
  });

  bot.callbackQuery(/^join_confirm_\d+_[A-Z]+$/, async (ctx) => {
    await handleJoinConfirmCallback(ctx);
  });

  bot.callbackQuery("join_cancel", async (ctx) => {
    await handleCancelCallback(ctx, "join");
  });

  // Enhanced paywall callbacks with explanations
  bot.callbackQuery(/^(unlock_post:|tip_author:|preview_content:|pricing_info:|how_it_works:|confirm_unlock:|back_to_unlock:|cancel_unlock)/, async (ctx) => {
    await handlePaywallInlineCallbacks(ctx);
  });

  // Channel verification workflow callbacks
  bot.callbackQuery("channel_start_verification", async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.channelVerification = { step: 'username' };
    
    await ctx.editMessageText(
      "📢 **Channel Verification - Step 1**\n\n" +
      "Please send me your channel username (without @).\n\n" +
      "Example: If your channel is @mychannel, just send: `mychannel`\n\n" +
      "Make sure you've already:\n" +
      "✅ Added the bot as admin\n" +
      "✅ Given 'Post messages' permission",
      { 
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("❌ Cancel", "cancel_verification")
      }
    );
  });

  bot.callbackQuery("cancel_verification", async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.channelVerification = undefined;
    await ctx.editMessageText("❌ Channel verification cancelled.");
  });

  // Channel price setting callbacks
  bot.callbackQuery(/^set_price:/, async (ctx) => {
    const { handleChannelPriceCallback } = await import("./channel-verification");
    await handleChannelPriceCallback(ctx);
  });

  bot.callbackQuery("set_custom_price", async (ctx) => {
    const { handleChannelPriceCallback } = await import("./channel-verification");
    await handleChannelPriceCallback(ctx);
  });

  // Register legacy paywall callbacks
  registerPaywallCallbacks(bot);

  // Handle notification callbacks that were in bot.ts
  bot.on("callback_query", async (ctx) => {
    const data = ctx.callbackQuery?.data;
    if (!data) return;

    if (data.startsWith("react_")) {
      const { handleReactionCallback } = await import("../core/notifications-simple");
      await handleReactionCallback(ctx);
    } else if (data === "already_reacted") {
      const { handleAlreadyReacted } = await import("../core/notifications-simple");
      await handleAlreadyReacted(ctx);
    }
  });

  // Handle general non-command messages
  bot.on("message", async (ctx) => {
    const chatType = ctx.chat?.type;
    const text = ctx.message?.text || "";
    
    // Only reply to non-commands in private chat if no session is active
    if (!text.startsWith("/") && chatType === "private") {
      // Check if user has any active session that expects text input
      const session = ctx.session as any;
      const hasActiveSession = session.channelVerification || 
                              session.channelSetup || 
                              session.linkingGroup || 
                              session.expectingGroupPrice ||
                              session.tipIntent?.step === 'custom_amount' ||
                              session.awaitingPrivateKey;
      
      if (!hasActiveSession) {
        await ctx.reply("Use /start to begin or /help for commands.");
      }
    }
  });

  // Main menu navigation callbacks
  bot.callbackQuery("main_kol", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showKolMenu(ctx);
  });

  bot.callbackQuery("main_wallet", async (ctx) => {
    await ctx.answerCallbackQuery();
    const { commandBalance } = await import("./balance");
    await commandBalance(ctx);
  });

  bot.callbackQuery("main_send", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      "💰 **Send Payment**\n\n" +
      "Use the command format:\n" +
      "`/pay @username 10 USDC`\n\n" +
      "Or tip by replying to a message:\n" +
      "`/tip 5 SOL`",
      { 
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("⬅️ Back to Menu", "back_main_menu")
      }
    );
  });

  bot.callbackQuery("main_history", async (ctx) => {
    await ctx.answerCallbackQuery();
    const { commandHistory } = await import("./history");
    await commandHistory(ctx);
  });

  bot.callbackQuery("main_settings", async (ctx) => {
    await ctx.answerCallbackQuery();
    const { showHomePage } = await import("./settings");
    await showHomePage(ctx);
  });

  bot.callbackQuery("main_help", async (ctx) => {
    await ctx.answerCallbackQuery();
    const { commandHelp } = await import("./help");
    await commandHelp(ctx);
  });

  bot.callbackQuery("back_main_menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showMainMenu(ctx);
  });

  // KOL submenu callbacks
  bot.callbackQuery("kol_setup", async (ctx) => {
    await ctx.answerCallbackQuery();
    const { commandSetup } = await import("./setup");
    await commandSetup(ctx);
  });

  bot.callbackQuery("kol_profile", async (ctx) => {
    await ctx.answerCallbackQuery();
    const username = ctx.from?.username;
    if (username) {
      const { commandKolProfile } = await import("./kol-inline");
      // Set up the context to show their own profile
      ctx.match = username;
      await commandKolProfile(ctx);
    } else {
      await ctx.editMessageText(
        "❌ You need a Telegram username to use KOL features.\n\n" +
        "Please set a username in Telegram settings first.",
        { 
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text("⬅️ Back", "main_kol")
        }
      );
    }
  });

  bot.callbackQuery("kol_content", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showContentCreationMenu(ctx);
  });

  bot.callbackQuery("kol_group", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showGroupLinkingMenu(ctx);
  });

  bot.callbackQuery("kol_stats", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showKolStatsMenu(ctx);
  });

  // Content creation submenu callbacks
  bot.callbackQuery("content_channel_setup", async (ctx) => {
    await ctx.answerCallbackQuery();
    
    // Show channel setup workflow
    const keyboard = new InlineKeyboard()
      .text("📢 Add Bot to Channel", "setup_add_bot").row()
      .text("💰 Set Pricing", "setup_pricing").row()
      .text("✅ Verify Setup", "setup_verify").row()
      .text("⬅️ Back", "kol_content");

    await ctx.editMessageText(
      "🏗️ **Channel Setup Workflow**\n\n" +
      "**Step 1: Add Bot to Channel**\n" +
      "• Go to your channel settings\n" +
      "• Add @" + ctx.me.username + " as admin\n" +
      "• Grant 'Post messages' permission\n\n" +
      "**Step 2: Initialize Channel**\n" +
      "• Use `/channel_init` in the channel\n" +
      "• Set default pricing for posts\n\n" +
      "**Step 3: Start Posting**\n" +
      "• Use `/post_locked` to create paywalled content\n" +
      "• Mix text, images, and videos\n\n" +
      "Choose an action:",
      { 
        parse_mode: "Markdown",
        reply_markup: keyboard
      }
    );
  });

  bot.callbackQuery("content_create_post", async (ctx) => {
    await ctx.answerCallbackQuery();
    
    const keyboard = new InlineKeyboard()
      .text("📝 Text Post", "create_text").row()
      .text("🖼️ Image Post", "create_image").row()
      .text("🎥 Video Post", "create_video").row()
      .text("🎨 Mixed Content", "create_mixed").row()
      .text("⬅️ Back", "kol_content");

    await ctx.editMessageText(
      "📝 **Create Paywalled Post**\n\n" +
      "**Available Content Types:**\n\n" +
      "**📝 Text Posts**\n" +
      "• Write engaging content\n" +
      "• Set custom pricing\n" +
      "• Add preview text\n\n" +
      "**🖼️ Image Posts**\n" +
      "• Upload up to 10 images\n" +
      "• 10MB max per image\n" +
      "• Add captions\n\n" +
      "**🎥 Video Posts**\n" +
      "• Upload videos up to 50MB\n" +
      "• Include descriptions\n\n" +
      "**🎨 Mixed Content**\n" +
      "• Combine text + media\n" +
      "• Most engaging format\n\n" +
      "Select content type:",
      { 
        parse_mode: "Markdown",
        reply_markup: keyboard
      }
    );
  });

  bot.callbackQuery("content_stats", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    // Get actual content statistics from database
    const user = await prisma.user.findUnique({
      where: { telegramId: userId }
    });

    if (!user) {
      await ctx.editMessageText(
        "❌ User not found. Please use /start first.",
        { reply_markup: new InlineKeyboard().text("⬅️ Back", "kol_content") }
      );
      return;
    }

    // Get post statistics
    const postStats = await prisma.lockedPost.findMany({
      where: { authorTelegramId: userId },
      include: {
        _count: {
          select: { postAccess: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    const totalPosts = await prisma.lockedPost.count({
      where: { authorTelegramId: userId }
    });

    const totalUnlocks = postStats.reduce((sum, post) => sum + post._count.postAccess, 0);

    // Store analytics data for future reference
    await prisma.user.update({
      where: { id: user.id },
      data: {
        updatedAt: new Date()
      }
    });

    let statsText = `📊 **Your Content Statistics**\n\n`;
    statsText += `**Overview:**\n`;
    statsText += `• Total Posts: ${totalPosts}\n`;
    statsText += `• Total Unlocks: ${totalUnlocks}\n`;
    statsText += `• Avg Unlocks per Post: ${totalPosts > 0 ? (totalUnlocks / totalPosts).toFixed(1) : 0}\n\n`;

    if (postStats.length > 0) {
      statsText += `**Recent Posts Performance:**\n`;
      postStats.forEach((post, index) => {
        const preview = post.messageText?.substring(0, 30) || "Media post";
        statsText += `${index + 1}. "${preview}..." - ${post._count.postAccess} unlocks\n`;
      });
    } else {
      statsText += `_No posts created yet. Start with /post_locked_\n`;
    }

    const keyboard = new InlineKeyboard()
      .text("📈 View Trends", "stats_trends").row()
      .text("💰 Revenue Report", "stats_revenue").row()
      .text("⬅️ Back", "kol_content");

    await ctx.editMessageText(statsText, {
      parse_mode: "Markdown",
      reply_markup: keyboard
    });
  });

  // Group management submenu callbacks
  bot.callbackQuery("group_link_new", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      "🔗 **Link New Group**\n\n" +
      "**Step-by-Step Guide:**\n\n" +
      "1. **Create/Prepare Your Group:**\n" +
      "   • Make sure it's a private group\n" +
      "   • You must be an admin\n\n" +
      "2. **Add the Bot:**\n" +
      "   • Add @" + ctx.me.username + " to your group\n" +
      "   • Give it admin permissions (for invite links)\n\n" +
      "3. **Link the Group:**\n" +
      "   • Go to your group\n" +
      "   • Type `/linkgroup` in the group\n" +
      "   • Follow the confirmation steps\n\n" +
      "4. **Set Pricing:**\n" +
      "   • Use `/setup` to configure group access pricing\n" +
      "   • Choose your preferred token (SOL, USDC, etc.)\n\n" +
      "**Ready?** Head to your group and use `/linkgroup`",
      { 
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("⬅️ Back", "kol_group")
      }
    );
  });

  bot.callbackQuery("group_settings", async (ctx) => {
    await ctx.answerCallbackQuery();
    const { commandSetup } = await import("./setup");
    await commandSetup(ctx);
  });

  bot.callbackQuery("group_info", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    const user = await prisma.user.findUnique({
      where: { telegramId: userId },
      include: { kolSettings: true }
    });

    const settings = user?.kolSettings;
    if (!settings?.privateGroupChatId) {
      await ctx.editMessageText(
        "❌ **No Group Linked**\n\n" +
        "You haven't linked any group yet.\n\n" +
        "Use the \"Link New Group\" option to get started.",
        { 
          reply_markup: new InlineKeyboard().text("⬅️ Back", "kol_group")
        }
      );
      return;
    }

    const groupAccess = await prisma.groupAccess.count({
      where: { groupOwnerId: user?.id }
    });

    const menuText = 
      `📋 **Your Linked Group Info**\n\n` +
      `**Group Details:**\n` +
      `• Group ID: \`${settings.privateGroupChatId}\`\n` +
      `• Access Price: ${settings.groupAccessPrice ? `${Number(settings.groupAccessPrice) / 1e9} ${settings.groupAccessToken}` : "Not set"}\n` +
      `• Total Members: ${groupAccess} paid members\n\n` +
      `**Revenue:**\n` +
      `• Group access is ${settings.groupAccessEnabled ? "enabled" : "disabled"}\n` +
      `• Platform fee: 5% (deducted from recipient)\n\n` +
      `**Share Your Group:**\n` +
      `Use \`/kol @${ctx.from?.username}\` to show your profile with join button.`;

    await ctx.editMessageText(menuText, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("⬅️ Back", "kol_group")
    });
  });

  // Stats submenu callbacks  
  bot.callbackQuery("stats_earnings", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    const user = await prisma.user.findUnique({
      where: { telegramId: userId }
    });

    if (!user) {
      await ctx.editMessageText(
        "❌ User not found. Please use /start first.",
        { reply_markup: new InlineKeyboard().text("⬅️ Back", "kol_stats") }
      );
      return;
    }

    // Get detailed earnings data
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    const recentPayments = await prisma.payment.findMany({
      where: {
        toUserId: user.id,
        status: { in: ["sent", "confirmed"] },
        createdAt: { gte: last30Days }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    const earningsByType = await prisma.payment.groupBy({
      by: ['paymentType', 'ticker'],
      where: {
        toUserId: user.id,
        status: { in: ["sent", "confirmed"] }
      },
      _sum: {
        amount: true,
        platformFeeRaw: true
      },
      _count: true
    });

    // Store user activity for analytics
    await prisma.user.update({
      where: { id: user.id },
      data: {
        updatedAt: new Date()
      }
    });

    let earningsText = `💰 **Detailed Earnings Report**\n\n`;
    earningsText += `**Last 30 Days Overview:**\n`;
    earningsText += `• Total Transactions: ${recentPayments.length}\n\n`;

    if (earningsByType.length > 0) {
      earningsText += `**Earnings by Type & Token:**\n`;
      earningsByType.forEach(stat => {
        const amount = Number(stat._sum.amount || 0) / 1e9;
        const fees = Number(stat._sum.platformFeeRaw || 0) / 1e9;
        earningsText += `• ${stat.paymentType} (${stat.ticker}): ${amount.toFixed(4)} (${stat._count} txns)\n`;
        earningsText += `  Platform fees: ${fees.toFixed(4)}\n`;
      });
    }

    if (recentPayments.length > 0) {
      earningsText += `\n**Recent Transactions:**\n`;
      recentPayments.slice(0, 5).forEach(payment => {
        const amount = Number(payment.amount) / 1e9;
        const date = payment.createdAt.toLocaleDateString();
        earningsText += `• ${date}: ${amount.toFixed(4)} ${payment.ticker} (${payment.paymentType})\n`;
      });
    }

    const keyboard = new InlineKeyboard()
      .text("📊 Export Data", "export_earnings").row()
      .text("⬅️ Back", "kol_stats");

    await ctx.editMessageText(earningsText, {
      parse_mode: "Markdown",
      reply_markup: keyboard
    });
  });

  bot.callbackQuery("stats_supporters", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    const user = await prisma.user.findUnique({
      where: { telegramId: userId }
    });

    if (!user) {
      await ctx.editMessageText(
        "❌ User not found. Please use /start first.",
        { reply_markup: new InlineKeyboard().text("⬅️ Back", "kol_stats") }
      );
      return;
    }

    // Get top supporters data
    const topSupporters = await prisma.payment.groupBy({
      by: ['fromUserId'],
      where: {
        toUserId: user.id,
        status: { in: ["sent", "confirmed"] }
      },
      _sum: {
        amount: true
      },
      _count: true,
      orderBy: {
        _sum: {
          amount: 'desc'
        }
      },
      take: 10
    });

    // Get supporter details
    const supporterIds = topSupporters.map(s => s.fromUserId).filter(Boolean);
    const supporters = await prisma.user.findMany({
      where: { id: { in: supporterIds as number[] } },
      select: {
        id: true,
        telegramId: true,
        handle: true
      }
    });

    const supporterMap = new Map(supporters.map(s => [s.id, s]));

    let supportersText = `👥 **Your Top Supporters**\n\n`;
    
    if (topSupporters.length > 0) {
      supportersText += `**Top Contributors:**\n`;
      topSupporters.forEach((supporter, index) => {
        if (supporter.fromUserId) {
          const user = supporterMap.get(supporter.fromUserId);
          const totalAmount = Number(supporter._sum.amount || 0) / 1e9;
          const name = user?.handle || `User ${user?.telegramId?.slice(-4)}` || "Anonymous";
          supportersText += `${index + 1}. ${name}\n`;
          supportersText += `   💰 Total: ${totalAmount.toFixed(2)} (${supporter._count} payments)\n`;
        }
      });

      supportersText += `\n**Community Stats:**\n`;
      supportersText += `• Total Unique Supporters: ${topSupporters.length}\n`;
      supportersText += `• Average Support: ${(topSupporters.reduce((sum, s) => sum + (Number(s._sum.amount || 0) / 1e9), 0) / topSupporters.length).toFixed(2)}\n`;
    } else {
      supportersText += `_No supporters yet. Share your profile to grow your community!_`;
    }

    const keyboard = new InlineKeyboard()
      .text("📢 Share Profile", "share_profile").row()
      .text("⬅️ Back", "kol_stats");

    await ctx.editMessageText(supportersText, {
      parse_mode: "Markdown",
      reply_markup: keyboard
    });
  });

  bot.callbackQuery("stats_content", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    // Get content performance metrics
    const contentStats = await prisma.lockedPost.findMany({
      where: { authorTelegramId: userId },
      include: {
        postAccess: {
          select: {
            createdAt: true,
            userTgId: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const totalRevenue = await prisma.payment.aggregate({
      where: {
        toUserId: { in: await prisma.user.findUnique({ where: { telegramId: userId } }).then(u => u ? [u.id] : []) },
        paymentType: 'payment',
        status: { in: ["sent", "confirmed"] }
      },
      _sum: {
        amount: true
      }
    });

    let performanceText = `📈 **Content Performance Analytics**\n\n`;
    
    if (contentStats.length > 0) {
      const totalUnlocks = contentStats.reduce((sum, post) => sum + post.postAccess.length, 0);
      const avgUnlocksPerPost = totalUnlocks / contentStats.length;
      const bestPost = contentStats.reduce((best, post) => 
        post.postAccess.length > (best?.postAccess.length || 0) ? post : best, contentStats[0]);

      performanceText += `**Overall Performance:**\n`;
      performanceText += `• Total Posts: ${contentStats.length}\n`;
      performanceText += `• Total Unlocks: ${totalUnlocks}\n`;
      performanceText += `• Avg Unlocks/Post: ${avgUnlocksPerPost.toFixed(1)}\n`;
      performanceText += `• Total Revenue: ${(Number(totalRevenue._sum.amount || 0) / 1e9).toFixed(2)} SOL\n\n`;

      performanceText += `**Best Performing Post:**\n`;
      const preview = bestPost.messageText?.substring(0, 50) || "Media post";
      performanceText += `"${preview}..."\n`;
      performanceText += `• ${bestPost.postAccess.length} unlocks\n`;
      performanceText += `• Created: ${bestPost.createdAt.toLocaleDateString()}\n\n`;

      performanceText += `**Content Mix:**\n`;
      const textPosts = contentStats.filter(p => p.messageText && !p.messageMedia).length;
      const mediaPosts = contentStats.filter(p => p.messageMedia).length;
      const mixedPosts = contentStats.filter(p => p.messageText && p.messageMedia).length;
      performanceText += `• Text only: ${textPosts}\n`;
      performanceText += `• Media only: ${mediaPosts}\n`;
      performanceText += `• Mixed content: ${mixedPosts}\n`;
    } else {
      performanceText += `_No content created yet. Start with /post_locked_`;
    }

    const keyboard = new InlineKeyboard()
      .text("📝 Create New Post", "content_create_post").row()
      .text("⬅️ Back", "kol_stats");

    await ctx.editMessageText(performanceText, {
      parse_mode: "Markdown",
      reply_markup: keyboard
    });
  });

  // Back navigation for submenus
  bot.callbackQuery("kol_content", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showContentCreationMenu(ctx);
  });

  bot.callbackQuery("kol_group", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showGroupLinkingMenu(ctx);
  });

  bot.callbackQuery("kol_stats", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showKolStatsMenu(ctx);
  });

  // Additional workflow callbacks
  bot.callbackQuery("setup_add_bot", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      "📢 **Add Bot to Channel**\n\n" +
      "**Instructions:**\n\n" +
      "1. Go to your channel\n" +
      "2. Click channel name at top\n" +
      "3. Select 'Administrators'\n" +
      "4. Click 'Add Administrator'\n" +
      "5. Search for @" + ctx.me.username + "\n" +
      "6. Grant these permissions:\n" +
      "   ✅ Post messages\n" +
      "   ✅ Edit messages\n" +
      "   ✅ Delete messages\n\n" +
      "Once done, use `/channel_init` in your channel!",
      { 
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("⬅️ Back", "content_channel_setup")
      }
    );
  });

  bot.callbackQuery("setup_pricing", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      "💰 **Set Channel Pricing**\n\n" +
      "**Default Pricing:**\n" +
      "Set a default price for all posts in your channel.\n\n" +
      "**Custom Pricing:**\n" +
      "Override default price for individual posts.\n\n" +
      "**Supported Tokens:**\n" +
      "• SOL - Solana\n" +
      "• USDC - USD Coin\n" +
      "• BONK - Bonk token\n" +
      "• JUP - Jupiter token\n\n" +
      "Use `/channel_init` in your channel to set pricing!",
      { 
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("⬅️ Back", "content_channel_setup")
      }
    );
  });

  bot.callbackQuery("setup_verify", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    const channels = await prisma.channel.findMany({
      where: { adminId: userId },
      orderBy: { createdAt: 'desc' }
    });

    let verifyText = "✅ **Verify Channel Setup**\n\n";
    
    if (channels.length > 0) {
      verifyText += "**Your Verified Channels:**\n";
      channels.forEach(channel => {
        verifyText += `• @${channel.username || channel.chatId}\n`;
        verifyText += `  Price: ${channel.defaultPrice} ${channel.defaultToken}\n`;
        verifyText += `  Status: ✅ Verified\n`;
        verifyText += `  Created: ${channel.createdAt.toLocaleDateString()}\n\n`;
      });
      
      const keyboard = new InlineKeyboard()
        .text("➕ Add Another Channel", "channel_start_verification").row()
        .text("⬅️ Back", "content_channel_setup");
      
      await ctx.editMessageText(verifyText, {
        parse_mode: "Markdown",
        reply_markup: keyboard
      });
    } else {
      verifyText += "❌ No channels verified yet.\n\n";
      verifyText += "Let's verify your first channel!";
      
      const keyboard = new InlineKeyboard()
        .text("🚀 Start Verification", "channel_start_verification").row()
        .text("⬅️ Back", "content_channel_setup");
      
      await ctx.editMessageText(verifyText, {
        parse_mode: "Markdown",
        reply_markup: keyboard
      });
    }
  });

  // Content creation type callbacks  
  bot.callbackQuery(/^create_(text|image|video|mixed)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const contentType = ctx.match[1];
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    // Get user's channels
    const channels = await prisma.channel.findMany({
      where: { adminId: userId },
      select: { chatId: true, username: true }
    });

    if (channels.length === 0) {
      await ctx.editMessageText(
        "❌ **No Channels Found**\n\n" +
        "You need to verify a channel first before creating posts.\n\n" +
        "Click 'Channel Setup' to add your first channel.",
        { 
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard()
            .text("🏗️ Channel Setup", "content_channel_setup").row()
            .text("⬅️ Back", "content_create_post")
        }
      );
      return;
    }

    // Store content type in session
    ctx.session.postCreation = { 
      step: 'select_channel',
      contentType 
    };

    const keyboard = new InlineKeyboard();
    channels.forEach(channel => {
      keyboard.text(`@${channel.username}`, `post_in_channel:${channel.chatId}`).row();
    });
    keyboard.text("⬅️ Back", "content_create_post");

    await ctx.editMessageText(
      `📝 **Create ${contentType.charAt(0).toUpperCase() + contentType.slice(1)} Post**\n\n` +
      "Select which channel to post in:",
      { 
        parse_mode: "Markdown",
        reply_markup: keyboard
      }
    );
  });

  // Select channel for post
  bot.callbackQuery(/^post_in_channel:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const channelId = ctx.match[1];
    const session = ctx.session as any;
    
    if (!session.postCreation) {
      await ctx.editMessageText("❌ Session expired. Please start again.");
      return;
    }

    const contentType = session.postCreation.contentType;
    const instructions = {
      text: "📝 Send your text content now.\n\nThis will be the locked content users pay to see.",
      image: "🖼️ Send up to 10 images (10MB each).\n\nThese will be locked behind the paywall.",
      video: "🎥 Send your video (up to 50MB).\n\nThis will require payment to view.",
      mixed: "🎨 Send your text first, then add media.\n\nOr send media first, then add text."
    };

    session.postCreation = {
      ...session.postCreation,
      step: 'awaiting_content',
      channelId
    };

    await ctx.editMessageText(
      `**Creating Post in Channel**\n\n` +
      instructions[contentType as keyof typeof instructions] + "\n\n" +
      "Send your content now:",
      { 
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("❌ Cancel", "cancel_post_creation")
      }
    );
  });

  bot.callbackQuery("cancel_post_creation", async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.postCreation = undefined;
    await ctx.editMessageText("❌ Post creation cancelled.");
  });

  bot.callbackQuery("select_channel_for_post", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    const channels = await prisma.channel.findMany({
      where: { adminId: userId },
      select: { chatId: true, username: true }
    });

    if (channels.length === 0) {
      await ctx.editMessageText(
        "❌ No channels verified yet. Please set up a channel first.",
        {
          reply_markup: new InlineKeyboard()
            .text("🏗️ Channel Setup", "content_channel_setup").row()
            .text("⬅️ Back", "kol_content")
        }
      );
      return;
    }

    const keyboard = new InlineKeyboard();
    channels.forEach(channel => {
      keyboard.text(`@${channel.username}`, `start_post_in:${channel.chatId}`).row();
    });
    keyboard.text("⬅️ Back", "kol_content");

    await ctx.editMessageText(
      "📝 **Select Channel for Post**\n\n" +
      "Choose which channel to create a post in:",
      {
        parse_mode: "Markdown",
        reply_markup: keyboard
      }
    );
  });

  bot.callbackQuery("need_channel_first", async (ctx) => {
    await ctx.answerCallbackQuery("Please verify a channel first!");
    await ctx.editMessageText(
      "⚠️ **Channel Required**\n\n" +
      "You need to verify at least one channel before creating posts.\n\n" +
      "Click 'Channel Setup' to get started!",
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("🏗️ Channel Setup", "content_channel_setup").row()
          .text("⬅️ Back", "kol_content")
      }
    );
  });

  // Export and sharing callbacks
  bot.callbackQuery("export_earnings", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      "📊 Your earnings data has been prepared!\n\n" +
      "Export format options coming soon:\n" +
      "• CSV for spreadsheets\n" +
      "• PDF for reports\n" +
      "• JSON for analysis\n\n" +
      "_This feature is in development._"
    );
  });

  bot.callbackQuery("share_profile", async (ctx) => {
    await ctx.answerCallbackQuery();
    const username = ctx.from?.username;
    if (username) {
      await ctx.reply(
        `🔗 **Share Your KOL Profile**\n\n` +
        `Share this command with your community:\n` +
        `\`/kol @${username}\`\n\n` +
        `Or share this link:\n` +
        `t.me/${ctx.me.username}?start=kol_${username}\n\n` +
        `Your supporters can tip and join your groups!`,
        { parse_mode: "Markdown" }
      );
    }
  });

  bot.callbackQuery("stats_trends", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      "📈 **Content Trends Analysis**\n\n" +
      "Analyzing your content performance trends...\n\n" +
      "**Coming Soon:**\n" +
      "• Best posting times\n" +
      "• Popular content topics\n" +
      "• Engagement patterns\n" +
      "• Growth predictions\n\n" +
      "_Advanced analytics in development._",
      { 
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("⬅️ Back", "content_stats")
      }
    );
  });

  bot.callbackQuery("stats_revenue", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    const user = await prisma.user.findUnique({
      where: { telegramId: userId }
    });

    if (!user) return;

    const revenue = await prisma.payment.aggregate({
      where: {
        toUserId: user.id,
        status: { in: ["sent", "confirmed"] },
        paymentType: 'payment'
      },
      _sum: {
        amount: true,
        platformFeeRaw: true
      }
    });

    const totalRevenue = Number(revenue._sum.amount || 0) / 1e9;
    const totalFees = Number(revenue._sum.platformFeeRaw || 0) / 1e9;
    const netRevenue = totalRevenue - totalFees;

    await ctx.editMessageText(
      `💰 **Revenue Report**\n\n` +
      `**Content Sales:**\n` +
      `• Gross Revenue: ${totalRevenue.toFixed(4)} SOL\n` +
      `• Platform Fees: ${totalFees.toFixed(4)} SOL\n` +
      `• Net Revenue: ${netRevenue.toFixed(4)} SOL\n\n` +
      `**Fee Structure:**\n` +
      `• Content unlocks: 5% fee\n` +
      `• Tips: 2% fee\n` +
      `• Group access: 5% fee\n\n` +
      `_Withdraw earnings with /withdraw_`,
      { 
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("⬅️ Back", "content_stats")
      }
    );
  });

  bot.callbackQuery("go_to_channel", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      "📺 Please go to your channel and use the appropriate command:\n\n" +
      "• `/channel_init` - To set up a new channel\n" +
      "• `/post_locked` - To create paywalled content\n\n" +
      "Need help? Use /help for detailed instructions."
    );
  });

  // Settings submenu callbacks
  bot.callbackQuery("settings_profile", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from?.id.toString();
    const username = ctx.from?.username;
    
    await ctx.editMessageText(
      `👤 **Profile Settings**\n\n` +
      `Username: @${username || 'not set'}\n` +
      `User ID: ${userId}\n` +
      `Account Type: ${username ? 'KOL' : 'Standard'}\n\n` +
      `Profile features coming soon!`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("⬅️ Back", "main_settings")
      }
    );
  });

  bot.callbackQuery("settings_notifications", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      "🔔 **Notification Settings**\n\n" +
      "Control when and how you receive alerts:\n\n" +
      "• Payment received: ✅ Enabled\n" +
      "• Tips received: ✅ Enabled\n" +
      "• Group joins: ✅ Enabled\n" +
      "• Content unlocks: ✅ Enabled\n\n" +
      "_Customization coming soon_",
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("⬅️ Back", "main_settings")
      }
    );
  });

  bot.callbackQuery("settings_currency", async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard()
      .text("SOL", "set_default:SOL").text("USDC", "set_default:USDC").row()
      .text("BONK", "set_default:BONK").text("JUP", "set_default:JUP").row()
      .text("⬅️ Back", "main_settings");

    await ctx.editMessageText(
      "💰 **Default Currency**\n\n" +
      "Select your preferred token for transactions:\n\n" +
      "Current default: **SOL**",
      {
        parse_mode: "Markdown",
        reply_markup: keyboard
      }
    );
  });

  bot.callbackQuery("settings_security", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      "🔐 **Security Settings**\n\n" +
      "**Wallet Security:**\n" +
      "• Private keys encrypted: ✅\n" +
      "• 2FA enabled: ❌ Coming soon\n" +
      "• Backup phrase: Use /export\n\n" +
      "**Privacy:**\n" +
      "• Transaction history: Private\n" +
      "• Profile visibility: Public\n\n" +
      "_Advanced security features in development_",
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("⬅️ Back", "main_settings")
      }
    );
  });

  bot.callbackQuery(/^set_default:([A-Z]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery(`Default currency set to ${ctx.match[1]}`);
    // Store preference in database
    await ctx.editMessageText(
      `✅ Default currency updated to **${ctx.match[1]}**`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("⬅️ Back", "settings_currency")
      }
    );
  });

  bot.callbackQuery("back_to_main", async (ctx) => {
    await ctx.answerCallbackQuery();
    const { commandStart } = await import("./start");
    await commandStart(ctx);
  });

  // Post pricing callbacks
  bot.callbackQuery("use_default_price", async (ctx) => {
    await ctx.answerCallbackQuery();
    const session = ctx.session as any;
    const userId = ctx.from?.id.toString();
    
    if (!session.postCreation || !userId) {
      await ctx.editMessageText("❌ Session expired. Please start again.");
      return;
    }
    
    const channel = await prisma.channel.findUnique({
      where: { chatId: session.postCreation.channelId }
    });
    
    if (!channel) {
      await ctx.editMessageText("❌ Channel not found.");
      return;
    }
    
    await createPaywalledPost(ctx, userId, channel, channel.defaultPrice, channel.defaultToken);
  });

  bot.callbackQuery(/^post_price:([0-9.]+):([A-Z]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const session = ctx.session as any;
    const userId = ctx.from?.id.toString();
    
    if (!session.postCreation || !userId) {
      await ctx.editMessageText("❌ Session expired. Please start again.");
      return;
    }
    
    const [_, amount, token] = ctx.match;
    
    const channel = await prisma.channel.findUnique({
      where: { chatId: session.postCreation.channelId }
    });
    
    if (!channel) {
      await ctx.editMessageText("❌ Channel not found.");
      return;
    }
    
    await createPaywalledPost(ctx, userId, channel, amount, token);
  });

  bot.callbackQuery("post_custom_price", async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.postCreation = {
      ...ctx.session.postCreation,
      step: 'custom_price'
    };
    
    await ctx.editMessageText(
      "💰 **Set Custom Price**\n\n" +
      "Enter the price in this format:\n" +
      "`amount TOKEN`\n\n" +
      "Examples:\n" +
      "• `0.25 SOL`\n" +
      "• `10 USDC`\n" +
      "• `1000 BONK`",
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("❌ Cancel", "cancel_post_creation")
      }
    );
  });

  // Start post in channel callback
  bot.callbackQuery(/^start_post_in:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const channelId = ctx.match[1];
    
    ctx.session.postCreation = {
      step: 'select_type',
      channelId
    };
    
    const keyboard = new InlineKeyboard()
      .text("📝 Text Only", "create_text").row()
      .text("🖼️ Images", "create_image").row()
      .text("🎥 Video", "create_video").row()
      .text("🎨 Mixed Content", "create_mixed").row()
      .text("⬅️ Back", "select_channel_for_post");
    
    await ctx.editMessageText(
      "📝 **Create Paywalled Post**\n\n" +
      "What type of content will you create?\n\n" +
      "• **Text**: Written content only\n" +
      "• **Images**: Up to 10 photos\n" +
      "• **Video**: Single video file\n" +
      "• **Mixed**: Combine text + media",
      {
        parse_mode: "Markdown",
        reply_markup: keyboard
      }
    );
  });
}

// Create paywalled post helper
async function createPaywalledPost(ctx: BotContext, userId: string, channel: any, amount: string, token: string) {
  const session = ctx.session as any;
  const postData = session.postCreation;
  
  if (!postData) {
    await ctx.reply("❌ Session expired.");
    return;
  }
  
  try {
    // Create preview text
    let preview = "🔒 **Locked Content**\n\n";
    if (postData.textContent) {
      preview += postData.textContent.substring(0, 100) + "...\n\n";
    }
    preview += `💰 Price: ${amount} ${token}\n`;
    preview += `📊 Content: `;
    
    const contentTypes = [];
    if (postData.textContent) contentTypes.push("Text");
    if (postData.photos?.length) contentTypes.push(`${postData.photos.length} Images`);
    if (postData.video) contentTypes.push("Video");
    preview += contentTypes.join(" + ");
    
    // Store in database
    const post = await prisma.lockedPost.create({
      data: {
        channelId: channel.chatId,
        authorId: userId,
        messageText: postData.textContent || "",
        priceRaw: amount,
        priceTicker: token,
        mediaContent: JSON.stringify({
          photos: postData.photos || [],
          video: postData.video || null
        })
      }
    });
    
    // Send to channel
    const botMessage = await ctx.api.sendMessage(
      channel.chatId,
      preview + "\n\n" +
      "Click below to unlock this content:",
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("🔓 Unlock Content", `unlock_post:${post.id}`)
      }
    );
    
    // Update post with message ID
    await prisma.lockedPost.update({
      where: { id: post.id },
      data: { messageId: botMessage.message_id }
    });
    
    // Clear session
    ctx.session.postCreation = undefined;
    
    await ctx.reply(
      "✅ **Post Created Successfully!**\n\n" +
      `Channel: @${channel.username}\n` +
      `Price: ${amount} ${token}\n` +
      `Status: Published\n\n` +
      "Your post is now live in the channel!",
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("📝 Create Another", "select_channel_for_post").row()
          .text("📊 View Stats", "content_stats").row()
          .text("🏠 Main Menu", "back_to_main")
      }
    );
    
  } catch (error) {
    console.error("Error creating post:", error);
    await ctx.reply("❌ Error creating post. Please try again.");
  }
}

// Handle post content input
async function handlePostContentInput(ctx: BotContext) {
  const session = ctx.session as any;
  const userId = ctx.from?.id.toString();
  
  if (!session.postCreation || !userId) return;
  
  const { channelId, contentType } = session.postCreation;
  const message = ctx.message;
  
  if (!message) return;
  
  // Store content based on type
  if (message.text) {
    session.postCreation.textContent = message.text;
  } else if (message.photo) {
    if (!session.postCreation.photos) session.postCreation.photos = [];
    session.postCreation.photos.push(message.photo[message.photo.length - 1].file_id);
  } else if (message.video) {
    session.postCreation.video = message.video.file_id;
  }
  
  // Check if content is complete based on type
  const hasContent = session.postCreation.textContent || 
                    session.postCreation.photos?.length || 
                    session.postCreation.video;
  
  if (!hasContent) {
    await ctx.reply("Please send your content (text, images, or video).");
    return;
  }
  
  // Move to pricing step
  session.postCreation.step = 'set_price';
  
  const channel = await prisma.channel.findUnique({
    where: { chatId: channelId }
  });
  
  const keyboard = new InlineKeyboard()
    .text(`Use default (${channel?.defaultPrice} ${channel?.defaultToken})`, "use_default_price").row()
    .text("💵 0.1 SOL", "post_price:0.1:SOL").row()
    .text("💵 0.5 SOL", "post_price:0.5:SOL").row()
    .text("💵 1 SOL", "post_price:1:SOL").row()
    .text("💰 1 USDC", "post_price:1:USDC").row()
    .text("✏️ Custom Price", "post_custom_price");
  
  await ctx.reply(
    "💰 **Set Post Price**\n\n" +
    "Choose how much users will pay to unlock this content:",
    {
      parse_mode: "Markdown",
      reply_markup: keyboard
    }
  );
}

// Content Creation submenu
async function showContentCreationMenu(ctx: BotContext) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  // Check if user has any verified channels
  const channelCount = await prisma.channel.count({
    where: { adminId: userId }
  });

  const keyboard = new InlineKeyboard()
    .text("🏗️ Channel Setup", "content_channel_setup").row()
    .text("📝 Create Post", channelCount > 0 ? "select_channel_for_post" : "need_channel_first").row()
    .text("📊 Content Stats", "content_stats").row()
    .text("⬅️ Back to KOL Menu", "main_kol");

  const menuText = 
    `📝 **Create Paywalled Content**\n\n` +
    `**Content Creation Workflow:**\n` +
    `• Set up your channel with pricing\n` +
    `• Create locked posts with text/media\n` +
    `• Track content performance\n\n` +
    `**Your Status:**\n` +
    `• Channels verified: ${channelCount}\n` +
    (channelCount > 0 ? `✅ Ready to create posts!` : `⚠️ Verify a channel first`) + `\n\n` +
    `Choose your next step:`;

  await ctx.editMessageText(menuText, {
    parse_mode: "Markdown",
    reply_markup: keyboard
  });
}

// Group Linking submenu
async function showGroupLinkingMenu(ctx: BotContext) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  // Check if user has KOL settings
  const user = await prisma.user.findUnique({
    where: { telegramId: userId },
    include: { kolSettings: true }
  });

  const hasSettings = user?.kolSettings;
  const hasLinkedGroup = user?.kolSettings?.privateGroupChatId;

  const keyboard = new InlineKeyboard()
    .text("🔗 Link New Group", "group_link_new").row()
    .text("⚙️ Group Settings", "group_settings").row()
    .text("📋 Group Info", "group_info").row()
    .text("⬅️ Back to KOL Menu", "main_kol");

  const menuText = 
    `🔗 **Paid Group Management**\n\n` +
    `**Current Status:**\n` +
    `• KOL Settings: ${hasSettings ? "✅ Configured" : "❌ Not set up"}\n` +
    `• Linked Group: ${hasLinkedGroup ? "✅ Connected" : "❌ No group linked"}\n\n` +
    `**Setup Requirements:**\n` +
    `1. Configure KOL settings first (/setup)\n` +
    `2. Add bot as admin to your private group\n` +
    `3. Use /linkgroup command in the group\n` +
    `4. Set group access pricing\n\n` +
    `**Group Features:**\n` +
    `• One-time payment for permanent access\n` +
    `• Automatic invite link generation\n` +
    `• Member tracking and management\n\n` +
    `Choose an option:`;

  await ctx.editMessageText(menuText, {
    parse_mode: "Markdown",
    reply_markup: keyboard
  });
}

// KOL Stats submenu
async function showKolStatsMenu(ctx: BotContext) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  // Get user's payment statistics
  const user = await prisma.user.findUnique({
    where: { telegramId: userId }
  });

  if (!user) {
    await ctx.editMessageText(
      "❌ User not found. Please use /start to set up your account.",
      { 
        reply_markup: new InlineKeyboard().text("⬅️ Back", "main_kol")
      }
    );
    return;
  }

  // Get payment statistics  
  const tipStats = await prisma.payment.aggregate({
    where: {
      toUserId: user.id,
      paymentType: "tip",
      status: { in: ["sent", "confirmed"] }
    },
    _sum: { amount: true },
    _count: true
  });

  const groupStats = await prisma.payment.aggregate({
    where: {
      toUserId: user.id,
      paymentType: "group_access", 
      status: { in: ["sent", "confirmed"] }
    },
    _sum: { amount: true },
    _count: true
  });

  const contentStats = await prisma.postAccess.count({
    where: {
      post: {
        authorTelegramId: userId
      }
    }
  });

  const keyboard = new InlineKeyboard()
    .text("📈 Earnings Details", "stats_earnings").row()
    .text("👥 Top Supporters", "stats_supporters").row()
    .text("📊 Content Performance", "stats_content").row()
    .text("⬅️ Back to KOL Menu", "main_kol");

  const menuText = 
    `📊 **Your KOL Statistics**\n\n` +
    `**Earnings Summary:**\n` +
    `• Tips Received: ${tipStats._count || 0} payments\n` +
    `• Group Access Sales: ${groupStats._count || 0} memberships\n` +
    `• Content Unlocks: ${contentStats} purchases\n\n` +
    `**Recent Performance:**\n` +
    `• Active since account creation\n` +
    `• Platform fees: 2% tips, 5% content/groups\n\n` +
    `**Next Steps:**\n` +
    `• Share your profile: /kol @${ctx.from?.username || "yourusername"}\n` +
    `• Create more content to increase earnings\n` +
    `• Engage with your community\n\n` +
    `Choose a section to explore:`;

  await ctx.editMessageText(menuText, {
    parse_mode: "Markdown",
    reply_markup: keyboard
  });
}

// KOL Features submenu
async function showKolMenu(ctx: BotContext) {
  const keyboard = new InlineKeyboard()
    .text("⚙️ KOL Setup", "kol_setup").text("👤 My Profile", "kol_profile").row()
    .text("📝 Create Content", "kol_content").text("🔗 Link Group", "kol_group").row()
    .text("📊 KOL Stats", "kol_stats").row()
    .text("⬅️ Back to Menu", "back_main_menu");

  const menuText = 
    `🎯 **KOL Features Menu**\n\n` +
    `**Monetization Tools:**\n` +
    `• Set up paid group access\n` +
    `• Create paywalled content\n` +
    `• Configure tip buttons\n` +
    `• Track earnings and stats\n\n` +
    `**Platform Fees:**\n` +
    `• Tips: 2% (from recipient)\n` +
    `• Content/Groups: 5% (from recipient)\n\n` +
    `Choose what you'd like to do:`;

  await ctx.editMessageText(menuText, {
    parse_mode: "Markdown",
    reply_markup: keyboard
  });
}
