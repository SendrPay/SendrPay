import type { Bot } from "grammy";
import type { BotContext } from "../bot";
import { logger } from "../infra/logger";
import { commandPay } from "./pay";
import { commandEnable } from "./enable";
import { commandTip } from "./tip";

import { commandBalance } from "./balance";
import { commandWithdraw } from "./withdraw";

import { commandSettings } from "./settings";
import { commandAdmin } from "./admin";
import { commandStart } from "./start";
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
  handlePostImageUpload,
  handlePostVideoUpload,
  handlePostPriceInput
} from "./post-locked";
import { registerPaywallCallbacks } from "../paywall/inline-simplified";

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
  
  // KOL commands
  bot.command("setup", commandSetup);
  bot.command("kol", commandKolProfile);
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
        } else if (session.postCreation.step === 'upload_images') {
          await handlePostImageUpload(ctx);
        } else if (session.postCreation.step === 'set_price') {
          await handlePostPriceInput(ctx);
        }
      }
    }
  });
  
  // Removed forwarded message handler - now using direct channel username input
  
  // Handle video uploads for post creation
  bot.on("message:video", async (ctx) => {
    if (ctx.chat?.type === "private") {
      const session = ctx.session as any;
      if (session.postCreation?.step === "upload_video") {
        await handlePostVideoUpload(ctx);
      }
    }
  });

  // Handle photo uploads for post creation  
  bot.on("message:photo", async (ctx) => {
    if (ctx.chat?.type === "private") {
      const session = ctx.session as any;
      if (session.postCreation?.step === "upload_images") {
        await handlePostImageUpload(ctx);
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

  // KOL Setup callbacks
  bot.callbackQuery(/^setup_/, async (ctx) => {
    await handleSetupCallbacks(ctx);
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

  // Channel setup callbacks
  bot.callbackQuery(/^channel_/, async (ctx) => {
    await handleChannelCallbacks(ctx);
  });

  // Post creation callbacks
  bot.callbackQuery(/^post_/, async (ctx) => {
    await handlePostCallbacks(ctx);
  });

  // Register paywall callbacks
  registerPaywallCallbacks(bot);
}
