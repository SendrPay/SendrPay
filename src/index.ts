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

const port = process.env.PORT || 5000;
app.listen(port, "0.0.0.0", async () => {
  logger.info(`HTTP server listening on port ${port}`);
  
  // Start bot polling for production deployment
  if (bot) {
    try {
      logger.info("Starting bot polling...");
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