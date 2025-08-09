import { Bot, Context, session } from "grammy";
import { env } from "./infra/env";
import { logger } from "./infra/logger";
import { registerGroupRoutes, registerDMRoutes } from "./commands";

// Extend context with session data
interface SessionData {
  awaitingPrivateKey?: boolean;
  linkingPhantom?: boolean;
  phantomNonce?: string;
}

type BotContext = Context & {
  session: SessionData;
};

// Only create bot if token is available
export const bot = env.BOT_TOKEN ? new Bot<BotContext>(env.BOT_TOKEN) : null;

// Configure bot if available
if (bot) {
  // Add session middleware
  bot.use(session({
    initial: (): SessionData => ({})
  }));

  // Global error handling
  bot.catch((err) => {
    const error = err.error;
    const ctx = err.ctx;
    logger.error(`Bot error: ${error instanceof Error ? error.message : String(error)}`);
    logger.error(`Error context - Update: ${ctx.update.update_id}, Chat: ${ctx.chat?.id}, User: ${ctx.from?.id}`);
  });

  // Log all updates for debugging
  bot.use((ctx, next) => {
    logger.info(`Update: ${ctx.update.update_id}, Chat: ${ctx.chat?.id}, User: ${ctx.from?.id}`);
    return next();
  });

  // Register command routers
  registerGroupRoutes(bot);
  registerDMRoutes(bot);

  // Handle notification callbacks (reactions and thank you messages)
  bot.on("callback_query", async (ctx) => {
    const data = ctx.callbackQuery?.data;
    if (!data) return;

    if (data.startsWith("react_")) {
      // Handle payment reactions
      const { handleReactionCallback } = await import("./core/notifications-simple");
      await handleReactionCallback(ctx);
    } else if (data.startsWith("thank_")) {
      // Handle thank you message setup
      const { handleThankYouCallback } = await import("./core/notifications-simple");
      await handleThankYouCallback(ctx);
    }
    // Other callback handlers will be processed by command routers
  });

  // Handle thank you replies and media
  bot.on("message", async (ctx) => {
    const chatType = ctx.chat?.type;
    
    // Handle thank you replies and GIFs/stickers
    if (chatType === "private") {
      const { handleThankYouReply, handleThankYouMedia } = await import("./core/notifications-simple");
      
      // Check for thank you message replies
      if (ctx.message?.reply_to_message) {
        await handleThankYouReply(ctx);
        return;
      }
      
      // Check for thank you GIFs/stickers
      if (ctx.message?.animation || ctx.message?.sticker) {
        await handleThankYouMedia(ctx);
        return;
      }
      
      // Default private message handler
      await ctx.reply("Use /start to begin or /help for commands.");
    }
    // Ignore group messages without commands
  });
}

export { BotContext };
