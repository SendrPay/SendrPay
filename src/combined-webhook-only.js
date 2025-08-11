// Combined Discord + Telegram Bot (Webhook Mode for TG)
require("dotenv").config();
const express = require("express");
const { Bot } = require("grammy");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
app.use(express.json({ limit: "1mb" }));

/* ---------------- TELEGRAM SETUP ---------------- */
const tgBot = process.env.TG_BOT_TOKEN ? new Bot(process.env.TG_BOT_TOKEN) : null;

if (tgBot) {
  // Telegram webhook route - handle updates manually
  app.post("/tg", async (req, res) => {
    try {
      // Handle the update without starting the bot in polling mode
      const update = req.body;
      
      if (update.message) {
        const message = update.message;
        const text = message.text || '';
        const chatId = message.chat.id;
        
        let responseText = '';
        
        if (text.startsWith('/start')) {
          responseText = 'Welcome to SendrPay! You\'re on Telegram in webhook mode.';
        } else if (text.startsWith('/pay')) {
          responseText = 'Processing payment...';
        } else if (text.startsWith('/balance')) {
          responseText = 'Your balance: 0.00 SOL';
        } else if (text.startsWith('/deposit')) {
          responseText = 'Deposit address: [YOUR_WALLET_ADDRESS]';
        }
        
        if (responseText) {
          await tgBot.api.sendMessage(chatId, responseText);
        }
      }
      
      res.status(200).send('OK');
    } catch (error) {
      console.error('Telegram webhook error:', error);
      res.status(200).send('OK'); // Always return 200 to Telegram
    }
  });
  
  console.log('Telegram bot configured for webhook mode');
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

  dcBot.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    
    try {
      if (message.content.startsWith("!pay")) {
        await message.reply("Processing Discord payment...");
      } else if (message.content.startsWith("!balance")) {
        await message.reply("Your balance: 0.00 SOL");
      } else if (message.content.startsWith("!deposit")) {
        await message.reply("Deposit address: [YOUR_WALLET_ADDRESS]");
      }
    } catch (error) {
      console.error('Discord message error:', error);
    }
  });

  // Handle Discord slash command interactions
  dcBot.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
      switch (interaction.commandName) {
        case 'start':
          await interaction.reply({ 
            content: 'Welcome to SendrPay! Your secure Solana payment bot is ready.', 
            ephemeral: true 
          });
          break;
        case 'pay':
          await interaction.reply({ 
            content: 'Processing payment... (Demo mode)', 
            ephemeral: true 
          });
          break;
        case 'balance':
          await interaction.reply({ 
            content: 'Your balance: 0.00 SOL', 
            ephemeral: true 
          });
          break;
        case 'deposit':
          await interaction.reply({ 
            content: 'Deposit address: [YOUR_WALLET_ADDRESS]', 
            ephemeral: true 
          });
          break;
        default:
          await interaction.reply({ 
            content: 'Command not recognized.', 
            ephemeral: true 
          });
      }
    } catch (error) {
      console.error('Discord interaction error:', error);
      if (!interaction.replied) {
        await interaction.reply({ 
          content: 'An error occurred processing your command.', 
          ephemeral: true 
        });
      }
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
      // First clear any existing webhook
      await tgBot.api.deleteWebhook({ drop_pending_updates: true });
      console.log('Cleared existing webhook');
      
      // Wait a moment then set new webhook
      await new Promise(resolve => setTimeout(resolve, 1000));
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