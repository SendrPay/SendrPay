import "./infra/env";
import { bot as telegramBot } from "./bot";
import express from "express";
import { heliusWebhook } from "./routes/helius";
import miniappRoutes from "./routes/miniapp";
import { logger } from "./infra/logger";
import { env } from "./infra/env";
import path from "path";

console.log("🚀 SENDPAY TELEGRAM BOT - SIMPLIFIED");

const app = express();
app.use(express.json({ limit: "1mb" }));

// Serve static files for miniapp FIRST
app.use(express.static('public'));

// Miniapp API routes
app.use('/api', miniappRoutes);

// Root route - redirect to miniapp.html
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>SendrPay Miniapp - UPDATED</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body>
      <h1>🔄 UPDATED: SendrPay Telegram Bot</h1>
      <p>Telegram Bot: ${telegramBot ? '✅ ONLINE' : '❌ OFFLINE'}</p>
      <p>Updated: ${new Date().toISOString()}</p>
      <p><a href="/miniapp.html">Open Miniapp</a></p>
      <p><a href="/status">Status Page</a></p>
    </body>
    </html>
  `);
});

// Status route for debugging
app.get("/status", (req, res) => {
  try {
    res.send(`
      <h1>SendrPay - Telegram Bot</h1>
      <p>Telegram Bot: ${telegramBot ? '✅ ONLINE' : '❌ OFFLINE'}</p>
      <p>Updated: ${new Date().toISOString()}</p>
    `);
  } catch (error) {
    console.error("Status route error:", error);
    res.status(500).send("Error in status route");
  }
});

// Health check
app.get("/health", (req, res) => {
  try {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      telegramBotConfigured: !!telegramBot,
      environment: env.NODE_ENV 
    });
  } catch (error) {
    console.error("Health check error:", error);
    res.status(500).json({ error: "Health check failed" });
  }
});

app.post("/webhooks/helius", heliusWebhook);

// Telegram webhook endpoint
app.post("/tg", async (req, res) => {
  if (!telegramBot) {
    return res.status(404).json({ error: "Telegram bot not configured" });
  }
  
  try {
    await telegramBot.handleUpdate(req.body);
    res.status(200).send("OK");
  } catch (error) {
    console.error("Telegram webhook error:", error);
    res.status(500).json({ error: "Webhook failed" });
  }
});

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

  // Use webhooks for deployment (more efficient)
  const publicUrl = process.env.PUBLIC_URL || process.env.REPL_URL;
  if (publicUrl) {
    try {
      // Clear existing webhook
      await telegramBot.api.deleteWebhook({ drop_pending_updates: true });
      
      // Set new webhook
      const webhookUrl = `${publicUrl.replace(/\/$/, '')}/tg`;
      await telegramBot.api.setWebhook(webhookUrl);
      console.log("✅ Telegram webhook set:", webhookUrl);
    } catch (error) {
      console.error("Webhook setup failed, using polling:", error);
      await telegramBot.start();
      console.log("✅ Telegram fallback to polling");
    }
  } else {
    // Development mode - use polling
    await telegramBot.start();
    console.log("✅ Telegram polling mode");
  }
}

const port = Number(process.env.PORT) || 5000;

async function startApp() {
  // Start HTTP server
  app.listen(port, "0.0.0.0", async () => {
    logger.info(`HTTP server listening on port ${port}`);
    
    // Start Telegram bot
    await startTelegramBot();
    
    logger.info("✅ SendrPay Telegram bot started successfully");
    
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
  
  if (telegramBot) {
    await telegramBot.stop();
  }
  
  logger.info('✅ Graceful shutdown complete');
  process.exit(0);
});

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught Exception');
  // Don't exit - keep bot running
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled Rejection');
  // Don't exit - keep bot running
});

startApp().catch(error => {
  logger.error('Failed to start application:', error);
  process.exit(1);
});