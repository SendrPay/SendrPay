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

// Only setup webhooks in production, use polling in development
if (!isDevelopment && bot) {
  const { telegramWebhook } = require("./routes/telegram");
  app.post("/telegram", telegramWebhook);
}

app.post("/webhooks/helius", heliusWebhook);

const port = process.env.PORT || 5000;
app.listen(port, "0.0.0.0", () => {
  logger.info(`HTTP server listening on port ${port}`);
});

// For deployed bots, use webhook mode only. For local development, avoid polling conflicts
if (bot) {
  if (isDevelopment) {
    logger.info("Bot configured for development - webhook mode to avoid polling conflicts");
    logger.info("To test locally: send messages via webhook endpoints or use a separate test bot");
  } else {
    logger.info("Bot configured for production webhook mode");
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
