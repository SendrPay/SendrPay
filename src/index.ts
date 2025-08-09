import "./infra/env";
import { bot } from "./bot";
import express from "express";
import { heliusWebhook } from "./routes/helius";
import { webRoutes } from "./routes/web";
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
app.use("/", webRoutes);

const port = process.env.PORT || 5000;
app.listen(port, "0.0.0.0", () => {
  logger.info(`HTTP server listening on port ${port}`);
});

// Start bot in long polling for development only
if (bot && isDevelopment) {
  bot.start().then(() => {
    logger.info("Telegram bot started successfully in polling mode");
  }).catch((error) => {
    logger.error("Failed to start bot:", error);
    process.exit(1);
  });
} else if (bot) {
  logger.info("Bot configured for webhook mode");
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
