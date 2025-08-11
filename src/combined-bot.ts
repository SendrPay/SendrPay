// Combined Discord + Telegram Bot (Webhook Mode for TG)
import "./infra/env";
import express from "express";
import { Bot, Context } from "grammy";
import { Client, GatewayIntentBits, Partials, Events } from "discord.js";
import { logger } from "./infra/logger";
import { env } from "./infra/env";
import { heliusWebhook } from "./routes/helius";

// Extend Telegram context with session data
interface SessionData {
  awaitingPrivateKey?: boolean;
  linkingPhantom?: boolean;
  phantomNonce?: string;
}

interface TelegramContext extends Context {
  session: SessionData;
}

const app = express();
app.use(express.json({ limit: "1mb" }));

// Health check
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    telegramBot: !!tgBot,
    discordBot: !!dcBot
  });
});

// Helius webhook
app.post("/webhooks/helius", heliusWebhook);

/* ---------------- TELEGRAM SETUP ---------------- */
const tgBot = env.BOT_TOKEN ? new Bot<TelegramContext>(env.BOT_TOKEN) : null;

if (tgBot) {
  // Add session middleware
  const { session } = await import('grammy');
  tgBot.use(session({
    initial: (): SessionData => ({})
  }));

  // Global error handling
  tgBot.catch((err: any) => {
    const error = err.error;
    const ctx = err.ctx;
    logger.error(`Telegram bot error: ${error instanceof Error ? error.message : String(error)}`);
    logger.error(`Error context - Update: ${ctx.update.update_id}, Chat: ${ctx.chat?.id}, User: ${ctx.from?.id}`);
  });

  // Import and setup Telegram commands
  const setupTelegramCommands = async () => {
    const { registerGroupRoutes, registerDMRoutes } = await import("./commands");
    
    registerGroupRoutes(tgBot as any);
    registerDMRoutes(tgBot as any);

    // Handle notification callbacks (reactions only)
    tgBot.on("callback_query", async (ctx) => {
      const data = ctx.callbackQuery?.data;
      if (!data) return;

      if (data.startsWith("react_")) {
        // Handle payment reactions
        const { handleReactionCallback } = await import("./core/notifications-simple");
        await handleReactionCallback(ctx);
      } else if (data === "already_reacted") {
        // Handle already reacted button
        const { handleAlreadyReacted } = await import("./core/notifications-simple");
        await handleAlreadyReacted(ctx);
      }
    });

    // Handle private key import in DMs
    tgBot.on("text", async (ctx) => {
      if (ctx.chat?.type === "private" && ctx.session.awaitingPrivateKey) {
        const { importWallet } = await import("./core/wallets");
        await importWallet(ctx as any, ctx.message.text);
      }
    });
  };

  setupTelegramCommands();

  // Telegram webhook route
  app.use("/tg", tgBot.webhookCallback("/tg"));
  logger.info("Telegram webhook configured at /tg");
}

/* ---------------- DISCORD SETUP ---------------- */
const dcBot = env.DISCORD_TOKEN ? new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
}) : null;

if (dcBot) {
  // Setup Discord bot with existing logic
  const setupDiscordBot = async () => {
    const { 
      getOrCreateUserByDiscordId, 
      lookupByHandle, 
      lookupAllPlatformsByHandle,
      lookupLocalMentionDiscord, 
      sendPayment, 
      createEscrowTagged,
      getBalances, 
      getDepositAddress, 
      withdraw, 
      getUserIdByPlatformId
    } = await import("./core/shared");

    const { consumeLinkCode, createLinkCode, linkPlatformAccounts } = await import("./core/link");
    const { parseTarget, Platform } = await import("./core/resolveTarget");

    dcBot.once(Events.ClientReady, () => {
      logger.info(`Discord bot logged in as ${dcBot.user?.tag}`);
    });

    // DM commands: "!link CODE" and "!import PRIVATE_KEY"
    dcBot.on(Events.MessageCreate, async (msg) => {
      if (msg.author.bot || msg.guild) return;
      
      // Handle !import command
      const importMatch = msg.content.trim().match(/^!import\s+(.+)$/i);
      if (importMatch) {
        try {
          const user = await getOrCreateUserByDiscordId(msg.author.id);
          const { importWallet } = await import("./core/wallets");
          
          // Create a mock context for importWallet
          const mockCtx = {
            reply: async (content: any) => {
              await msg.reply(typeof content === 'string' ? content : content.content || 'Wallet imported!');
            },
            from: { id: msg.author.id }
          };
          
          await importWallet(mockCtx as any, importMatch[1]);
          
          // Delete the message containing the private key for security
          try {
            await msg.delete();
          } catch (error) {
            logger.error("Could not delete private key message:", error);
          }
          
          return;
        } catch (error) {
          logger.error("Error importing wallet:", error);
          await msg.reply("❌ Failed to import wallet. Please check your private key format.");
          return;
        }
      }
      
      const m = msg.content.trim().match(/^!link\s+([A-Z0-9]+)$/i);
      if (!m) return;
      
      try {
        const linkData = await consumeLinkCode(m[1]);
        if (!linkData) {
          return void msg.reply("❌ Invalid or expired code.");
        }
        
        await linkPlatformAccounts(linkData.userId, msg.author.id);
        await msg.reply("✅ Account linked successfully! Your wallets are now connected across platforms.");
      } catch (error) {
        logger.error("Discord link error:", error);
        await msg.reply("❌ Failed to link account. Please try again.");
      }
    });

    // Handle slash commands and interactions (existing Discord bot logic would go here)
    dcBot.on(Events.InteractionCreate, async (interaction) => {
      try {
        // Import and handle Discord interactions
        if (interaction.isChatInputCommand()) {
          // Handle slash commands
          const commandHandlers = {
            'start': async () => {
              const { handleDiscordStart } = await import("./core/discord-commands");
              return handleDiscordStart(interaction);
            },
            'pay': async () => {
              const { handleDiscordPay } = await import("./core/discord-commands");
              return handleDiscordPay(interaction);
            },
            'tip': async () => {
              const { handleDiscordTip } = await import("./core/discord-commands");
              return handleDiscordTip(interaction);
            },
            'balance': async () => {
              const { handleDiscordBalance } = await import("./core/discord-commands");
              return handleDiscordBalance(interaction);
            },
            'deposit': async () => {
              const { handleDiscordDeposit } = await import("./core/discord-commands");
              return handleDiscordDeposit(interaction);
            },
            'withdraw': async () => {
              const { handleDiscordWithdraw } = await import("./core/discord-commands");
              return handleDiscordWithdraw(interaction);
            },
            'linktelegram': async () => {
              const { handleDiscordLinkTelegram } = await import("./core/discord-commands");
              return handleDiscordLinkTelegram(interaction);
            }
          };

          const handler = commandHandlers[interaction.commandName as keyof typeof commandHandlers];
          if (handler) {
            await handler();
          }
        } else if (interaction.isButton()) {
          // Handle button interactions
          const { handleDiscordButtonInteraction } = await import("./core/discord-commands");
          await handleDiscordButtonInteraction(interaction);
        }
      } catch (error) {
        logger.error("Error handling Discord interaction:", error);
        if (interaction.isRepliable()) {
          await interaction.reply({ content: "❌ An error occurred. Please try again.", ephemeral: true });
        }
      }
    });
  };

  setupDiscordBot();
}

/* ---------------- SERVER START ---------------- */
const PORT = env.PORT || 5000;

app.get("/", (req, res) => res.send("SendrPay Bot is running"));

app.listen(PORT, "0.0.0.0", async () => {
  logger.info(`HTTP server listening on port ${PORT}`);
  
  // Set Telegram webhook
  if (tgBot && env.APP_BASE_URL) {
    try {
      const webhookUrl = `${env.APP_BASE_URL}/tg`;
      await tgBot.telegram.setWebhook(webhookUrl);
      logger.info(`Telegram webhook set to: ${webhookUrl}`);
    } catch (error) {
      logger.error("Failed to set Telegram webhook:", error);
    }
  } else if (tgBot) {
    logger.warn("APP_BASE_URL not set, cannot configure Telegram webhook");
  }
  
  // Start Discord bot
  if (dcBot && env.DISCORD_TOKEN) {
    try {
      await dcBot.login(env.DISCORD_TOKEN);
      logger.info("Discord bot logged in successfully");
    } catch (error) {
      logger.error("Failed to start Discord bot:", error);
    }
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  
  if (tgBot) {
    try {
      await tgBot.telegram.deleteWebhook();
      logger.info('Telegram webhook cleared');
    } catch (error) {
      logger.error('Failed to clear webhook:', error);
    }
  }
  
  if (dcBot) {
    dcBot.destroy();
    logger.info('Discord bot disconnected');
  }
  
  process.exit(0);
});

// Export for external use
export { tgBot, dcBot, app };