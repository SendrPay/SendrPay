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
import { commandInlineInterface, handleInterfaceCallbacks } from "./inline-interface";
import { registerPaywallCallbacks } from "../paywall/inline-simplified";
import { handlePaywallInlineCallbacks } from "../paywall/inline-paywall";
import { prisma } from "../infra/prisma";

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
  
  // KOL commands (completely separate from paywalled content)
  bot.command("kol_setup", commandKolSetupInline);  // KOL private group setup with proper inline interface
  bot.command("kol", commandKolProfile);
  bot.command("kol_post", async (ctx) => {
    const { commandKolPost } = await import("./kol-post");
    await commandKolPost(ctx);
  });
  bot.command("linkgroup", commandLinkGroup);
  bot.command("unlinkgroup", commandUnlinkGroup);
  
  // Channel paywall commands (completely separate from KOL setup)
  bot.command("paywall_setup", commandChannelInit);  // Renamed for clarity
  bot.command("create_post", commandPostLocked);     // Renamed for clarity
  
  // Legacy aliases for backward compatibility
  bot.command("setup", commandSetup);           // Still works for existing users
  bot.command("channel_init", commandChannelInit);  // Still works for existing users
  bot.command("post_locked", commandPostLocked);    // Still works for existing users
  
  // New comprehensive inline interface
  bot.command("interface", commandInlineInterface);
  bot.command("menu", commandInlineInterface);
  
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
      // Handle message inputs based on session state (order matters for workflow separation!)
      // 1. KOL group setup workflows (PRIORITY 1 - prevents conflicts with paywall setup)
      else if (session.expectingGroupPrice) {
        const { handleGroupPriceInput } = await import("./setup");
        await handleGroupPriceInput(ctx);
      }
      else if (session.linkingGroup) {
        const { handleGroupLinkInput } = await import("./linkgroup");
        await handleGroupLinkInput(ctx);
      }
      // Note: setupState handling is done by setup command callbacks, not text input
      // 2. Channel paywalled content workflows (PRIORITY 2 - separate from KOL setup)
      else if (session.channelSetup) {
        if (session.channelSetup.step === 'enter_channel_username') {
          await handleChannelUsernameInput(ctx);
        } else if (session.channelSetup.step === 'set_price') {
          await handleChannelPriceInput(ctx);
        } else if (session.channelSetup.step === 'set_presets') {
          await handleChannelPresetsInput(ctx);
        }
      }
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
      // 3. Other workflows (PRIORITY 3)
      else if (session.tipIntent?.step === 'custom_amount') {
        await handleCustomTipAmount(ctx);
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
  bot.callbackQuery(/^(setup_|tip_token_|group_|sub_type:|billing_cycle:|back_setup:|tip_select:|tip_amount:|kol_settings:|view_profile:|post_group_message|confirm_tip_payment:|confirm_group_join:|cancel_tip_payment|cancel_group_join|post_to_channel:|post_to_group:|copy_message:|cancel_post)/, async (ctx) => {
    const { handleKolCallbacks } = await import("./kol-inline");
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

  // Handle comprehensive interface callbacks
  bot.callbackQuery(/^interface_/, async (ctx) => {
    await handleInterfaceCallbacks(ctx);
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

// Add KOL submenu callbacks to main callback system - these need to be registered with the bot instance
export function registerKolSubmenuCallbacks(bot: Bot<BotContext>) {
  bot.callbackQuery("kol_setup", async (ctx) => {
    await ctx.answerCallbackQuery();
    // Use the inline KOL setup instead of the old setup.ts
    const userId = ctx.from?.id.toString();
    if (!userId) return;
    
    const user = await prisma.user.findUnique({
      where: { telegramId: userId },
      include: { kolSettings: true }
    });
    
    if (!user) {
      return ctx.editMessageText("❌ Please start the bot first with /start");
    }
    
    // Mark user as KOL if not already
    if (!user.isKol) {
      await prisma.user.update({
        where: { id: user.id },
        data: { isKol: true }
      });
    }
    
    // Import the inline setup functions
    const { handleKolCallbacks } = await import("./kol-inline");
    
    // Create or update KOL settings if needed
    if (!user.kolSettings) {
      await prisma.kolSettings.create({
        data: {
          userId: user.id,
          acceptedTipTokens: [],
          groupAccessEnabled: false
        }
      });
    }
    
    // Show the KOL setup menu using the inline system
    ctx.callbackQuery = { ...ctx.callbackQuery!, data: `kol_settings:${userId}` };
    await handleKolCallbacks(ctx);
  });

  bot.callbackQuery("kol_profile", async (ctx) => {
    await ctx.answerCallbackQuery();
    const username = ctx.from?.username;
    if (username) {
      const { commandKolProfile } = await import("./kol-inline");
      await commandKolProfile(ctx);
    } else {
      await ctx.editMessageText(
        "❌ You need a Telegram username to use KOL features.\n\n" +
        "Please set a username in Telegram settings first.",
        { reply_markup: new InlineKeyboard().text("⬅️ Back", "main_kol") }
      );
    }
  });

  bot.callbackQuery("kol_content", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      "📝 **Create Paywalled Content**\n\n" +
      "**Setup Steps:**\n" +
      "1. First run `/channel_init` in your channel to set it up\n" +
      "2. Use `/post_locked` to create paywalled posts\n\n" +
      "**Content Types:**\n" +
      "• Text posts with pricing\n" +
      "• Mixed content (text + images/video)\n" +
      "• Flexible pricing in any supported token\n\n" +
      "_Make sure you're an admin in the channel first!_",
      { 
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("⬅️ Back", "main_kol")
      }
    );
  });

  bot.callbackQuery("kol_group", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      "🔗 **Link Paid Group**\n\n" +
      "**Setup Steps:**\n" +
      "1. Add the bot as admin to your private group\n" +
      "2. Use `/linkgroup` in the group to connect it\n" +
      "3. Configure pricing with `/setup`\n" +
      "4. Share your profile with `/kol @yourusername`\n\n" +
      "**Group Features:**\n" +
      "• One-time payment for access\n" +
      "• Automatic invite link generation\n" +
      "• Member management and tracking\n\n" +
      "_Bot needs admin permissions to manage invites_",
      { 
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("⬅️ Back", "main_kol")
      }
    );
  });

  bot.callbackQuery("kol_stats", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      "📊 **KOL Statistics**\n\n" +
      "This feature is coming soon!\n\n" +
      "**Planned Stats:**\n" +
      "• Total tips received\n" +
      "• Content unlock earnings\n" +
      "• Group access revenue\n" +
      "• Top supporters\n" +
      "• Monthly breakdowns\n\n" +
      "_Check back in future updates_",
      { 
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("⬅️ Back", "main_kol")
      }
    );
  });
}
