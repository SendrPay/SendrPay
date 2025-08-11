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
      // Wait a moment to ensure any previous instances are cleared
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Clear webhook and drop ALL pending updates to avoid conflicts
      await bot!.api.deleteWebhook({ drop_pending_updates: true });
      logger.info("Webhook cleared");
      
      // Wait another moment after clearing webhook
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Get latest offset to avoid processing old messages
      const latestUpdates = await bot!.api.getUpdates({ limit: 1, timeout: 1 });
      let offset = latestUpdates.length > 0 ? latestUpdates[0].update_id + 1 : 0;
      logger.info(`Starting polling from offset: ${offset}`);
      
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
            logger.error(`Polling error: ${pollError instanceof Error ? pollError.message : String(pollError)}`);
            
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