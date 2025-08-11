import "./infra/env";
import { bot as telegramBot } from "./bot";
import { client as discordClient } from "./discord/bot";
import express from "express";
import { heliusWebhook } from "./routes/helius";
import { env } from "./infra/env";

console.log("🚀 DEPLOYMENT VERSION - Starting both bots...");

const app = express();
app.use(express.json({ limit: "1mb" }));

// Root route
app.get("/", (req, res) => {
  try {
    res.send(`
      <h1>SendrPay - Both Bots Working</h1>
      <p>Discord: ${discordClient?.isReady() ? '✅ ONLINE' : '❌ OFFLINE'}</p>
      <p>Telegram: ${telegramBot ? '✅ ONLINE' : '❌ OFFLINE'}</p>
      <p>Updated: ${new Date().toISOString()}</p>
    `);
  } catch (error) {
    console.error("Root route error:", error);
    res.status(500).send("Error in root route");
  }
});

// Health check
app.get("/health", (req, res) => {
  try {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      telegramBotConfigured: !!telegramBot,
      discordBotConfigured: !!discordClient,
      discordBotReady: discordClient?.isReady() || false,
      environment: env.NODE_ENV 
    });
  } catch (error) {
    console.error("Health check error:", error);
    res.status(500).json({ error: "Health check failed" });
  }
});

app.post("/webhooks/helius", heliusWebhook);

// Telegram webhook endpoint
app.post(`/tg`, async (req, res) => {
  logger.info('=== TELEGRAM WEBHOOK RECEIVED ===');
  logger.info({ headers: req.headers }, 'Webhook headers');
  logger.info({ body: req.body }, 'Webhook body');
  logger.info({ botConfigured: !!telegramBot }, 'Bot status');
  
  if (telegramBot) {
    try {
      if (!req.body || typeof req.body !== 'object') {
        logger.error({ body: req.body }, 'Invalid webhook body - not an object');
        return res.status(400).json({ error: 'Invalid webhook body' });
      }
      
      logger.info({ updateId: req.body?.update_id }, 'Processing webhook update...');
      await telegramBot.handleUpdate(req.body);
      logger.info('Webhook processed successfully');
      res.status(200).send('OK');
    } catch (error) {
      logger.error({
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error,
        body: req.body
      }, 'Telegram webhook error details');
      res.status(500).json({ error: 'Webhook processing failed', details: error instanceof Error ? error.message : String(error) });
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
    console.warn("Telegram bot not configured");
    return;
  }

  // Initialize bot first (CRITICAL for webhook processing)
  try {
    await telegramBot.init();
    console.log("✅ Telegram bot initialized");
  } catch (error) {
    console.error("❌ Telegram bot initialization failed:", error);
    return;
  }

  // Clear any existing webhook first to process pending updates
  try {
    await telegramBot.api.deleteWebhook({ drop_pending_updates: true });
    console.log('Cleared existing Telegram webhook and dropped pending updates');
  } catch (error) {
    console.warn('Error clearing webhook:', error);
  }

  // Set up webhook mode for Telegram when deployed
  const publicUrl = process.env.PUBLIC_URL || process.env.REPL_URL;
  if (publicUrl) {
    try {
      const webhookUrl = `${publicUrl.replace(/\/$/, '')}/tg`;
      await telegramBot.api.setWebhook(webhookUrl);
      console.log(`✅ Telegram webhook set to: ${webhookUrl}`);
    } catch (error) {
      console.error('Failed to set Telegram webhook:', error);
      // Fallback to polling
      console.log("Fallback: Starting Telegram bot polling...");
      try {
        await telegramBot.start();
        console.log("✅ Telegram bot started with polling");
      } catch (pollError) {
        console.error("Telegram bot polling error:", pollError);
      }
    }
  } else {
    try {
      console.log("Starting Telegram bot polling (no PUBLIC_URL)...");
      await telegramBot.start();
      console.log("✅ Telegram bot started successfully");
    } catch (error) {
      console.error("Telegram bot start error:", error);
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

// Note: Main graceful shutdown handler is above, this is just cleanup