import {
  Client, 
  GatewayIntentBits, 
  Partials, 
  Events,
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder
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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.once(Events.ClientReady, () => {
  console.log(`Discord logged in as ${client.user?.tag}`);
});

// DM "!link CODE"
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || msg.guild) return;
  
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

    if (i.commandName === "start") {
      console.log("Processing /start command");
      try {
        await i.reply({ 
          ephemeral: true, 
          content: "Welcome to **SendrPay** on Discord.\nUse `/pay`, `/tip`, `/balance`, `/deposit`, `/withdraw`.\nLink Telegram with `/linktelegram` if you want cross-platform." 
        });
        console.log("Successfully replied to /start command");
      } catch (error) {
        console.error("Error replying to /start command:", error);
      }
    }

    if (i.commandName === "linktelegram") {
      try {
        const user = await getOrCreateUserByDiscordId(i.user.id);
        const code = createLinkCode(user.id, "discord");
        
        await i.reply({ 
          ephemeral: true, 
          content: `Link Telegram:\n1) Open @SendrPayBot\n2) Run \`/linkcode ${code}\`\nThis connects both to ONE wallet.` 
        });
      } catch (error) {
        console.error("Error creating link code:", error);
        await i.reply({
          ephemeral: true,
          content: "❌ Something went wrong creating your link code."
        });
      }
    }

    if (i.commandName === "balance") {
      try {
        const me = await getOrCreateUserByDiscordId(i.user.id);
        const b = await getBalances(me.id);
        
        await i.reply({ 
          ephemeral: true, 
          content: `Balances:\n• SOL: ${b.SOL}\n• USDC: ${b.USDC}` 
        });
      } catch (error) {
        console.error("Error getting balance:", error);
        await i.reply({
          ephemeral: true,
          content: "❌ Could not retrieve your balance."
        });
      }
    }

    if (i.commandName === "deposit") {
      try {
        const me = await getOrCreateUserByDiscordId(i.user.id);
        const token = i.options.getString("token") || undefined;
        const addr = await getDepositAddress(me.id, token);
        
        await i.reply({ 
          ephemeral: true, 
          content: `Deposit address${token ? ` for ${token}` : ""}: \`${addr}\`` 
        });
      } catch (error) {
        console.error("Error getting deposit address:", error);
        await i.reply({
          ephemeral: true,
          content: "❌ Could not retrieve your deposit address."
        });
      }
    }

    if (i.commandName === "withdraw") {
      try {
        const me = await getOrCreateUserByDiscordId(i.user.id);
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
        const me = await getOrCreateUserByDiscordId(i.user.id);
        const targetStr = i.options.getString("target", true);
        const amount = i.options.getString("amount", true);
        const token = i.options.getString("token", true);
        const note = i.options.getString("note") || "";

        // Resolve target: current platform default (discord)
        const mentionHit = await lookupLocalMentionDiscord(targetStr, i);
        if (mentionHit) {
          const toUserId = await getUserIdByPlatformId("discord", mentionHit.platformId);
          
          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`pay:yes:${targetStr}:${amount}:${token}`)
              .setStyle(ButtonStyle.Success)
              .setLabel("Confirm"),
            new ButtonBuilder()
              .setCustomId("pay:no")
              .setStyle(ButtonStyle.Secondary)
              .setLabel("Cancel")
          );
          
          return void i.reply({ 
            ephemeral: true, 
            content: `Confirm payment?\nTo: ${targetStr}\nAmount: ${amount} ${token}${note ? `\nNote: ${note}` : ""}`, 
            components: [row] 
          });
        }

        // Cross-platform/unknown → simple escrow demo
        await createEscrowTagged({ 
          platform: "discord", 
          handle: targetStr.replace(/^@/, ""), 
          amount, 
          token 
        });
        
        return void i.reply({ 
          ephemeral: true, 
          content: `⏳ Reserved ${amount} ${token} for ${targetStr}. They can claim after onboarding.` 
        });
      } catch (error) {
        console.error("Error processing payment:", error);
        await i.reply({
          ephemeral: true,
          content: "❌ Could not process your payment."
        });
      }
    }
  } catch (error) {
    console.error("Error handling interaction:", error);
  }
});

// Login to Discord with your client's token
client.login(process.env.DISCORD_BOT_TOKEN!);