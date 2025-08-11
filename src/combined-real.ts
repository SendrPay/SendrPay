import "./infra/env";
import { Bot } from "grammy";
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import express from "express";
import { env } from "./infra/env";
import { logger } from "./infra/logger";
import { getOrCreateUserByDiscordId, getOrCreateUserByTelegramId, getBalances, getDepositAddress, createLinkCode, consumeLinkCode } from "./core/shared";
import { generateWallet } from "./core/wallets";

const TG_BOT_TOKEN = env.TG_BOT_TOKEN;
const DISCORD_TOKEN = env.DISCORD_TOKEN;
const PUBLIC_URL = env.PUBLIC_URL;

async function startCombinedBot() {
  console.log('Starting combined bot with full TypeScript integration...');

  /* ---------------- TELEGRAM SETUP ---------------- */
  let tgBot = null;
  
  if (TG_BOT_TOKEN) {
    tgBot = new Bot(TG_BOT_TOKEN);
    
    // Error handling
    tgBot.catch((err) => {
      console.error(`Telegram bot error: ${err.error}`);
    });

    // Essential Telegram commands with real blockchain integration
    tgBot.command("start", async (ctx) => {
      if (ctx.chat?.type !== "private") {
        return ctx.reply("Use /start in DM to begin setup.");
      }

      // Create sophisticated welcome message with real functionality
      const { InlineKeyboard } = await import("grammy");
      
      const keyboard = new InlineKeyboard()
        .text("✨ Create New Wallet", "generate_wallet")
        .row()
        .text("🔑 Import Existing Wallet", "import_wallet")
        .row()
        .text("🔗 Link Discord Account", "link_discord");

      const welcomeText = `✨ **Welcome to SendrPay**

Send crypto payments instantly on Telegram

**What you can do:**
• Send payments to any user
• Tip users in group chats
• Track all transactions
• Secure wallet management
• Cross-platform payments with Discord

**Getting started:**
Choose how to set up your wallet`;

      await ctx.reply(welcomeText, { 
        reply_markup: keyboard,
        parse_mode: "Markdown" 
      });
    });

    // Balance command with real blockchain data
    tgBot.command("balance", async (ctx) => {
      if (!ctx.from?.id) return ctx.reply("❌ Could not identify user.");

      try {
        const user = await getOrCreateUserByTelegramId(ctx.from.id.toString());
        const balances = await getBalances(user.id);
        
        let balanceText = '💰 **Your Balances**\n\n';
        if (balances && balances.length > 0) {
          balanceText += balances.map(b => `• ${b.amount} ${b.token}`).join('\n');
        } else {
          balanceText += '• 0.00 SOL\n• 0 USDC\n• 0 BONK\n\n_Add funds using /deposit_';
        }
        
        await ctx.reply(balanceText, { parse_mode: "Markdown" });
      } catch (error) {
        logger.error("Balance command error:", error);
        await ctx.reply("❌ Error checking balance. Please try again.");
      }
    });

    // Deposit command with real addresses
    tgBot.command("deposit", async (ctx) => {
      if (!ctx.from?.id) return ctx.reply("❌ Could not identify user.");

      try {
        const user = await getOrCreateUserByTelegramId(ctx.from.id.toString());
        const address = await getDepositAddress(user.id);
        
        await ctx.reply(`📥 **Deposit Address**

\`${address}\`

Send SOL or SPL tokens to this address.`, { parse_mode: "Markdown" });
      } catch (error) {
        logger.error("Deposit command error:", error);
        await ctx.reply("❌ Error getting deposit address. Use /start to set up your wallet first.");
      }
    });

    // Link code generation for Discord linking
    tgBot.command("linkcode", async (ctx) => {
      if (!ctx.from?.id) return ctx.reply("❌ Could not identify user.");

      try {
        const user = await getOrCreateUserByTelegramId(ctx.from.id.toString());
        const linkCode = await createLinkCode(user.id, "telegram_to_discord");
        
        await ctx.reply(`🔗 **Account Linking Code**

Your code: \`${linkCode}\`

Use this code in Discord with \`/linktelegram ${linkCode}\`

_Code expires in 10 minutes_`, { parse_mode: "Markdown" });
      } catch (error) {
        logger.error("Link code error:", error);
        await ctx.reply("❌ Error creating link code. Please try again.");
      }
    });

    // Handle callback queries (button interactions)
    tgBot.on("callback_query:data", async (ctx) => {
      const data = ctx.callbackQuery.data;
      if (!data) return;

      await ctx.answerCallbackQuery();

      if (data === "generate_wallet") {
        try {
          // Call real wallet generation directly
          await generateWallet(ctx);
        } catch (error) {
          console.error('Wallet generation failed:', error);
          await ctx.reply("❌ Error generating wallet. Please try again.");
        }
      }
      
      if (data === "link_discord") {
        if (!ctx.from?.id) return ctx.reply("❌ Could not identify user.");

        try {
          const user = await getOrCreateUserByTelegramId(ctx.from.id.toString());
          const linkCode = await createLinkCode(user.id, "telegram_to_discord");
          
          await ctx.reply(`🔗 **Link Discord Account**

Your code: \`${linkCode}\`

Go to Discord and use: \`/linktelegram ${linkCode}\`

_Code expires in 10 minutes_`, { parse_mode: "Markdown" });
        } catch (error) {
          logger.error("Discord link error:", error);
          await ctx.reply("❌ Error creating link code. Please try again.");
        }
      }
    });

    console.log('Telegram bot configured with real functionality');
  }

  /* ---------------- DISCORD SETUP ---------------- */
  let discordClient = null;
  
  if (DISCORD_TOKEN) {
    discordClient = new Client({ 
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] 
    });

    discordClient.once('ready', () => {
      console.log(`Discord logged in as ${discordClient.user?.tag}`);
      console.log('Discord bot started successfully');
    });

    // Handle slash command interactions
    discordClient.on('interactionCreate', async (interaction) => {
      console.log('Received interaction:', interaction.isCommand() ? interaction.commandName : interaction.customId);

      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "start") {
          console.log('Processing /start command');
          
          const embed = {
            title: "✨ Welcome to SendrPay",
            description: "Send crypto payments instantly on Discord & Telegram\n\n**What you can do:**\n• Send payments to any user\n• Tip users in servers\n• Track all transactions\n• Cross-platform payments with Telegram\n\n**Getting started:**\nChoose how to set up your wallet",
            color: 0x5865F2
          };

          const row = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId('setup:new')
                .setLabel('✨ Create New Wallet')
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId('setup:import') 
                .setLabel('🔑 Import Existing Wallet')
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId('setup:link')
                .setLabel('🔗 Link Telegram Account')
                .setStyle(ButtonStyle.Success)
            );

          await interaction.reply({
            flags: 64,
            embeds: [embed],
            components: [row]
          });
          return;
        }

        if (interaction.commandName === "balance") {
          await interaction.deferReply({ flags: 64 });
          
          try {
            const user = await getOrCreateUserByDiscordId(interaction.user.id);
            const balances = await getBalances(user.id);
            
            let balanceText = '💰 **Your Balances**\n\n';
            if (balances && balances.length > 0) {
              balanceText += balances.map(b => `• ${b.amount} ${b.token}`).join('\n');
            } else {
              balanceText += '• 0.00 SOL\n• 0 USDC\n• 0 BONK\n\n_Add funds using /deposit_';
            }
            
            await interaction.editReply(balanceText);
          } catch (error) {
            logger.error('Discord balance error:', error);
            await interaction.editReply('❌ Error checking balance. Use /start to set up your wallet.');
          }
        }

        if (interaction.commandName === "deposit") {
          await interaction.deferReply({ flags: 64 });
          
          try {
            const user = await getOrCreateUserByDiscordId(interaction.user.id);
            const address = await getDepositAddress(user.id);
            
            await interaction.editReply(`📥 **Deposit Address**

\`${address}\`

Send SOL or SPL tokens to this address.`);
          } catch (error) {
            logger.error('Discord deposit error:', error);
            await interaction.editReply('❌ Error getting deposit address. Use /start to set up your wallet first.');
          }
        }

        if (interaction.commandName === "linktelegram") {
          const code = interaction.options.getString('code');
          
          if (!code) {
            await interaction.reply({
              flags: 64,
              content: '❌ Please provide a link code from Telegram'
            });
            return;
          }

          await interaction.deferReply({ flags: 64 });

          try {
            const discordUser = await getOrCreateUserByDiscordId(interaction.user.id);
            await consumeLinkCode(code, discordUser.id);
            
            await interaction.editReply('✅ **Account Linked Successfully!**\n\nYour Discord and Telegram accounts now share the same wallet.');
          } catch (error) {
            logger.error('Discord link error:', error);
            await interaction.editReply('❌ Invalid or expired link code. Generate a new one in Telegram with /linkcode');
          }
        }
      }

      // Handle button interactions
      if (interaction.isButton()) {
        if (interaction.customId.startsWith("setup:")) {
          const setupType = interaction.customId.split(":")[1];
          
          if (setupType === "new") {
            await interaction.deferReply({ flags: 64 });
            
            try {
              const user = await getOrCreateUserByDiscordId(interaction.user.id);
              
              // Create mock context for wallet generation
              const mockCtx = {
                from: { id: interaction.user.id, username: interaction.user.username || null },
                reply: async (text, opts) => {
                  await interaction.editReply(text);
                  return { message_id: 1 };
                }
              };
              
              await generateWallet(mockCtx);
            } catch (error) {
              logger.error('Discord wallet generation error:', error);
              await interaction.editReply('❌ Error generating wallet. Please try again.');
            }
            return;
          }

          if (setupType === "link") {
            try {
              const user = await getOrCreateUserByDiscordId(interaction.user.id);
              const linkCode = await createLinkCode(user.id, "discord_to_telegram");
              
              await interaction.reply({
                flags: 64,
                content: `🔗 **Link Telegram Account**

Your code: \`${linkCode}\`

Go to Telegram and use: \`/linkcode ${linkCode}\`

_Code expires in 10 minutes_`
              });
            } catch (error) {
              logger.error('Discord link code error:', error);
              await interaction.reply({
                flags: 64,
                content: '❌ Error creating link code. Please try again.'
              });
            }
            return;
          }
        }
      }
    });

    await discordClient.login(DISCORD_TOKEN);
    console.log('Discord bot configured with real functionality');
  }

  /* ---------------- EXPRESS SERVER ---------------- */
  const app = express();
  app.use(express.json());

  // Health check
  app.get("/health", (req, res) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      telegram: !!tgBot,
      discord: !!discordClient
    });
  });

  // Telegram webhook endpoint
  if (tgBot && PUBLIC_URL) {
    app.use(`/tg`, async (req, res, next) => {
      try {
        await tgBot.handleUpdate(req.body);
        res.ok();
      } catch (error) {
        console.error('Telegram webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
      }
    });
  }

  const port = process.env.PORT || 3000;
  app.listen(port, "0.0.0.0", async () => {
    console.log(`Server running on port ${port}`);
    
    // Set up Telegram webhook
    if (tgBot && PUBLIC_URL) {
      try {
        await tgBot.api.deleteWebhook();
        console.log('Cleared existing webhook');
        
        const webhookUrl = `${PUBLIC_URL}/tg`;
        await tgBot.api.setWebhook(webhookUrl);
        console.log(`Telegram webhook set to: ${webhookUrl}`);
      } catch (error) {
        console.error('Failed to set webhook:', error);
      }
    }
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('🔄 Shutting down gracefully...');
    if (discordClient) {
      await discordClient.destroy();
    }
    if (tgBot) {
      await tgBot.api.deleteWebhook();
    }
    process.exit(0);
  });
}

startCombinedBot().catch(error => {
  console.error('Failed to start combined bot:', error);
  process.exit(1);
});