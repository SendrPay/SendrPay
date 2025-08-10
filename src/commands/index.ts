import type { Bot } from "grammy";
import type { BotContext } from "../bot";
import { logger } from "../infra/logger";
import { commandPay } from "./pay";
import { commandEnable } from "./enable";
import { commandTip } from "./tip";
import { commandSplit } from "./split";
import { commandBalance } from "./balance";
import { commandWithdraw } from "./withdraw";

import { commandSettings } from "./settings";
import { commandAdmin } from "./admin";
import { commandStart } from "./start";
import { commandDebugReply, commandDebugReset, commandDebugMessage } from "./debug";
import { handleClaimStart, handleClaimToTelegramWallet, handleClaimToAddress } from "./claim";

// Simple session storage for address claims (use Redis in production)
const claimSessions = new Map<string, { escrowId: string; type: 'address' }>();

export function setClaimSession(key: string, value: { escrowId: string; type: 'address' }) {
  claimSessions.set(key, value);
}

export function getClaimSession(key: string) {
  return claimSessions.get(key);
}

export function deleteClaimSession(key: string) {
  claimSessions.delete(key);
}

export function registerGroupRoutes(bot: Bot<BotContext>) {
  // Group commands
  bot.command("enable", commandEnable);
  bot.command("pay", commandPay);
  bot.command("tip", commandTip);
  bot.command("split", commandSplit);
  bot.command("balance", commandBalance);

  bot.command("settings", commandSettings);
  bot.command("admin", commandAdmin);
  
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
  bot.command("split", commandSplit);
  bot.command("balance", commandBalance);
  bot.command("withdraw", commandWithdraw);
  
  // Debug commands for troubleshooting (admin-only)
  bot.command("debug_reply", commandDebugReply);
  bot.command("debug_reset", commandDebugReset);
  bot.command("debug_message", commandDebugMessage);
  
  // Handle private key import and escrow address claims when user sends a message in DM
  bot.on("message:text", async (ctx) => {
    if (ctx.chat?.type === "private") {
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
        return;
      }

      // Check if user is claiming an escrow to an address
      const text = ctx.message.text;
      const userId = ctx.from?.id.toString();
      
      // Check if this is a Solana address for escrow claiming
      if (userId && text && text.length >= 32 && text.length <= 44) {
        const { isValidSolanaAddress } = await import("./claim");
        if (isValidSolanaAddress(text)) {
          // Check if user has pending address claims (simplified - in production use Redis)
          const session = claimSessions.get(`address_${userId}`);
          if (session) {
            const { handleAddressClaim } = await import("./claim");
            await handleAddressClaim(ctx, session.escrowId, text);
            claimSessions.delete(`address_${userId}`);
            return;
          }
        }
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

  // Escrow claim handlers
  bot.callbackQuery(/^claim_telegram_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const escrowId = ctx.callbackQuery?.data?.replace("claim_telegram_", "");
    if (escrowId) {
      await handleClaimToTelegramWallet(ctx, escrowId);
    }
  });

  bot.callbackQuery(/^claim_address_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const escrowId = ctx.callbackQuery?.data?.replace("claim_address_", "");
    if (escrowId) {
      await handleClaimToAddress(ctx, escrowId);
    }
  });
}
