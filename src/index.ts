import "./infra/env";
import { bot } from "./bot";
import express from "express";
import { heliusWebhook } from "./routes/helius";
import { logger } from "./infra/logger";
import { env } from "./infra/env";

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

// Telegram webhook endpoint for combined mode
app.use(`/tg`, async (req, res) => {
  if (bot) {
    try {
      await bot.handleUpdate(req.body);
      res.ok();
    } catch (error) {
      console.error('Telegram webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  } else {
    res.status(404).json({ error: 'Bot not configured' });
  }
});

const port = process.env.PORT || 5000;
app.listen(port, "0.0.0.0", async () => {
  logger.info(`HTTP server listening on port ${port}`);
  
  // Set up webhook mode for Telegram to avoid conflicts with Discord
  if (bot && env.PUBLIC_URL) {
    try {
      await bot.api.deleteWebhook();
      logger.info('Cleared existing webhook');
      
      const webhookUrl = `${env.PUBLIC_URL}/tg`;
      await bot.api.setWebhook(webhookUrl);
      logger.info(`✅ Telegram webhook set to: ${webhookUrl}`);
    } catch (error) {
      logger.error('Failed to set webhook:', error);
      // Fallback to polling
      logger.info("Fallback: Starting bot polling...");
      await bot.start();
      logger.info("✅ Bot started with polling");
    }
  } else if (bot) {
    try {
      logger.info("Starting bot polling (no PUBLIC_URL)...");
      await bot.start();
      logger.info("✅ Bot started successfully");
    } catch (error) {
      logger.error("Bot start error:", error);
    }
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('🔄 Shutting down gracefully...');
  if (bot) {
    await bot.stop();
  }
  process.exit(0);
});