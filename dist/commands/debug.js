"use strict";
/**
 * Debug commands for testing bot functionality
 * Based on troubleshooting guide recommendations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.commandDebugReply = commandDebugReply;
exports.commandDebugReset = commandDebugReset;
exports.commandDebugMessage = commandDebugMessage;
const logger_1 = require("../infra/logger");
const telegram_reset_1 = require("../utils/telegram-reset");
const util_1 = require("util");
/**
 * Debug command to test reply detection
 * Use this to verify the bot can detect replies after privacy changes
 */
async function commandDebugReply(ctx) {
    // Only allow admins to use debug commands
    const { env } = await Promise.resolve().then(() => require("../infra/env"));
    const userId = ctx.from?.id;
    if (!userId || !env.ADMIN_USER_IDS?.split(',').includes(userId.toString())) {
        return ctx.reply("❌ Debug commands are admin-only.");
    }
    // Run comprehensive reply detection test
    (0, telegram_reset_1.testReplyDetection)(ctx);
    // Show raw update structure
    const u = ctx.update;
    console.log('DEBUG REPLY RAW:', util_1.default.inspect(u, { depth: 6, colors: true }));
    const msg = u.message || u.edited_message;
    const hasReply = !!msg?.reply_to_message;
    await ctx.reply(`🔧 Debug Reply Test Results:
Reply detected: ${hasReply ? '✅ YES' : '❌ NO'}
${hasReply ? `Reply from: @${msg.reply_to_message.from?.username || 'no-username'} (ID: ${msg.reply_to_message.from?.id})` : 'No reply found - check console logs for detailed analysis'}

See console for full technical details.`);
}
/**
 * Debug command to hard-reset bot updates
 * Use this to flush Telegram's update queue after privacy changes
 */
async function commandDebugReset(ctx) {
    // Only allow admins to use debug commands
    const { env } = await Promise.resolve().then(() => require("../infra/env"));
    const userId = ctx.from?.id;
    if (!userId || !env.ADMIN_USER_IDS?.split(',').includes(userId.toString())) {
        return ctx.reply("❌ Debug commands are admin-only.");
    }
    await ctx.reply("🔧 Starting hard reset of bot updates...");
    const success = await (0, telegram_reset_1.hardResetUpdates)();
    if (success) {
        await ctx.reply("✅ Hard reset completed! Old cached updates have been flushed. Try your commands again.");
        logger_1.logger.info("Admin triggered hard reset successfully");
    }
    else {
        await ctx.reply("❌ Hard reset failed. Check logs for details.");
        logger_1.logger.error("Admin triggered hard reset failed");
    }
}
/**
 * Debug command to show detailed message structure
 * Helpful for understanding why reply detection might fail
 */
async function commandDebugMessage(ctx) {
    // Only allow admins to use debug commands
    const { env } = await Promise.resolve().then(() => require("../infra/env"));
    const userId = ctx.from?.id;
    if (!userId || !env.ADMIN_USER_IDS?.split(',').includes(userId.toString())) {
        return ctx.reply("❌ Debug commands are admin-only.");
    }
    console.log("=== MESSAGE STRUCTURE DEBUG ===");
    console.log("Full context:", util_1.default.inspect(ctx, { depth: 4, colors: true }));
    console.log("Update keys:", Object.keys(ctx.update));
    console.log("Message keys:", ctx.message ? Object.keys(ctx.message) : 'no message');
    console.log("Chat type:", ctx.chat?.type);
    console.log("From user:", ctx.from?.id, ctx.from?.username);
    if (ctx.message?.reply_to_message) {
        console.log("Reply structure:", util_1.default.inspect(ctx.message.reply_to_message, { depth: 3, colors: true }));
    }
    console.log("=== MESSAGE STRUCTURE DEBUG END ===");
    await ctx.reply("🔧 Message structure logged to console. Check server logs for full details.");
}
