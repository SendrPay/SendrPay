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
app.listen(port, "0.0.0.0", () => {
  logger.info(`HTTP server listening on port ${port}`);
});

// DON'T START THE BOT - Just configure it and let the existing polling handle it
if (bot) {
  logger.info("✅ Bot configured and ready (polling handled externally)");
  logger.info("🤖 If you see this message, the bot code is loaded correctly");
  logger.info("📱 Test commands in Telegram - they should work if polling is active elsewhere");
} else {
  logger.warn("❌ Bot not configured - missing BOT_TOKEN");
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('🔄 Shutting down gracefully...');
  process.exit(0);
});