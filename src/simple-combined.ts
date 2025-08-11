import "./infra/env";
import { bot as telegramBot } from "./bot";
import { client as discordClient } from "./discord/bot";
import express from "express";
import { heliusWebhook } from "./routes/helius";
import { logger } from "./infra/logger";
import { env } from "./infra/env";

console.log("Starting simple combined bot...");

const app = express();
app.use(express.json({ limit: "1mb" }));

// Root route
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>SendrPay Bots</title></head>
    <body>
      <h1>SendrPay Multi-Platform Bot</h1>
      <p>Discord: ${discordClient?.isReady() ? '✅ Online' : '❌ Offline'}</p>
      <p>Telegram: ${telegramBot ? '✅ Online' : '❌ Offline'}</p>
      <p>Environment: ${env.NODE_ENV}</p>
      <p>Time: ${new Date().toISOString()}</p>
    </body>
    </html>
  `);
});

// Health check
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok",
    discord: discordClient?.isReady() || false,
    telegram: !!telegramBot,
    time: new Date().toISOString()
  });
});

// Helius webhook
app.post("/webhooks/helius", heliusWebhook);

// Telegram webhook endpoint - SIMPLIFIED
app.post("/tg", async (req, res) => {
  console.log("=== TELEGRAM WEBHOOK ===");
  console.log("Body:", JSON.stringify(req.body, null, 2));
  
  if (!telegramBot) {
    console.log("No Telegram bot configured");
    return res.status(404).json({ error: "No bot" });
  }
  
  try {
    console.log("Processing update...");
    await telegramBot.handleUpdate(req.body);
    console.log("✅ Update processed successfully");
    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Webhook error:", error);
    res.status(500).json({ error: "Failed", details: String(error) });
  }
});

const port = 5000;

async function startApp() {
  // Start HTTP server first
  app.listen(port, "0.0.0.0", () => {
    console.log(`🌐 Server running on port ${port}`);
  });

  // Start Discord bot
  if (env.DISCORD_TOKEN && discordClient) {
    try {
      console.log("🤖 Starting Discord bot...");
      await discordClient.login(env.DISCORD_TOKEN);
      console.log("✅ Discord bot online");
    } catch (error) {
      console.error("❌ Discord bot failed:", error);
    }
  }

  // Start Telegram bot with polling (avoid webhook issues)
  if (telegramBot) {
    try {
      console.log("📱 Starting Telegram bot...");
      
      // Clear any existing webhook
      await telegramBot.api.deleteWebhook({ drop_pending_updates: true });
      console.log("🧹 Cleared existing webhook");
      
      // Small delay then start polling
      setTimeout(async () => {
        try {
          await telegramBot.start();
          console.log("✅ Telegram bot online with polling");
        } catch (pollError) {
          console.error("❌ Telegram polling failed:", pollError);
        }
      }, 1000);
      
    } catch (error) {
      console.error("❌ Telegram bot failed:", error);
    }
  }

  console.log("🚀 Both bots should be running now");
}

startApp().catch(console.error);