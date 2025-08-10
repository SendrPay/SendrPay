/**
 * Debug commands for testing bot functionality
 * Based on troubleshooting guide recommendations
 */

import type { BotContext } from "../bot";
import { logger } from "../infra/logger";
import { hardResetUpdates, testReplyDetection } from "../utils/telegram-reset";
import util from 'util';

/**
 * Debug command to test reply detection
 * Use this to verify the bot can detect replies after privacy changes
 */
export async function commandDebugReply(ctx: BotContext) {
  // Only allow admins to use debug commands
  const { env } = await import("../infra/env");
  const userId = ctx.from?.id;
  if (!userId || !env.ADMIN_USER_IDS?.split(',').includes(userId.toString())) {
    return ctx.reply("❌ Debug commands are admin-only.");
  }

  // Run comprehensive reply detection test
  testReplyDetection(ctx);
  
  // Show raw update structure
  const u = ctx.update as any;
  console.log('DEBUG REPLY RAW:', util.inspect(u, { depth: 6, colors: true }));
  
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
export async function commandDebugReset(ctx: BotContext) {
  // Only allow admins to use debug commands
  const { env } = await import("../infra/env");
  const userId = ctx.from?.id;
  if (!userId || !env.ADMIN_USER_IDS?.split(',').includes(userId.toString())) {
    return ctx.reply("❌ Debug commands are admin-only.");
  }

  await ctx.reply("🔧 Starting hard reset of bot updates...");
  
  const success = await hardResetUpdates();
  
  if (success) {
    await ctx.reply("✅ Hard reset completed! Old cached updates have been flushed. Try your commands again.");
    logger.info("Admin triggered hard reset successfully");
  } else {
    await ctx.reply("❌ Hard reset failed. Check logs for details.");
    logger.error("Admin triggered hard reset failed");
  }
}

/**
 * Debug command to show detailed message structure
 * Helpful for understanding why reply detection might fail
 */
export async function commandDebugMessage(ctx: BotContext) {
  // Only allow admins to use debug commands
  const { env } = await import("../infra/env");
  const userId = ctx.from?.id;
  if (!userId || !env.ADMIN_USER_IDS?.split(',').includes(userId.toString())) {
    return ctx.reply("❌ Debug commands are admin-only.");
  }

  console.log("=== MESSAGE STRUCTURE DEBUG ===");
  console.log("Full context:", util.inspect(ctx, { depth: 4, colors: true }));
  console.log("Update keys:", Object.keys(ctx.update));
  console.log("Message keys:", ctx.message ? Object.keys(ctx.message) : 'no message');
  console.log("Chat type:", ctx.chat?.type);
  console.log("From user:", ctx.from?.id, ctx.from?.username);
  
  if (ctx.message?.reply_to_message) {
    console.log("Reply structure:", util.inspect(ctx.message.reply_to_message, { depth: 3, colors: true }));
  }
  
  console.log("=== MESSAGE STRUCTURE DEBUG END ===");
  
  await ctx.reply("🔧 Message structure logged to console. Check server logs for full details.");
}