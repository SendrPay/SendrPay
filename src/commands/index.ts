import type { Bot } from "grammy";
import type { BotContext } from "../bot";
import { logger } from "../infra/logger";
import { commandPay } from "./pay";
import { commandEnable } from "./enable";
import { commandTip } from "./tip";
import { commandSplit } from "./split";
import { commandBalance } from "./balance";
import { commandWithdraw } from "./withdraw";
import { commandGiveaway } from "./giveaway";
import { commandSettings } from "./settings";
import { commandAdmin } from "./admin";
import { commandStart } from "./start";

export function registerGroupRoutes(bot: Bot<BotContext>) {
  // Group commands
  bot.command("enable", commandEnable);
  bot.command("pay", commandPay);
  bot.command("tip", commandTip);
  bot.command("split", commandSplit);
  bot.command("balance", commandBalance);
  bot.command("giveaway", commandGiveaway);
  bot.command("settings", commandSettings);
  bot.command("admin", commandAdmin);
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
    await ctx.reply(`⚠️ **Send your private key in the next message**

Supported formats:
• Base58 string (e.g. 5Kb8kLf...)
• JSON array (e.g. [1,2,3,...])

**Security Warning:**
• Only import keys you control
• Never share your private key
• Message will be deleted after processing

Send your private key now:`, { parse_mode: "Markdown" });
  });

  // Payment commands also work in DM for direct payments
  bot.command("pay", commandPay);
  bot.command("tip", commandTip);
  bot.command("split", commandSplit);
  bot.command("balance", commandBalance);
  bot.command("withdraw", commandWithdraw);
  
  // Handle private key import when user sends a message in DM
  bot.on("message:text", async (ctx) => {
    if (ctx.chat?.type === "private" && ctx.session.awaitingPrivateKey) {
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
    await ctx.reply(`⚠️ **Send your private key in the next message**

Supported formats:
• Base58 string (e.g. 5Kb8kLf...)
• JSON array (e.g. [1,2,3,...])

**Security Warning:**
• Only import keys you control
• Never share your private key
• Message will be deleted after processing

Send your private key now:`, { parse_mode: "Markdown" });
  });
}
