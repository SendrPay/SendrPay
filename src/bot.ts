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

  // Handle notification callbacks (reactions only)
  bot.on("callback_query", async (ctx) => {
    const data = ctx.callbackQuery?.data;
    if (!data) return;

    if (data.startsWith("react_")) {
      // Handle payment reactions
      const { handleReactionCallback } = await import("./core/notifications-simple");
      await handleReactionCallback(ctx);
    } else if (data === "already_reacted") {
      // Handle already reacted button
      const { handleAlreadyReacted } = await import("./core/notifications-simple");
      await handleAlreadyReacted(ctx);
    }
    // Other callback handlers will be processed by command routers
  });

  // Handle reply messages for tips in groups
  bot.on("message", async (ctx) => {
    const chatType = ctx.chat?.type;
    const text = ctx.message?.text || "";
    
    // Handle tip commands for both groups (with replies) and DMs (with @username)
    if (text.startsWith("/tip")) {
      logger.info("Tip command detected: chatType=" + chatType + ", hasReply=" + !!ctx.message?.reply_to_message + ", messageId=" + ctx.message?.message_id);
      
      if (chatType !== "private") {
        // Group tip: requires reply
        if (ctx.message?.reply_to_message) {
          logger.info("Processing group tip command with reply context: originalAuthor=" + ctx.message.reply_to_message.from?.username + ", originalMessageId=" + ctx.message.reply_to_message.message_id);
          const { commandTip } = await import("./commands/tip");
          return commandTip(ctx);
        } else {
          logger.info("Group tip command without reply - showing error");
          return ctx.reply("❌ Reply to a message to tip its author.");
        }
      } else {
        // DM tip: handle directly
        logger.info("Processing DM tip command");
        const { commandTip } = await import("./commands/tip");
        return commandTip(ctx);
      }
    }
    
    if (chatType === "private") {
      // Default private message handler - only respond to commands
      await ctx.reply("Use /start to begin or /help for commands.");
    }
    // Ignore other group messages without commands
  });
}

export { BotContext };
