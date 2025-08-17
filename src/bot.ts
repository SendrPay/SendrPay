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
    console.log("=== BOT UPDATE DEBUG ===");
    console.log("Update ID:", ctx.update.update_id);
    console.log("Chat ID:", ctx.chat?.id);
    console.log("Chat type:", ctx.chat?.type);
    console.log("User ID:", ctx.from?.id);
    console.log("Message text:", ctx.message?.text);
    console.log("Has reply:", !!ctx.message?.reply_to_message);
    console.log("Update type:", Object.keys(ctx.update).join(", "));
    console.log("Raw update:", JSON.stringify(ctx.update, null, 2));
    console.log("=== BOT UPDATE DEBUG END ===");
    
    logger.info(`Update: ${ctx.update.update_id}, Chat: ${ctx.chat?.id}, User: ${ctx.from?.id}`);
    return next();
  });

  // Register command routers
  registerGroupRoutes(bot);
  registerDMRoutes(bot);

  // REMOVED - Callback handlers are now in commands/index.ts to prevent duplicates

  // REMOVED - Message handler now in commands/index.ts to prevent duplicates
}

export { BotContext };
