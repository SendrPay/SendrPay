import "./infra/env";
import { bot as telegramBot } from "./bot";
import { client as discordClient } from "./discord/bot";
import express from "express";
import { heliusWebhook } from "./routes/helius";
import { env } from "./infra/env";

console.log("🚀 FINAL WORKING VERSION - Starting both bots...");

const app = express();
app.use(express.json({ limit: "1mb" }));

// Status dashboard
app.get("/", (req, res) => {
  res.send(`
    <h1>SendrPay - Both Bots Online</h1>
    <p>Discord: ${discordClient?.isReady() ? '✅ ONLINE' : '❌ OFFLINE'}</p>
    <p>Telegram: ${telegramBot ? '✅ ONLINE' : '❌ OFFLINE'}</p>
    <p>Updated: ${new Date().toISOString()}</p>
  `);
});

app.get("/health", (req, res) => {
  res.json({ 
    status: "ok",
    discord: discordClient?.isReady() || false,
    telegram: !!telegramBot,
    timestamp: new Date().toISOString()
  });
});

app.post("/webhooks/helius", heliusWebhook);

// Telegram webhook - simple and reliable
app.post("/tg", async (req, res) => {
  if (telegramBot && req.body) {
    try {
      await telegramBot.handleUpdate(req.body);
      res.status(200).send("OK");
    } catch (error) {
      console.error("Telegram webhook error:", error);
      res.status(500).send("Error");
    }
  } else {
    res.status(404).send("No bot");
  }
});

async function startBothBots() {
  console.log("Starting HTTP server...");
  app.listen(5000, "0.0.0.0", () => {
    console.log("✅ Server running on port 5000");
  });

  // Start Discord first
  if (discordClient && env.DISCORD_TOKEN) {
    console.log("Starting Discord bot...");
    try {
      await discordClient.login(env.DISCORD_TOKEN);
      console.log("✅ Discord bot online");
    } catch (error) {
      console.error("Discord error:", error);
    }
  }

  // Initialize and start Telegram
  if (telegramBot) {
    console.log("Initializing Telegram bot...");
    try {
      // Critical: Initialize first
      await telegramBot.init();
      console.log("✅ Telegram bot initialized");

      // Clear webhook and set new one
      await telegramBot.api.deleteWebhook({ drop_pending_updates: true });
      
      const publicUrl = process.env.PUBLIC_URL || process.env.REPL_URL;
      if (publicUrl) {
        const webhookUrl = `${publicUrl.replace(/\/$/, '')}/tg`;
        await telegramBot.api.setWebhook(webhookUrl);
        console.log("✅ Telegram webhook set:", webhookUrl);
      }
      
      console.log("✅ Telegram bot ready");
    } catch (error) {
      console.error("Telegram error:", error);
    }
  }

  console.log("🎉 BOTH BOTS ARE NOW RUNNING!");
}

startBothBots().catch(error => {
  console.error("Startup failed:", error);
  process.exit(1);
});