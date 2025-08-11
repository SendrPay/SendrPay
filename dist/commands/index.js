"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerGroupRoutes = registerGroupRoutes;
exports.registerDMRoutes = registerDMRoutes;
const logger_1 = require("../infra/logger");
const pay_1 = require("./pay");
const enable_1 = require("./enable");
const tip_1 = require("./tip");
const balance_1 = require("./balance");
const withdraw_1 = require("./withdraw");
const settings_1 = require("./settings");
const admin_1 = require("./admin");
const start_1 = require("./start");
const help_1 = require("./help");
const deposit_1 = require("./deposit");
const history_1 = require("./history");
const debug_1 = require("./debug");
const linkcode_1 = require("./linkcode");
const merge_wallet_1 = require("./merge-wallet");
function registerGroupRoutes(bot) {
    // Group commands
    bot.command("enable", enable_1.commandEnable);
    bot.command("pay", pay_1.commandPay);
    bot.command("tip", tip_1.commandTip);
    bot.command("balance", balance_1.commandBalance);
    bot.command("settings", settings_1.commandSettings);
    bot.command("admin", admin_1.commandAdmin);
    // Debug commands for troubleshooting (admin-only)
    bot.command("debug_reply", debug_1.commandDebugReply);
    bot.command("debug_reset", debug_1.commandDebugReset);
    bot.command("debug_message", debug_1.commandDebugMessage);
}
function registerDMRoutes(bot) {
    // DM commands
    bot.command("start", start_1.commandStart);
    bot.command("generate", async (ctx) => {
        if (ctx.chat?.type !== "private") {
            return ctx.reply("This command only works in DM.");
        }
        // Handle wallet generation
        const { generateWallet } = await Promise.resolve().then(() => require("../core/wallets"));
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
    bot.command("pay", pay_1.commandPay);
    bot.command("tip", tip_1.commandTip);
    bot.command("balance", balance_1.commandBalance);
    bot.command("withdraw", withdraw_1.commandWithdraw);
    bot.command("help", help_1.commandHelp);
    bot.command("deposit", deposit_1.commandDeposit);
    bot.command("history", history_1.commandHistory);
    bot.command("linkcode", linkcode_1.commandLinkcode);
    bot.command("keepdiscord", merge_wallet_1.commandKeepDiscord);
    bot.command("keeptelegram", merge_wallet_1.commandKeepTelegram);
    // Debug commands for troubleshooting (admin-only)
    bot.command("debug_reply", debug_1.commandDebugReply);
    bot.command("debug_reset", debug_1.commandDebugReset);
    bot.command("debug_message", debug_1.commandDebugMessage);
    // Handle private key import when user sends a message in DM
    bot.on("message:text", async (ctx) => {
        if (ctx.chat?.type === "private" && ctx.session.awaitingPrivateKey) {
            ctx.session.awaitingPrivateKey = false;
            const { importWallet } = await Promise.resolve().then(() => require("../core/wallets"));
            await importWallet(ctx, ctx.message.text);
            // Delete the message containing the private key for security
            try {
                await ctx.deleteMessage();
            }
            catch (error) {
                logger_1.logger.error("Could not delete private key message:", error);
            }
        }
    });
    // Handle inline keyboard callbacks
    bot.callbackQuery("generate_wallet", async (ctx) => {
        await ctx.answerCallbackQuery();
        const { generateWallet } = await Promise.resolve().then(() => require("../core/wallets"));
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
    bot.callbackQuery("link_discord", async (ctx) => {
        await ctx.answerCallbackQuery();
        await ctx.reply(`🔗 **Link Discord Account**

Already have SendrPay on Discord? Connect your accounts to share one wallet:

**Step 1:** Go to Discord and use \`/linktelegram\`
**Step 2:** Copy the code you receive
**Step 3:** Come back here and use \`/linkcode <CODE>\`

**Benefits:**
• One wallet across both platforms
• Send payments between Discord and Telegram users
• Unified balance and transaction history

Use \`/linkcode\` when you have your Discord code ready!`, { parse_mode: "Markdown" });
    });
    // Settings menu callback handlers
    bot.callbackQuery(/^(home|wallet|send_payment|receive_payment|security|history|help|bot_settings|settings_main|quick_pay)$/, async (ctx) => {
        const { handleSettingsCallback } = await Promise.resolve().then(() => require("./settings"));
        await handleSettingsCallback(ctx);
    });
    // Payment confirmation handlers
    bot.callbackQuery(/^confirm_pay_(.+)$/, async (ctx) => {
        await ctx.answerCallbackQuery();
        const { handlePaymentConfirmation } = await Promise.resolve().then(() => require("./pay"));
        await handlePaymentConfirmation(ctx, true);
    });
    bot.callbackQuery(/^cancel_pay_(.+)$/, async (ctx) => {
        await ctx.answerCallbackQuery();
        const { handlePaymentConfirmation } = await Promise.resolve().then(() => require("./pay"));
        await handlePaymentConfirmation(ctx, false);
    });
    // Tip confirmation handlers
    bot.callbackQuery(/^confirm_tip_(.+)$/, async (ctx) => {
        await ctx.answerCallbackQuery();
        const { handleTipConfirmation } = await Promise.resolve().then(() => require("./tip"));
        await handleTipConfirmation(ctx, true);
    });
    bot.callbackQuery(/^cancel_tip_(.+)$/, async (ctx) => {
        await ctx.answerCallbackQuery();
        const { handleTipConfirmation } = await Promise.resolve().then(() => require("./tip"));
        await handleTipConfirmation(ctx, false);
    });
}
