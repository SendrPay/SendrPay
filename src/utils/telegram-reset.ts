/**
 * Utility functions for hard-resetting Telegram bot updates (from troubleshooting guide)
 * Helps resolve "must reply" issues by flushing cached updates
 */

import { env } from "../infra/env";
import { logger } from "../infra/logger";

/**
 * Hard-reset updates by deleting webhook and dropping pending updates
 * This fixes issues where bot privacy was recently changed from ON to OFF
 */
export async function hardResetUpdates(): Promise<boolean> {
  if (!env.BOT_TOKEN) {
    logger.error("No bot token available for hard reset");
    return false;
  }

  try {
    // Step 1: Delete webhook with drop_pending_updates=true
    const deleteResponse = await fetch(
      `https://api.telegram.org/bot${env.BOT_TOKEN}/deleteWebhook?drop_pending_updates=true`
    );
    
    if (!deleteResponse.ok) {
      logger.error("Failed to delete webhook during hard reset");
      return false;
    }

    const deleteResult = await deleteResponse.json();
    logger.info("Webhook deleted, pending updates dropped:", deleteResult);

    // Step 2: Re-set webhook if we're using webhooks
    // Note: This is for webhook mode - for polling mode, just restarting the bot clears the queue
    // Since we're using polling, we don't need to re-set webhook
    
    logger.info("Hard reset completed successfully");
    return true;
  } catch (error) {
    logger.error("Error during hard reset:", error);
    return false;
  }
}

/**
 * Test function to verify reply detection is working
 * Based on troubleshooting guide recommendations
 */
export function testReplyDetection(ctx: any): void {
  console.log("=== REPLY DETECTION TEST ===");
  
  // Check all possible paths for reply data (from troubleshooting guide)
  const u = ctx.update as any;
  const msg = u.message || u.edited_message;
  
  console.log("Direct paths:");
  console.log("- msg.reply_to_message:", !!msg?.reply_to_message);
  console.log("- msg.message?.reply_to_message:", !!msg?.message?.reply_to_message);
  console.log("- ctx.msg?.reply_to_message:", !!ctx.msg?.reply_to_message);
  
  // The three paths suggested in the troubleshooting guide
  const reply1 = msg?.reply_to_message;
  const reply2 = msg?.message?.reply_to_message;
  const reply3 = ctx.msg?.reply_to_message;
  
  console.log("Reply detection results:");
  console.log("- Path 1 (msg.reply_to_message):", !!reply1);
  console.log("- Path 2 (msg.message.reply_to_message):", !!reply2);
  console.log("- Path 3 (ctx.msg.reply_to_message):", !!reply3);
  
  const bestReply = reply1 || reply2 || reply3;
  console.log("Best reply found:", !!bestReply);
  
  if (bestReply) {
    console.log("Reply details:");
    console.log("- Reply from ID:", bestReply.from?.id);
    console.log("- Reply from username:", bestReply.from?.username);
    console.log("- Reply message ID:", bestReply.message_id);
  }
  
  console.log("=== REPLY DETECTION TEST END ===");
}