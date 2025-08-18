import "./infra/env";
import { bot as telegramBot } from "./bot";
import express from "express";
import { heliusWebhook } from "./routes/helius";
import miniappRoutes from "./routes/miniapp";
import { logger } from "./infra/logger";
import { env } from "./infra/env";
import path from "path";
import { consumeLinkCode } from "./core/link.js";
import { prisma } from "./infra/prisma.js";

console.log("🚀 SENDPAY TELEGRAM BOT - SIMPLIFIED");

const app = express();
app.use(express.json({ limit: "1mb" }));

// Log all incoming requests BEFORE any other middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`📥 [${timestamp}] ${req.method} ${req.url}`);
  
  if (req.method === 'POST' && req.url === '/tg') {
    console.log('🔔 WEBHOOK REQUEST DETECTED');
    console.log('Content-Type:', req.headers['content-type']);
    console.log('User-Agent:', req.headers['user-agent']);
    console.log('Body size:', req.headers['content-length']);
  }
  
  next();
});

// Serve static files for miniapp FIRST
app.use(express.static('public'));

// Miniapp API routes (with error handling)
try {
  app.use('/api', miniappRoutes);
  console.log('✅ Miniapp routes loaded successfully');
} catch (error) {
  console.error('❌ Failed to load miniapp routes:', error);
}

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
      <p><a href="/miniapp-enhanced.html">Open Miniapp</a></p>
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

// Telegram webhook endpoint
app.post("/tg", async (req, res) => {
  const updateId = req.body?.update_id;
  const messageText = req.body?.message?.text;
  
  console.log(`🎯 Webhook: Update ${updateId} - "${messageText}"`);
  
  if (!telegramBot) {
    console.error("❌ Bot not configured");
    return res.status(500).send("Bot Error");
  }
  
  if (!req.body || !updateId) {
    console.error("❌ Invalid update body");
    return res.status(400).send("Invalid Update");
  }
  
  try {
    await telegramBot.handleUpdate(req.body);
    console.log(`✅ Processed update ${updateId}`);
    res.status(200).send("OK");
  } catch (error) {
    console.error(`❌ Error processing ${updateId}:`, error);
    res.status(500).send("Processing Error");
  }
});

app.post("/webhooks/helius", heliusWebhook);

// Group access link redemption route
app.get("/group/:code", async (req, res) => {
  try {
    const { code } = req.params;
    
    // Consume the link code
    const linkData = await consumeLinkCode(code);
    
    if (!linkData) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Invalid Link - SendrPay</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; text-align: center; }
            .error { color: #d73a49; }
          </style>
        </head>
        <body>
          <h2 class="error">❌ Invalid or Expired Link</h2>
          <p>This group access link is either invalid, already used, or has expired.</p>
          <p>Please contact the group owner for a new invite.</p>
        </body>
        </html>
      `);
    }

    // Get group access record by user ID (will use linkCode in database later)
    const groupAccess = await prisma.groupAccess.findFirst({
      where: {
        memberId: linkData.userId,
        paymentId: { not: null }
      },
      orderBy: {
        accessGranted: 'desc'
      }
    });

    if (!groupAccess) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Group Not Found - SendrPay</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; text-align: center; }
            .error { color: #d73a49; }
          </style>
        </head>
        <body>
          <h2 class="error">❌ Group Not Found</h2>
          <p>The group associated with this link could not be found.</p>
        </body>
        </html>
      `);
    }

    if (!telegramBot) {
      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Service Error - SendrPay</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; text-align: center; }
            .error { color: #d73a49; }
          </style>
        </head>
        <body>
          <h2 class="error">❌ Service Unavailable</h2>
          <p>The bot service is currently unavailable. Please try again later.</p>
        </body>
        </html>
      `);
    }

    try {
      // Create the actual Telegram invite link
      const inviteLink = await telegramBot.api.createChatInviteLink(
        parseInt(groupAccess.groupChatId),
        {
          member_limit: 1,
          name: `Access via code ${code}`,
          expire_date: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours from now
        }
      );

      // Redirect to the Telegram invite
      res.redirect(inviteLink.invite_link);
      
      // Log the redemption
      logger.info({
        code,
        userId: linkData.userId,
        groupId: groupAccess.groupChatId
      }, "Group access link redeemed");
      
    } catch (inviteError) {
      console.error("Error creating Telegram invite:", inviteError);
      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Server Error - SendrPay</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; text-align: center; }
            .error { color: #d73a49; }
          </style>
        </head>
        <body>
          <h2 class="error">❌ Unable to Create Invite</h2>
          <p>There was an error generating your group invite. Please try again later or contact the group owner.</p>
        </body>
        </html>
      `);
    }
    
  } catch (error) {
    console.error("Group access redemption error:", error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Server Error - SendrPay</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; text-align: center; }
          .error { color: #d73a49; }
        </style>
      </head>
      <body>
        <h2 class="error">❌ Server Error</h2>
        <p>An unexpected error occurred. Please try again later.</p>
      </body>
      </html>
    `);
  }
});

// Test routes for debugging
app.post("/test", async (req, res) => {
  console.log("🧪 TEST endpoint called");
  res.send("Test OK");
});

app.post("/webhook-debug", (req, res) => {
  console.log("🚨 DEBUG WEBHOOK HIT");
  res.send("Debug webhook working");
});

// Manual payment test endpoint
app.post("/test-payment", async (req, res) => {
  try {
    console.log("🧪 MANUAL PAYMENT TEST");
    const { handleUnlockPayCallback } = await import("./paywall/inline-simplified");
    
    // Mock callback context
    const mockCtx = {
      from: { id: 6912444681 },
      callbackQuery: { data: 'unlock_pay:1:6488099035:25000000:SOL' },
      answerCallbackQuery: async (msg: string) => console.log('Answer:', msg),
      editMessageText: async (text: string) => console.log('Edit:', text),
      api: {
        sendMessage: async (chatId: number, text: string, opts?: any) => {
          console.log('DM to', chatId, ':', text.substring(0, 50) + '...');
          return { message_id: 999 };
        }
      },
      me: { username: 'disstestbot' }
    };

    console.log('Testing payment callback handler...');
    await handleUnlockPayCallback(mockCtx as any);
    res.json({ status: 'success', message: 'Payment test completed' });
  } catch (error: any) {
    console.error('Manual payment test error:', error);
    res.status(500).json({ error: error.message });
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

  // Check if this is a real deployment (not preview)
  const isActualDeployment = process.env.NODE_ENV === 'production' && 
                            process.env.REPLIT_DEPLOYMENT === 'true';
  
  if (isActualDeployment) {
    // Only use webhooks for actual deployments
    const deployUrl = process.env.REPLIT_URL || process.env.PUBLIC_URL;
    if (deployUrl) {
      try {
        await telegramBot.api.deleteWebhook({ drop_pending_updates: true });
        const webhookUrl = `${deployUrl.replace(/\/$/, '')}/tg`;
        await telegramBot.api.setWebhook(webhookUrl);
        console.log("✅ Deployment webhook set:", webhookUrl);
      } catch (error) {
        console.error("Webhook setup failed:", error);
        await telegramBot.start();
        console.log("✅ Fallback to polling");
      }
    } else {
      await telegramBot.start();
      console.log("✅ No deploy URL, using polling");
    }
  } else {
    // Development/preview mode - always use polling
    await telegramBot.api.deleteWebhook({ drop_pending_updates: true });
    console.log("🔄 Starting polling mode...");
    try {
      // Use a timeout for polling start
      const startTimeout = setTimeout(() => {
        console.log("⚠️ Polling start taking longer than expected...");
      }, 3000);
      
      // Force start with a timeout
      const pollingPromise = telegramBot.start();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Polling timeout')), 10000)
      );
      
      await Promise.race([pollingPromise, timeoutPromise]);
      clearTimeout(startTimeout);
      console.log("✅ Development mode - polling active and running");
    } catch (error) {
      console.error("❌ Polling failed to start:", error);
      // Start bot in non-blocking mode  
      telegramBot.start().catch(err => {
        console.error("❌ Background polling error:", err);
      });
      console.log("✅ Bot started in background mode");
      
      // Manual polling fallback
      console.log("🔄 Starting manual polling fallback...");
      let lastUpdateId = 0;
      const manualPoll = async () => {
        try {
          const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&limit=10&timeout=30`);
          const data = await response.json();
          
          if (data.ok && data.result.length > 0) {
            for (const update of data.result) {
              lastUpdateId = update.update_id;
              console.log(`📥 Manual poll update: ${update.update_id}`);
              await telegramBot!.handleUpdate(update);
            }
          }
        } catch (pollError) {
          console.warn("Manual polling error:", pollError);
        }
        
        // Poll again after 2 seconds
        setTimeout(manualPoll, 2000);
      };
      
      // Start manual polling after 5 seconds
      setTimeout(manualPoll, 5000);
    }
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