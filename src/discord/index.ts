import "../infra/env";
import { client } from "./bot";
import { logger } from "../infra/logger";
import { env } from "../infra/env";

// Start Discord bot
async function startDiscordBot() {
  if (!env.DISCORD_TOKEN) {
    logger.warn("DISCORD_TOKEN not provided, Discord bot will not start");
    return;
  }

  try {
    logger.info("Starting Discord bot...");
    await client.login(env.DISCORD_TOKEN);
    logger.info("✅ Discord bot started successfully");
  } catch (error) {
    logger.error("Discord bot start error:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('🔄 Shutting down Discord bot gracefully...');
  if (client) {
    await client.destroy();
  }
  process.exit(0);
});

startDiscordBot().catch(error => {
  console.error('Failed to start Discord bot:', error);
  process.exit(1);
});