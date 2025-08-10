import "./infra/env";
import { bot } from "./bot";
import express from "express";
import { heliusWebhook } from "./routes/helius";
import { logger } from "./infra/logger";
import { env, isDevelopment } from "./infra/env";

const app = express();
app.use(express.json({ limit: "1mb" }));

// Health check
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    botConfigured: !!bot,
    environment: env.NODE_ENV 
  });
});

app.post("/webhooks/helius", heliusWebhook);

const port = process.env.PORT || 5000;
app.listen(port, "0.0.0.0", () => {
  logger.info(`HTTP server listening on port ${port}`);
});

// MANUAL POLLING APPROACH - BYPASS GRAMMY'S BUILT-IN POLLING
if (bot) {
  logger.info("Starting bot with manual polling (bypassing grammY conflicts)...");
  
  const startManualPolling = async () => {
    try {
      // Clear webhook first
      await bot!.api.deleteWebhook({ drop_pending_updates: true });
      logger.info("Webhook cleared");
      
      // Start manual polling immediately
      let offset = 0;
      let isPolling = true;
      
      const poll = async () => {
        while (isPolling) {
          try {
            const updates = await bot!.api.getUpdates({
              offset: offset,
              timeout: 10,
              limit: 10
            });
            
            logger.info(`📨 Received ${updates.length} updates`);
            
            for (const update of updates) {
              offset = Math.max(offset, update.update_id + 1);
              
              // Log the update for debugging
              console.log("=== UPDATE RECEIVED ===");
              console.log("Update ID:", update.update_id);
              console.log("Message text:", update.message?.text);
              console.log("Chat type:", update.message?.chat?.type);
              console.log("Has reply:", !!update.message?.reply_to_message);
              console.log("======================");
              
              // Process the update through grammY
              await bot!.handleUpdate(update);
            }
            
          } catch (pollError) {
            logger.error("Polling error details:", pollError);
            
            // Check if it's a 409 conflict again
            if (pollError instanceof Error && pollError.message.includes("409")) {
              logger.error("🚨 409 conflict during manual polling - this shouldn't happen!");
              logger.error("Stopping manual polling...");
              isPolling = false;
              break;
            }
            
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
      };
      
      poll();
      logger.info("✅ Manual polling started successfully - bot is now functional!");
      
      // Graceful shutdown
      process.on('SIGINT', () => {
        isPolling = false;
        logger.info("Stopping polling...");
      });
      
    } catch (error) {
      logger.error("❌ Manual polling setup failed:", error);
    }
  };
  
  startManualPolling();
} else {
  logger.warn("❌ Bot not configured - missing BOT_TOKEN");
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('🔄 Shutting down gracefully...');
  if (bot) {
    await bot.stop();
  }
  process.exit(0);
});