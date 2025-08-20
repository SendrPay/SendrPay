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
    // Skip polling mode completely - set up webhook mode even in development
    logger.info("Setting up webhook mode to avoid 409 conflicts...");
    
    const setupWebhook = async () => {
      try {
        // Clear any existing webhook first
        await bot!.api.deleteWebhook({ drop_pending_updates: true });
        logger.info("Existing webhook cleared");
        
        // Set webhook to our local server
        const webhookUrl = `http://localhost:5000/telegram`;
        await bot!.api.setWebhook(webhookUrl);
        logger.info(`Webhook set to: ${webhookUrl}`);
        
        // Import and set up webhook endpoint
        const { telegramWebhook } = require("./routes/telegram");
        app.post("/telegram", telegramWebhook);
        logger.info("Webhook endpoint configured");
        
      } catch (error) {
        logger.error(`Failed to setup webhook: ${error instanceof Error ? error.message : String(error)}`);
        
        // Fallback: try to start normally but only once
        logger.info("Attempting direct bot start as fallback...");
        try {
          if (process.env.DEBUG === "1") {
            await bot!.start();
            logger.info("Bot started in polling mode successfully");
          } else {
            logger.warn("Skipping bot.start because DEBUG is not '1'");
          }
        } catch (fallbackError) {
          logger.error("Both webhook and polling failed. Bot may not be functional.");
        }
      }
    };
    
    setupWebhook();
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
