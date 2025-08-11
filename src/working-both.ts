import "./infra/env";
import { bot as telegramBot } from "./bot";
import { client as discordClient } from "./discord/bot";
import express from "express";
import { heliusWebhook } from "./routes/helius";
import { env } from "./infra/env";

console.log("🚀 Starting WORKING dual bot setup...");

const app = express();
app.use(express.json({ limit: "1mb" }));

// Status page
app.get("/", (req, res) => {
  res.send(`
    <h1>SendrPay Bots Status</h1>
    <p>Discord: ${discordClient?.isReady() ? '✅ Online' : '❌ Offline'}</p>
    <p>Telegram: ${telegramBot ? '✅ Configured' : '❌ Not configured'}</p>
    <p>Time: ${new Date().toISOString()}</p>
  `);
});

app.get("/health", (req, res) => {
  res.json({ 
    status: "ok",
    discord: discordClient?.isReady() || false,
    telegram: !!telegramBot
  });
});

app.post("/webhooks/helius", heliusWebhook);

// Simple Telegram webhook
app.post("/tg", async (req, res) => {
  if (telegramBot && req.body) {
    try {
      await telegramBot.handleUpdate(req.body);
      res.status(200).send("OK");
    } catch (error) {
      console.error("Telegram error:", error);
      res.status(500).json({ error: "Failed" });
    }
  } else {
    res.status(404).json({ error: "No bot" });
  }
});

async function start() {
  // Start server
  const server = app.listen(5000, "0.0.0.0", () => {
    console.log("✅ HTTP server on port 5000");
  });

  // Start Discord
  if (discordClient && env.DISCORD_TOKEN) {
    discordClient.login(env.DISCORD_TOKEN)
      .then(() => console.log("✅ Discord online"))
      .catch(err => console.error("❌ Discord failed:", err));
  }

  // Start Telegram - choose between webhook or polling
  if (telegramBot) {
    const publicUrl = process.env.PUBLIC_URL || process.env.REPL_URL;
    
    // Initialize bot first (required for webhook processing)
    await telegramBot.init();
    console.log("✅ Telegram bot initialized");
    
    if (publicUrl) {
      // Use webhook in production
      try {
        await telegramBot.api.deleteWebhook({ drop_pending_updates: true });
        const webhookUrl = `${publicUrl.replace(/\/$/, '')}/tg`;
        await telegramBot.api.setWebhook(webhookUrl);
        console.log("✅ Telegram webhook:", webhookUrl);
      } catch (error) {
        console.error("❌ Webhook failed, using polling:", error);
        await telegramBot.start();
        console.log("✅ Telegram polling");
      }
    } else {
      // Use polling in development
      await telegramBot.start();
      console.log("✅ Telegram polling");
    }
  }

  console.log("🎉 Both bots are ready!");
  return server;
}

start().catch(console.error);