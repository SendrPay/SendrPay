"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bot = void 0;
const grammy_1 = require("grammy");
const env_1 = require("./infra/env");
const logger_1 = require("./infra/logger");
const commands_1 = require("./commands");
// Only create bot if token is available
exports.bot = env_1.env.BOT_TOKEN ? new grammy_1.Bot(env_1.env.BOT_TOKEN) : null;
// Configure bot if available
if (exports.bot) {
    // Add session middleware
    exports.bot.use((0, grammy_1.session)({
        initial: () => ({})
    }));
    // Global error handling
    exports.bot.catch((err) => {
        const error = err.error;
        const ctx = err.ctx;
        logger_1.logger.error(`Bot error: ${error instanceof Error ? error.message : String(error)}`);
        logger_1.logger.error(`Error context - Update: ${ctx.update.update_id}, Chat: ${ctx.chat?.id}, User: ${ctx.from?.id}`);
    });
    // Log all updates for debugging
    exports.bot.use((ctx, next) => {
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
        logger_1.logger.info(`Update: ${ctx.update.update_id}, Chat: ${ctx.chat?.id}, User: ${ctx.from?.id}`);
        return next();
    });
    // Register command routers
    (0, commands_1.registerGroupRoutes)(exports.bot);
    (0, commands_1.registerDMRoutes)(exports.bot);
    // Handle notification callbacks (reactions only)
    exports.bot.on("callback_query", async (ctx) => {
        const data = ctx.callbackQuery?.data;
        if (!data)
            return;
        if (data.startsWith("react_")) {
            // Handle payment reactions
            const { handleReactionCallback } = await Promise.resolve().then(() => require("./core/notifications-simple"));
            await handleReactionCallback(ctx);
        }
        else if (data === "already_reacted") {
            // Handle already reacted button
            const { handleAlreadyReacted } = await Promise.resolve().then(() => require("./core/notifications-simple"));
            await handleAlreadyReacted(ctx);
        }
        // Other callback handlers will be processed by command routers
    });
    // Handle general messages (non-command)
    exports.bot.on("message", async (ctx) => {
        const chatType = ctx.chat?.type;
        const text = ctx.message?.text || "";
        // Only handle non-command messages
        if (!text.startsWith("/")) {
            if (chatType === "private") {
                // Default private message handler - only respond to non-commands
                await ctx.reply("Use /start to begin or /help for commands.");
            }
            // Ignore other group messages without commands
        }
    });
}
