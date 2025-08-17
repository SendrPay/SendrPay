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
  // Group commands
  bot.command("enable", commandEnable);
  bot.command("pay", commandPay);
  bot.command("tip", commandTip);
  bot.command("balance", commandBalance);

  bot.command("settings", commandSettings);
  bot.command("admin", commandAdmin);
  
  // KOL commands
  bot.command("linkgroup", commandLinkGroup);
  bot.command("unlinkgroup", commandUnlinkGroup);
  bot.command("kol", commandKolProfile);
  
  // Debug commands for troubleshooting (admin-only)
  bot.command("debug_reply", commandDebugReply);
  bot.command("debug_reset", commandDebugReset);
  bot.command("debug_message", commandDebugMessage);
}

export function registerDMRoutes(bot: Bot<BotContext>) {
  // DM commands
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

  // Payment commands also work in DM for direct payments
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
  bot.command("linkgroup", commandLinkGroup);
  bot.command("unlinkgroup", commandUnlinkGroup);
  
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


  // Settings menu callback handlers
  bot.callbackQuery(/^(home|wallet|send_payment|receive_payment|security|history|help|bot_settings|settings_main|quick_pay)$/, async (ctx) => {
    const { handleSettingsCallback } = await import("./settings");
    await handleSettingsCallback(ctx);
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

  // Channel setup callbacks
  bot.callbackQuery(/^channel_/, async (ctx) => {
    await handleChannelCallbacks(ctx);
  });

  // Post creation callbacks
  bot.callbackQuery(/^post_/, async (ctx) => {
    await handlePostCallbacks(ctx);
  });

  // Register legacy paywall callbacks
  registerPaywallCallbacks(bot);

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
    const { commandChannelInit } = await import("./channel");
    await commandChannelInit(ctx);
  });

  bot.callbackQuery("content_create_post", async (ctx) => {
    await ctx.answerCallbackQuery();
    const { commandPostLocked } = await import("./post-locked");
    await commandPostLocked(ctx);
  });

  bot.callbackQuery("content_stats", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      "📊 **Content Statistics**\n\n" +
      "This feature shows detailed analytics for your paywalled content.\n\n" +
      "**Coming Soon:**\n" +
      "• Posts performance metrics\n" +
      "• Revenue by content type\n" +
      "• Audience engagement data\n" +
      "• Content optimization tips\n\n" +
      "_This feature is being developed and will be available in a future update._",
      { 
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("⬅️ Back", "kol_content")
      }
    );
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
    await ctx.editMessageText(
      "💰 **Detailed Earnings**\n\n" +
      "This section will show comprehensive earnings breakdown including:\n\n" +
      "**Features Coming Soon:**\n" +
      "• Daily/weekly/monthly revenue charts\n" +
      "• Earnings by token type (SOL, USDC, etc.)\n" +
      "• Platform fee breakdowns\n" +
      "• Projected earnings based on trends\n" +
      "• Export data for tax purposes\n\n" +
      "_Advanced analytics are being developed._",
      { 
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("⬅️ Back", "kol_stats")
      }
    );
  });

  bot.callbackQuery("stats_supporters", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      "👥 **Top Supporters**\n\n" +
      "This feature will display your most generous supporters and community insights.\n\n" +
      "**Coming Soon:**\n" +
      "• Top tippers leaderboard\n" +
      "• Most active content purchasers\n" +
      "• Community growth metrics\n" +
      "• Engagement analytics\n" +
      "• Supporter appreciation tools\n\n" +
      "_Privacy-focused supporter analytics in development._",
      { 
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("⬅️ Back", "kol_stats")
      }
    );
  });

  bot.callbackQuery("stats_content", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      "📈 **Content Performance**\n\n" +
      "Analyze how your paywalled content performs across different channels.\n\n" +
      "**Planned Metrics:**\n" +
      "• Post unlock rates by content type\n" +
      "• Most popular posts and topics\n" +
      "• Optimal pricing analysis\n" +
      "• Content engagement patterns\n" +
      "• Revenue per post insights\n\n" +
      "_Content analytics dashboard coming soon._",
      { 
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("⬅️ Back", "kol_stats")
      }
    );
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
}

// Content Creation submenu
async function showContentCreationMenu(ctx: BotContext) {
  const keyboard = new InlineKeyboard()
    .text("🏗️ Channel Setup", "content_channel_setup").row()
    .text("📝 Create Post", "content_create_post").row()
    .text("📊 Content Stats", "content_stats").row()
    .text("⬅️ Back to KOL Menu", "main_kol");

  const menuText = 
    `📝 **Create Paywalled Content**\n\n` +
    `**Content Creation Workflow:**\n` +
    `• Set up your channel with pricing\n` +
    `• Create locked posts with text/media\n` +
    `• Track content performance\n\n` +
    `**Supported Content:**\n` +
    `• Text posts with custom pricing\n` +
    `• Images (up to 10MB each)\n` +
    `• Videos (up to 50MB each)\n` +
    `• Mixed content (text + media)\n\n` +
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
