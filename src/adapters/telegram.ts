import { Bot, Context, session, SessionFlavor } from "grammy";
import { env } from "../infra/env";
import { logger } from "../infra/logger";

// Basic session data used across commands
interface SessionData {
  awaitingPrivateKey?: boolean;
  linkingPhantom?: boolean;
  phantomNonce?: string;
  tipIntent?: any; // used by tipping flows
}

export type BotContext = Context & SessionFlavor<SessionData>;

// Initialize bot only if token provided
export const bot = env.BOT_TOKEN ? new Bot<BotContext>(env.BOT_TOKEN) : null;

if (bot) {
  bot.use(session({ initial: (): SessionData => ({}) }));

  // Log and swallow errors to avoid crashes
  bot.catch((err) => {
    logger.error("Bot error", err.error);
  });

  // Register core commands
  bot.command("pay", async (ctx) => (await import("../commands/pay")).commandPay(ctx));
  bot.command("tip", async (ctx) => (await import("../commands/tip")).commandTip(ctx));
  bot.command("balance", async (ctx) => (await import("../commands/balance")).commandBalance(ctx));
  bot.command("withdraw", async (ctx) => (await import("../commands/withdraw")).commandWithdraw(ctx));
  bot.command("enable", async (ctx) => (await import("../commands/enable")).commandEnable(ctx));
  bot.command("settings", async (ctx) => (await import("../commands/settings")).commandSettings(ctx));
  bot.command("admin", async (ctx) => (await import("../commands/admin")).commandAdmin(ctx));

  type CallbackHandler = (
    ctx: BotContext,
    action: string,
    params: Record<string, string>
  ) => Promise<void>;

  const handlers: Record<string, CallbackHandler> = {
    async pay(ctx, action, params) {
      const { handlePaymentConfirmation } = await import("../commands/pay");
      const id = params["id"];
      (ctx.callbackQuery as any).data = `${action === "confirm" ? "confirm" : "cancel"}_pay_${id}`;
      await handlePaymentConfirmation(ctx, action === "confirm");
    },
    async tip(ctx, action, params) {
      const {
        handleTipCallback,
        handleTipAmountCallback,
        handleTipConfirmCallback,
        handleCancelCallback
      } = await import("../commands/kol");
      switch (action) {
        case "init":
          (ctx.callbackQuery as any).data = `tip_${params["kol"]}_${params["token"]}`;
          await handleTipCallback(ctx);
          break;
        case "amount":
          (ctx.callbackQuery as any).data = `tip_amount_${params["value"]}`;
          await handleTipAmountCallback(ctx);
          break;
        case "confirm":
          (ctx.callbackQuery as any).data = `tip_confirm_${params["kol"]}_${params["token"]}_${params["value"]}`;
          await handleTipConfirmCallback(ctx);
          break;
        case "cancel":
          (ctx.callbackQuery as any).data = "tip_cancel";
          await handleCancelCallback(ctx, "tip");
          break;
      }
    },
    async balance(ctx, action) {
      const { handleBalanceCallbacks } = await import("../commands/balance");
      const map: Record<string, string> = {
        deposit: "deposit",
        withdraw: "withdraw",
        refresh: "refresh_balance"
      };
      (ctx.callbackQuery as any).data = map[action] || action;
      await handleBalanceCallbacks(ctx);
    },
    async settings(ctx) {
      const { handleSettingsCallback } = await import("../commands/settings");
      await handleSettingsCallback(ctx);
    }
  };

  // Single callback query router
  bot.on("callback_query", async (ctx) => {
    let answered = false;
    const safeAnswer = async (params?: Parameters<typeof ctx.answerCallbackQuery>[0]) => {
      if (answered) return;
      await ctx.answerCallbackQuery(params);
      answered = true;
    };
    const timer = setTimeout(() => {
      safeAnswer().catch(() => {});
    }, 1900);
    try {
      const data = ctx.callbackQuery?.data;
      if (!data || !data.startsWith("sp:")) {
        await safeAnswer();
        return;
      }
      const parts = data.split(":");
      const domain = parts[1];
      const action = parts[2];
      const params: Record<string, string> = {};
      for (const segment of parts.slice(3)) {
        const [k, v] = segment.split("=");
        if (k) params[k] = v || "";
      }
      const handler = handlers[domain];
      if (handler) {
        await handler(ctx, action, params);
        await safeAnswer();
      } else {
        await safeAnswer({ text: "Unknown action", show_alert: true });
      }
    } catch (error) {
      logger.error("Callback handler error", error);
      await safeAnswer({ text: "Something went wrong. Please try again.", show_alert: true });
    } finally {
      clearTimeout(timer);
    }
  });
}
