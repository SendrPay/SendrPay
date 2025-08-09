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

  // Default handler
  bot.on("message", async (ctx) => {
    const chatType = ctx.chat?.type;
    if (chatType === "private") {
      await ctx.reply("Use /start to begin or /help for commands.");
    }
    // Ignore group messages without commands
  });
}

export { BotContext };
