import "./infra/env";
import { bot as telegramBot } from "./bot";
import { client as discordClient } from "./discord/bot";
import express from "express";
import { heliusWebhook } from "./routes/helius";
import { logger } from "./infra/logger";
import { env } from "./infra/env";

// Use built-in fetch for Node.js 18+

const app = express();
app.use(express.json({ limit: "1mb" }));

// Root route
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>SendrPay Bot</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; margin: 40px; line-height: 1.6; }
        .status { padding: 10px; border-radius: 5px; margin: 10px 0; }
        .online { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .offline { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        h1 { color: #333; }
        .bot-status { display: flex; gap: 20px; flex-wrap: wrap; }
      </style>
    </head>
    <body>
      <h1>SendrPay Multi-Platform Bot</h1>
      <p>A Solana blockchain payment bot for Discord and Telegram platforms.</p>
      
      <div class="bot-status">
        <div class="status ${discordClient?.isReady() ? 'online' : 'offline'}">
          <strong>Discord Bot:</strong> ${discordClient?.isReady() ? 'Online ✅' : 'Offline ❌'}
        </div>
        <div class="status ${telegramBot ? 'online' : 'offline'}">
          <strong>Telegram Bot:</strong> ${telegramBot ? 'Online ✅' : 'Offline ❌'}
        </div>
      </div>
      
      <h3>Features</h3>
      <ul>
        <li>Cross-platform Solana payments</li>
        <li>Custodial wallet management</li>
        <li>Account linking between Discord & Telegram</li>
        <li>Real-time blockchain transactions</li>
        <li>Multi-token support (SOL, USDC, BONK, JUP)</li>
      </ul>
      
      <p><strong>Environment:</strong> ${env.NODE_ENV}</p>
      <p><strong>Last Updated:</strong> ${new Date().toISOString()}</p>
      
      <p><a href="/health">View Health Check JSON</a></p>
    </body>
    </html>
  `);
});

// Health check
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    telegramBotConfigured: !!telegramBot,
    discordBotConfigured: !!discordClient,
    discordBotReady: discordClient?.isReady() || false,
    environment: env.NODE_ENV 
  });
});

app.post("/webhooks/helius", heliusWebhook);

// Telegram webhook endpoint
app.post(`/tg`, async (req, res) => {
  if (telegramBot) {
    try {
      logger.debug('Received Telegram webhook update', { updateId: req.body?.update_id });
      await telegramBot.handleUpdate(req.body);
      res.status(200).send('OK');
    } catch (error) {
      logger.error({ error }, 'Telegram webhook error');
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  } else {
    logger.warn('Telegram webhook called but bot not configured');
    res.status(404).json({ error: 'Telegram bot not configured' });
  }
});

async function startDiscordBot() {
  if (!env.DISCORD_TOKEN) {
    logger.warn("DISCORD_TOKEN not provided, Discord bot will not start");
    return;
  }

  // Add Discord client event listeners for better connection management
  discordClient.on('disconnect', () => {
    logger.warn('Discord bot disconnected, will attempt to reconnect');
  });

  discordClient.on('reconnecting', () => {
    logger.info('Discord bot reconnecting...');
  });

  discordClient.on('resume', () => {
    logger.info('Discord bot resumed connection');
  });

  discordClient.on('error', (error) => {
    logger.error({ error }, 'Discord bot error');
    // Don't exit - let Discord.js handle reconnection
  });

  discordClient.on('warn', (info) => {
    logger.warn({ info }, 'Discord bot warning');
  });

  try {
    logger.info("Starting Discord bot...");
    await discordClient.login(env.DISCORD_TOKEN);
    logger.info("✅ Discord bot started successfully");
    
    // Set up periodic status check
    setInterval(() => {
      if (discordClient.isReady()) {
        logger.debug('Discord bot status: online');
      } else {
        logger.warn('Discord bot status: offline - attempting reconnection');
        // Try to reconnect if not ready
        discordClient.login(env.DISCORD_TOKEN).catch(err => {
          logger.error('Discord reconnection failed:', err);
        });
      }
    }, 60000); // Check every minute
    
  } catch (error) {
    logger.error("Discord bot start error:", error);
    // Don't exit process - keep Telegram bot running
    logger.warn("Continuing with Telegram bot only");
    
    // Retry connection after 30 seconds
    setTimeout(() => {
      logger.info("Retrying Discord bot connection...");
      startDiscordBot();
    }, 30000);
  }
}

async function startTelegramBot() {
  if (!telegramBot) {
    logger.warn("Telegram bot not configured");
    return;
  }

  // Clear any existing webhook first to process pending updates
  try {
    await telegramBot.api.deleteWebhook({ drop_pending_updates: true });
    logger.info('Cleared existing Telegram webhook and dropped pending updates');
  } catch (error) {
    logger.warn('Error clearing webhook:', error);
  }

  // Set up webhook mode for Telegram when deployed
  const publicUrl = process.env.PUBLIC_URL || process.env.REPL_URL;
  if (publicUrl) {
    try {
      const webhookUrl = `${publicUrl.replace(/\/$/, '')}/tg`;
      await telegramBot.api.setWebhook(webhookUrl);
      logger.info(`✅ Telegram webhook set to: ${webhookUrl}`);
    } catch (error) {
      logger.error('Failed to set Telegram webhook:', error);
      // Fallback to polling
      logger.info("Fallback: Starting Telegram bot polling...");
      try {
        await telegramBot.start();
        logger.info("✅ Telegram bot started with polling");
      } catch (pollError) {
        logger.error("Telegram bot polling error:", pollError);
      }
    }
  } else {
    try {
      logger.info("Starting Telegram bot polling (no PUBLIC_URL)...");
      await telegramBot.start();
      logger.info("✅ Telegram bot started successfully");
    } catch (error) {
      logger.error("Telegram bot start error:", error);
    }
  }
}

const port = process.env.PORT || 5000;

async function startCombinedApp() {
  // Start HTTP server
  app.listen(port, "0.0.0.0", async () => {
    logger.info(`HTTP server listening on port ${port}`);
    
    // Start both bots
    await Promise.allSettled([
      startDiscordBot(),
      startTelegramBot()
    ]);
    
    logger.info("✅ Combined application started - both bots active");
    
    // Add keep-alive mechanism to prevent server from sleeping
    setInterval(() => {
      // Self-ping to keep the server active
      const selfPing = async () => {
        try {
          const response = await fetch(`http://localhost:${port}/health`);
          const data = await response.json();
          logger.debug({ status: data.status }, 'Keep-alive ping successful');
        } catch (error: any) {
          logger.warn({ error: error.message }, 'Keep-alive ping failed');
        }
      };
      selfPing();
    }, 25 * 60 * 1000); // Ping every 25 minutes to prevent 30-minute timeout
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('🔄 Shutting down gracefully...');
  
  const shutdownPromises: Promise<any>[] = [];
  
  if (telegramBot) {
    shutdownPromises.push(telegramBot.stop());
  }
  
  if (discordClient) {
    shutdownPromises.push(discordClient.destroy());
  }
  
  await Promise.allSettled(shutdownPromises);
  logger.info('✅ Graceful shutdown complete');
  process.exit(0);
});

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught Exception');
  // Don't exit - keep both bots running
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled Rejection');
  // Don't exit - keep both bots running
});

startCombinedApp().catch(error => {
  logger.error('Failed to start combined application:', error);
  process.exit(1);
});