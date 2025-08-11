import "./infra/env";
import { bot as telegramBot } from "./bot";
import { client as discordClient } from "./discord/bot";
import express from "express";
import { heliusWebhook } from "./routes/helius";
import { env } from "./infra/env";

console.log("🚀 DEPLOYMENT WITH POLLING - No webhooks");

const app = express();
app.use(express.json({ limit: "1mb" }));

// Simple status page
app.get("/", (req, res) => {
  res.send(`
    <h1>SendrPay Deployment</h1>
    <p>Discord: ${discordClient?.isReady() ? 'ONLINE' : 'OFFLINE'}</p>
    <p>Telegram: ${telegramBot ? 'ONLINE' : 'OFFLINE'}</p>
    <p>Mode: Polling (No Webhooks)</p>
    <p>Time: ${new Date().toISOString()}</p>
  `);
});

app.get("/health", (req, res) => {
  res.json({ 
    status: "ok",
    discord: discordClient?.isReady() || false,
    telegram: !!telegramBot,
    mode: "polling"
  });
});

app.post("/webhooks/helius", heliusWebhook);

// NO Telegram webhook endpoint - using polling only

async function startDeployment() {
  // Start HTTP server
  app.listen(5000, "0.0.0.0", () => {
    console.log("✅ HTTP server running");
  });

  // Start Discord bot
  if (discordClient && env.DISCORD_TOKEN) {
    try {
      await discordClient.login(env.DISCORD_TOKEN);
      console.log("✅ Discord bot online");
    } catch (error) {
      console.error("Discord failed:", error);
    }
  }

  // Start Telegram with POLLING ONLY (no webhooks)
  if (telegramBot) {
    try {
      // Make sure no webhook is set
      await telegramBot.api.deleteWebhook({ drop_pending_updates: true });
      console.log("✅ Cleared any existing webhook");
      
      // Initialize bot
      await telegramBot.init();
      console.log("✅ Telegram bot initialized");
      
      // Start polling
      await telegramBot.start();
      console.log("✅ Telegram bot started with POLLING");
      
    } catch (error) {
      console.error("Telegram failed:", error);
    }
  }

  console.log("🎉 DEPLOYMENT COMPLETE - Both bots running with polling");
}

startDeployment().catch(error => {
  console.error("Deployment failed:", error);
});

// Keep process alive
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  if (telegramBot) {
    await telegramBot.stop();
  }
  if (discordClient) {
    discordClient.destroy();
  }
  process.exit(0);
});