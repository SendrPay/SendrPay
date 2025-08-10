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

// Setup webhook endpoint only for production
if (bot && !isDevelopment) {
  const { telegramWebhook } = require("./routes/telegram");
  app.post("/telegram", telegramWebhook);
  logger.info("Telegram webhook endpoint configured at /telegram");
}

app.post("/webhooks/helius", heliusWebhook);

const port = process.env.PORT || 5000;
app.listen(port, "0.0.0.0", () => {
  logger.info(`HTTP server listening on port ${port}`);
});

// Bot startup configuration
if (bot) {
  if (isDevelopment) {
    // In development, clear webhook and stop any existing bot instances
    logger.info("Clearing webhook and starting polling mode...");
    
    const startBot = async () => {
      try {
        // Clear webhook and drop pending updates
        await bot!.api.deleteWebhook({ drop_pending_updates: true });
        logger.info("Webhook cleared successfully");
        
        // Add delay to ensure cleanup
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Start bot
        await bot!.start();
        logger.info("Telegram bot started successfully in polling mode");
      } catch (error) {
        logger.error(`Failed to start bot: ${error instanceof Error ? error.message : String(error)}`);
        if (error instanceof Error && error.stack) {
          logger.error(`Stack: ${error.stack}`);
        }
        
        // Retry after delay if it's a conflict error
        if (error instanceof Error && error.message.includes("409")) {
          logger.info("Retrying bot start in 5 seconds due to conflict...");
          setTimeout(() => startBot(), 5000);
        }
      }
    };
    
    startBot();
  } else {
    // In production, clear any existing webhook and let external setup handle it
    logger.info("Bot configured for production webhook mode");
    logger.info("Remember to set webhook URL: https://api.telegram.org/bot<TOKEN>/setWebhook?url=<YOUR_DEPLOYED_URL>/telegram");
  }
} else {
  logger.warn("Bot not configured - missing BOT_TOKEN");
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  if (bot) {
    await bot.stop();
  }
  process.exit(0);
});
