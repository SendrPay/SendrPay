import "./infra/env";
import { logger } from "./infra/logger";

// Import both bot systems
import "./index";  // Telegram bot
import "./discord/index";  // Discord bot

logger.info("🚀 Starting combined Discord + Telegram bot for production deployment");

// Graceful shutdown handler
process.on('SIGINT', async () => {
  logger.info('🔄 Shutting down both bots gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('🔄 Shutting down both bots gracefully...');
  process.exit(0);
});