import {
  Client, 
  GatewayIntentBits, 
  Partials, 
  Events,
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder,
  MessageFlags
} from "discord.js";

import { parseTarget, Platform } from "../core/resolveTarget.js";
import {
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
} from "../core/shared.js";

import { consumeLinkCode, createLinkCode, linkPlatformAccounts } from "../core/link.js";
import { prisma } from "../infra/prisma.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel],
  // Add connection resilience settings
  closeTimeout: 5000,
  waitGuildTimeout: 15000
});

client.once(Events.ClientReady, () => {
  console.log(`Discord logged in as ${client.user?.tag}`);
});

// Add connection management events
client.on('disconnect', () => {
  console.log('Discord bot disconnected');
});

client.on('warn', (info) => {
  console.warn('Discord bot warning:', info);
});

client.on('error', (error) => {
  console.error('Discord bot error:', error);
  // Don't exit process - let it attempt to reconnect
});

client.on('debug', (info) => {
  // Only log important debug info to avoid spam
  if (info.includes('heartbeat') || info.includes('session') || info.includes('gateway')) {
    console.debug('Discord debug:', info);
  }
});

// DM commands: "!link CODE" and "!import PRIVATE_KEY"
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || msg.guild) return;
  
  // Handle !import command
  const importMatch = msg.content.trim().match(/^!import\s+(.+)$/i);
  if (importMatch) {
    try {
      const user = await getOrCreateUserByDiscordId(msg.author.id);
      const { importWallet } = await import("../core/wallets");
      
      // Create a compatible context for importWallet
      const importCtx = {
        reply: async (content: any) => {
          await msg.reply(typeof content === 'string' ? content : content.content || 'Wallet imported!');
        },
        from: { id: msg.author.id }
      };
      
      await importWallet(importCtx as any, importMatch[1]);
      
      // Delete the message containing the private key for security
      try {
        await msg.delete();
      } catch (error) {
        console.error("Could not delete private key message:", error);
      }
      
      return;
    } catch (error) {
      console.error("Error importing wallet:", error);
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
    
    // Link Discord account to existing user
    await linkPlatformAccounts(linkData.userId, msg.author.id);
    
    await msg.reply("✅ Linked! Your Discord & Telegram now share one SendrPay wallet.");
  } catch (error) {
    console.error("Error linking accounts:", error);
    await msg.reply("❌ Something went wrong linking your accounts.");
  }
});

client.on(Events.InteractionCreate, async (i) => {
  if (!i.isChatInputCommand() && !i.isButton()) return;

  console.log(`Received interaction: ${i.isChatInputCommand() ? i.commandName : i.customId}`);

  try {
    if (i.isButton()) {
      // Handle setup buttons from /start command
      if (i.customId.startsWith("setup:")) {
        const setupType = i.customId.split(":")[1];
        
        if (setupType === "new") {
          // Immediately acknowledge the interaction to prevent timeout
          try {
            await i.reply({ 
              ephemeral: true, 
              content: "🔄 Generating your wallet..." 
            });
          } catch (error) {
            console.error("Failed to reply to interaction:", error);
            return;
          }
          
          // Now do the heavy operations after the reply
          try {
            const user = await getOrCreateUserByDiscordId(i.user.id);
            const { Keypair } = await import("@solana/web3.js");
            const { encryptPrivateKey } = await import("../core/wallets");
            const { prisma } = await import("../infra/prisma");
            const { env } = await import("../infra/env");
            const bs58 = await import("bs58");
            
            // Generate new keypair
            const keypair = Keypair.generate();
            const privateKeyBytes = keypair.secretKey;
            const publicKey = keypair.publicKey.toBase58();

            // Encrypt private key
            const encryptedKey = encryptPrivateKey(privateKeyBytes, env.MASTER_KMS_KEY);

            // Save wallet
            await prisma.wallet.create({
              data: {
                userId: user.id,
                label: "custodial",
                address: publicKey,
                encPrivKey: encryptedKey,
                isActive: true
              }
            });

            // Deactivate other wallets for this user
            await prisma.wallet.updateMany({
              where: { 
                userId: user.id,
                address: { not: publicKey }
              },
              data: { isActive: false }
            });

            const walletText = `✨ **Wallet Generated!**

**Address:** \`${publicKey.slice(0, 8)}...${publicKey.slice(-4)}\`

🔑 **Private Key** (save this securely):
\`${bs58.default.encode(privateKeyBytes)}\`

**Important:**
• Save your private key - shown only once
• Keep it private and secure
• Anyone with this key controls your wallet

Ready for payments!`;

            await i.editReply(walletText);
          } catch (error) {
            console.error('Error generating Discord wallet:', error);
            try {
              await i.editReply('❌ Error generating wallet. Please try again.');
            } catch (editError) {
              console.error('Failed to edit reply:', editError);
            }
          }
          return;
        }
        
        if (setupType === "import") {
          await i.reply({
            ephemeral: true,
            content: `🔑 **Import Existing Wallet**

To import your wallet:
1. Send me a DM with your private key
2. Use the format: \`!import <your-private-key>\`

**Supported formats:**
• Base58 string
• JSON array

**Security Note:**
Only import keys you control. Your private key will be encrypted and stored securely.`
          });
          return;
        }
        
        if (setupType === "link") {
          // Link Telegram account
          const user = await getOrCreateUserByDiscordId(i.user.id);
          const code = createLinkCode(user.id, "discord");
          
          await i.reply({
            ephemeral: true,
            content: `🔗 **Link Telegram Account**

**Step 1:** Open @SendrPayBot on Telegram
**Step 2:** Use the command: \`/linkcode ${code}\`

This code expires in 10 minutes. After linking, you'll have one shared wallet across both platforms!`
          });
          return;
        }
      }
      
      if (i.customId.startsWith("pay:yes:")) {
        const [, , target, amount, token] = i.customId.split(":");
        const me = await getOrCreateUserByDiscordId(i.user.id);
        
        // For demo, assume recipient exists by platformId lookup later
        const tx = await sendPayment({ 
          fromUserId: me.id, 
          toUserId: 2, // Demo recipient 
          amount, 
          token 
        });
        
        return void i.update({ 
          content: `✅ Sent ${amount} ${token} to ${target}\nTx: ${tx.tx}`, 
          components: [] 
        });
      }
      
      if (i.customId === "pay:no") {
        return void i.update({ content: "❌ Cancelled.", components: [] });
      }
      
      return;
    }

    if (i.commandName === "help") {
      const helpEmbed = {
        title: "SendrPay - Solana Payments Made Easy",
        description: `**Getting Started**
/start - Begin using SendrPay and set up your wallet
/help - Show this help message

**Wallet Management**  
/balance - View your wallet balances and transaction history
/deposit - Get your wallet address to receive funds
/withdraw - Withdraw funds to an external wallet

**Account Linking**
Link your Discord and Telegram accounts to share one wallet:
1. Use \`/linktelegram\` in Discord to get a link code
2. Use \`/linkcode YOUR_CODE\` in Telegram DM
3. Choose which wallet to keep if both accounts have wallets

**Payments**
/pay @user amount [token] [note] - Send crypto to another user
Examples:
• \`/pay @username 10 SOL lunch money\`
• \`/pay telegram:vi100x 5 USDC\` (cross-platform)
• \`/pay discord:crumvi 0.1 SOL great work!\`

**Transaction History**
/history - View your recent transactions

**Supported Tokens**
• SOL - Solana
• USDC - USD Coin  
• BONK - Bonk
• JUP - Jupiter

**Cross-Platform Features**
• Send payments between Discord and Telegram users
• Share one wallet across both platforms
• Automatic username resolution

*SendrPay operates on Solana devnet for testing*`,
        color: 0x0099ff,
        footer: { text: "Need help? Contact support" }
      };
      
      await i.reply({ embeds: [helpEmbed], ephemeral: true });
      return;
    }

    if (i.commandName === "history") {
      try {
        const user = await getOrCreateUserByDiscordId(i.user.id);
        const { commandHistory } = await import("../commands/history");
        
        // Create compatible context for history command
        const historyCtx = {
          from: { id: i.user.id, username: "discord_context" },
          reply: async (content: any) => {
            const text = typeof content === 'string' ? content : content.content;
            await i.reply({ content: text, ephemeral: true });
          },
          chat: { type: "private" }
        };

        await commandHistory(historyCtx as any);
      } catch (error) {
        console.error("Error processing history:", error);
        await i.reply({
          ephemeral: true,
          content: "❌ Could not retrieve your transaction history."
        });
      }
      return;
    }

    if (i.commandName === "start") {
      try {
        const user = await getOrCreateUserByDiscordId(i.user.id, i.user.username);
        
        // Check if user already has a wallet using the wallets from the user query
        let existingWallet = user.wallets && user.wallets.length > 0 ? user.wallets[0] : null;
        
        // Double-check with direct query if not found in user.wallets
        if (!existingWallet) {
          existingWallet = await prisma.wallet.findFirst({
            where: { 
              userId: user.id,
              isActive: true 
            }
          });
        }

        if (existingWallet) {
          // Show available commands for existing users
          await i.reply({
            ephemeral: true,
            content: `✅ **Welcome back to SendrPay!**

Your wallet is ready to use.

**Available commands:**
• \`/balance\` - Check your balances
• \`/pay @user 0.1 SOL\` - Send payments
• \`/tip 1 BONK\` - Tip users
• \`/deposit\` - Get deposit address
• \`/withdraw 0.5 SOL <address>\` - Withdraw funds
• \`/linktelegram\` - Link with Telegram account

Start sending crypto payments! 🚀`
          });
          return;
        }

        // New user onboarding with three options
        const embed = {
          title: "✨ Welcome to SendrPay",
          description: "Send crypto payments instantly on Discord\n\n**What you can do:**\n• Send payments to any user\n• Tip users in servers\n• Track all transactions\n• Secure wallet management\n• Cross-platform payments with Telegram",
          color: 0x00ff88,
          fields: [
            {
              name: "🆕 Create New Wallet",
              value: "Generate a fresh custodial wallet managed by SendrPay",
              inline: false
            },
            {
              name: "🔑 Import Existing Wallet",
              value: "Import your own private key for non-custodial management",
              inline: false
            },
            {
              name: "🔗 Link Telegram Account",
              value: "Already have SendrPay on Telegram? Share one wallet across both platforms",
              inline: false
            }
          ]
        };

        const buttons = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('setup:new')
              .setLabel('✨ Create New Wallet')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('setup:import')
              .setLabel('🔑 Import Wallet')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('setup:link')
              .setLabel('🔗 Link Telegram')
              .setStyle(ButtonStyle.Success)
          );

        await i.reply({
          ephemeral: true,
          embeds: [embed],
          components: [buttons]
        });
        
        console.log("Successfully replied to /start command");
      } catch (error) {
        console.error("Error replying to /start command:", error);
        if (!i.replied && !i.deferred) {
          await i.reply({
            ephemeral: true,
            content: "❌ Something went wrong. Please try again."
          });
        }
      }
    }

    if (i.commandName === "linktelegram") {
      try {
        const user = await getOrCreateUserByDiscordId(i.user.id, i.user.username);
        const code = createLinkCode(user.id, "discord");
        
        await i.reply({ 
          ephemeral: true, 
          content: `🔗 **Link Telegram Account**

**Step 1:** Open @SendrPayBot on Telegram
**Step 2:** Use the command: \`/linkcode ${code}\`

This code expires in 10 minutes. After linking, you'll have one shared wallet across both Discord and Telegram platforms!

**Benefits of linking:**
• Send cross-platform payments (Discord ↔ Telegram)  
• Unified balance and transaction history
• One wallet to manage across both platforms` 
        });
      } catch (error) {
        console.error("Error creating link code:", error);
        if (!i.replied && !i.deferred) {
          await i.reply({
            ephemeral: true,
            content: "❌ Something went wrong creating your link code."
          });
        }
      }
    }

    if (i.commandName === "balance") {
      console.log(`[BALANCE DEBUG] Command triggered for user: ${i.user.id}`);
      try {
        const user = await getOrCreateUserByDiscordId(i.user.id, i.user.username);
        console.log(`[BALANCE DEBUG] User retrieved:`, { id: user.id, walletsLength: user.wallets?.length });
        
        // Check if user has a wallet using the same logic as /start
        let existingWallet = user.wallets && user.wallets.length > 0 ? user.wallets[0] : null;
        console.log(`[BALANCE DEBUG] Initial wallet check:`, !!existingWallet);
        if (!existingWallet) {
          console.log(`[BALANCE DEBUG] No wallet in user.wallets, checking direct query...`);
          existingWallet = await prisma.wallet.findFirst({
            where: { 
              userId: user.id,
              isActive: true 
            }
          });
          console.log(`[BALANCE DEBUG] Direct query result:`, !!existingWallet);
        }

        if (!existingWallet) {
          console.log(`[BALANCE DEBUG] No wallet found - sending error message`);
          return i.reply({
            content: "❌ You need to create a wallet first. Use /start to set up your wallet.",
            ephemeral: true
          });
        }
        console.log(`[BALANCE DEBUG] Wallet found - proceeding with balance check`);

        // Get balances directly using the Discord-compatible method
        const { getBalances } = await import("../core/shared");
        const balances = await getBalances(user.id);
        
        let balanceText = "💰 **Your Wallet Balance**\n\n";
        
        if (!balances || Object.keys(balances).length === 0) {
          balanceText += "No tokens found. Use `/deposit` to add funds.\n\n";
        } else {
          for (const [symbol, balance] of Object.entries(balances)) {
            balanceText += `• **${symbol}**: ${balance}\n`;
          }
        }
        
        balanceText += `\nWallet: \`${existingWallet.address}\``;
        
        await i.reply({ content: balanceText, ephemeral: true });
      } catch (error) {
        console.error("Error getting balance:", error);
        await i.reply({ 
          content: "❌ Could not retrieve your wallet balance. Please try again.", 
          ephemeral: true 
        });
      }
    }

    if (i.commandName === "deposit") {
      try {
        const user = await getOrCreateUserByDiscordId(i.user.id, i.user.username);
        
        // Check if user has a wallet using the same logic as /start
        let existingWallet = user.wallets && user.wallets.length > 0 ? user.wallets[0] : null;
        if (!existingWallet) {
          existingWallet = await prisma.wallet.findFirst({
            where: { 
              userId: user.id,
              isActive: true 
            }
          });
        }

        if (!existingWallet) {
          return i.reply({
            content: "❌ You need to create a wallet first. Use /start to set up your wallet.",
            ephemeral: true
          });
        }

        const walletAddress = existingWallet.address;
        const shortAddress = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-6)}`;
        
        const depositMessage = `📥 **Deposit Address**

**Send any supported token to this address:**
\`${walletAddress}\`

**Supported Tokens:**
• SOL (Solana)
• USDC (USD Coin)  
• BONK (Bonk)
• JUP (Jupiter)

**Important Notes:**
⚠️ Only send tokens on Solana devnet
⚠️ Do not send mainnet tokens - they will be lost
⚠️ Ensure you're using the correct network

**How to Send:**
1. Copy the address above
2. Use any Solana wallet (Phantom, Solflare, etc.)
3. Send tokens to this address
4. Check \`/balance\` to see your funds

**Need Test Tokens?**
Visit Solana Faucet for free devnet SOL:
https://faucet.solana.com

*Your wallet: ${shortAddress}*`;

        await i.reply({ content: depositMessage, ephemeral: true });
      } catch (error) {
        console.error("Error getting deposit address:", error);
        await i.reply({
          ephemeral: true,
          content: "❌ Could not retrieve your deposit address. Please try again."
        });
      }
    }

    if (i.commandName === "withdraw") {
      try {
        const me = await getOrCreateUserByDiscordId(i.user.id, i.user.username);
        const amount = i.options.getString("amount", true);
        const token = i.options.getString("token", true);
        const address = i.options.getString("address", true);
        
        const tx = await withdraw(me.id, amount, token, address);
        
        await i.reply({ 
          ephemeral: true, 
          content: `✅ Withdrawal submitted.\nTx: ${tx.tx}` 
        });
      } catch (error) {
        console.error("Error processing withdrawal:", error);
        await i.reply({
          ephemeral: true,
          content: "❌ Could not process your withdrawal."
        });
      }
    }

    if (i.commandName === "pay") {
      try {
        const me = await getOrCreateUserByDiscordId(i.user.id, i.user.username);
        const targetStr = i.options.getString("target", true);
        const amount = i.options.getString("amount", true);
        const token = i.options.getString("token", true);
        const note = i.options.getString("note") || "";

        // Defer the interaction to prevent timeout
        await i.deferReply({ ephemeral: true });

        // Use the original cross-platform payment system
        const { commandPay } = await import("../commands/pay.js");
        
        // Create a compatible context for the payment command
        const paymentCtx = {
          message: {
            text: `/pay ${targetStr} ${amount} ${token}${note ? ` ${note}` : ""}`,
            from: { id: parseInt(i.user.id) }
          },
          from: { id: parseInt(i.user.id), username: "discord_context" },
          reply: async (content: any) => {
            const text = typeof content === 'string' ? content : content.content;
            await i.editReply({ content: text });
          },
          chat: { type: "private" }
        };

        await commandPay(paymentCtx as any);

      } catch (error) {
        console.error("Error processing payment:", error);
        await i.editReply({ content: `❌ Payment failed: ${error.message}` });
      }
    }
  } catch (error) {
    console.error("Error handling interaction:", error);
  }
});

export { client };