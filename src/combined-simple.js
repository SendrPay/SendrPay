// Combined Discord + Telegram Bot (Webhook Mode for TG)
// Install: npm install telegraf discord.js express dotenv

require("dotenv").config();
const express = require("express");
const { Bot } = require("grammy");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
app.use(express.json({ limit: "1mb" }));

/* ---------------- TELEGRAM SETUP ---------------- */
const tgBot = process.env.BOT_TOKEN ? new Bot(process.env.BOT_TOKEN) : null;

if (tgBot) {
  // Telegram webhook route
  app.use("/tg", (req, res, next) => {
    tgBot.handleUpdate(req.body, res);
  });

  // Example Telegram commands
  tgBot.start((ctx) => ctx.reply("Welcome to SendrPay! You're on Telegram in webhook mode."));
  tgBot.command("pay", (ctx) => ctx.reply("Processing payment..."));
  tgBot.command("balance", (ctx) => ctx.reply("Your balance: 0.00 SOL"));
  tgBot.command("deposit", (ctx) => ctx.reply("Deposit address: [YOUR_WALLET_ADDRESS]"));
}

/* ---------------- DISCORD SETUP ---------------- */
const dcBot = process.env.DISCORD_TOKEN ? new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ] 
}) : null;

if (dcBot) {
  dcBot.once("ready", () => {
    console.log(`Discord bot logged in as ${dcBot.user?.tag}`);
  });

  dcBot.on("messageCreate", (message) => {
    if (message.author.bot) return;
    
    if (message.content.startsWith("!pay")) {
      message.reply("Processing Discord payment...");
    } else if (message.content.startsWith("!balance")) {
      message.reply("Your balance: 0.00 SOL");
    } else if (message.content.startsWith("!deposit")) {
      message.reply("Deposit address: [YOUR_WALLET_ADDRESS]");
    }
  });
}

/* ---------------- SERVER START ---------------- */
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("SendrPay Bot is running"));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    telegramBot: !!tgBot,
    discordBot: !!dcBot
  });
});

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`Server running on port ${PORT}`);
  
  // Set TG webhook when server starts
  if (tgBot && process.env.PUBLIC_URL) {
    try {
      await tgBot.api.setWebhook(`${process.env.PUBLIC_URL}/tg`);
      console.log(`Telegram webhook set to: ${process.env.PUBLIC_URL}/tg`);
    } catch (error) {
      console.error("Failed to set Telegram webhook:", error);
    }
  }
  
  // Start Discord bot
  if (dcBot && process.env.DISCORD_TOKEN) {
    try {
      await dcBot.login(process.env.DISCORD_TOKEN);
      console.log("Discord bot started successfully");
    } catch (error) {
      console.error("Failed to start Discord bot:", error);
    }
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  
  if (tgBot) {
    try {
      await tgBot.api.deleteWebhook();
      console.log('Telegram webhook cleared');
    } catch (error) {
      console.error('Failed to clear webhook:', error);
    }
  }
  
  if (dcBot) {
    dcBot.destroy();
    console.log('Discord bot disconnected');
  }
  
  process.exit(0);
});