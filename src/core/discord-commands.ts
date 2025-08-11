// Discord command handlers for combined bot
import { 
  ChatInputCommandInteraction, 
  ButtonInteraction, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} from "discord.js";
import { 
  getOrCreateUserByDiscordId,
  getBalances,
  getDepositAddress,
  withdraw,
  sendPayment,
  lookupByHandle
} from "./shared";
import { createLinkCode } from "./link";
import { parseTarget } from "./resolveTarget";
import { logger } from "../infra/logger";

export async function handleDiscordStart(interaction: ChatInputCommandInteraction) {
  try {
    const user = await getOrCreateUserByDiscordId(interaction.user.id);
    
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("Welcome to SendrPay!")
      .setDescription("Your secure Solana payment bot")
      .addFields(
        { name: "Get Started", value: "Use `/balance` to check your wallet\nUse `/deposit` to add funds\nUse `/pay` to send payments", inline: false },
        { name: "Cross-Platform", value: "Link your Telegram account with `/linktelegram`", inline: false }
      )
      .setFooter({ text: "SendrPay - Powered by Solana" });

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('wallet_info')
          .setLabel('View Wallet')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('help')
          .setLabel('Help')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  } catch (error) {
    logger.error("Discord start command error:", error);
    await interaction.reply({ content: "❌ An error occurred. Please try again.", ephemeral: true });
  }
}

export async function handleDiscordPay(interaction: ChatInputCommandInteraction) {
  try {
    const target = interaction.options.getString('target', true);
    const amount = interaction.options.getNumber('amount', true);
    const token = interaction.options.getString('token') || 'SOL';
    const note = interaction.options.getString('note');

    const user = await getOrCreateUserByDiscordId(interaction.user.id);
    
    // Parse target to determine platform and recipient
    const parsedTarget = await parseTarget(target);
    if (!parsedTarget) {
      await interaction.reply({ content: "❌ Could not find recipient. Please check the username.", ephemeral: true });
      return;
    }

    // Mock context for sendPayment function
    const mockCtx = {
      from: { id: interaction.user.id },
      chat: { id: interaction.guildId || interaction.user.id },
      reply: async (content: any) => {
        if (interaction.deferred) {
          await interaction.editReply(typeof content === 'string' ? content : content.content);
        } else {
          await interaction.reply(typeof content === 'string' ? content : content.content);
        }
      }
    };

    await interaction.deferReply();
    // For now, provide a simplified payment response
    await interaction.editReply("⏳ Payment processing... (Demo mode)");

  } catch (error) {
    logger.error("Discord pay command error:", error);
    const errorMsg = "❌ Payment failed. Please try again.";
    if (interaction.deferred) {
      await interaction.editReply(errorMsg);
    } else {
      await interaction.reply({ content: errorMsg, ephemeral: true });
    }
  }
}

export async function handleDiscordTip(interaction: ChatInputCommandInteraction) {
  try {
    const target = interaction.options.getString('target', true);
    const amount = interaction.options.getNumber('amount', true);
    const token = interaction.options.getString('token') || 'SOL';

    const user = await getOrCreateUserByDiscordId(interaction.user.id);
    
    // Mock context for tip function
    const mockCtx = {
      from: { id: interaction.user.id },
      chat: { id: interaction.guildId || interaction.user.id },
      reply: async (content: any) => {
        if (interaction.deferred) {
          await interaction.editReply(typeof content === 'string' ? content : content.content);
        } else {
          await interaction.reply(typeof content === 'string' ? content : content.content);
        }
      }
    };

    await interaction.deferReply();
    
    // For now, provide a simplified tip response
    await interaction.editReply("⏳ Tip processing... (Demo mode)");

  } catch (error) {
    logger.error("Discord tip command error:", error);
    const errorMsg = "❌ Tip failed. Please try again.";
    if (interaction.deferred) {
      await interaction.editReply(errorMsg);
    } else {
      await interaction.reply({ content: errorMsg, ephemeral: true });
    }
  }
}

export async function handleDiscordBalance(interaction: ChatInputCommandInteraction) {
  try {
    const user = await getOrCreateUserByDiscordId(interaction.user.id);
    const balances = await getBalances(user.id);

    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle("💰 Your Balance")
      .setDescription("Current wallet balances");

    if (typeof balances === 'object' && balances) {
      const entries = Object.entries(balances);
      if (entries.length === 0) {
        embed.addFields({ name: "Empty Wallet", value: "No tokens found. Use `/deposit` to add funds.", inline: false });
      } else {
        for (const [symbol, balance] of entries) {
          embed.addFields({
            name: symbol,
            value: `${balance} ${symbol}`,
            inline: true
          });
        }
      }
    } else {
      embed.addFields({ name: "Empty Wallet", value: "No tokens found. Use `/deposit` to add funds.", inline: false });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    logger.error("Discord balance command error:", error);
    await interaction.reply({ content: "❌ Failed to get balance. Please try again.", ephemeral: true });
  }
}

export async function handleDiscordDeposit(interaction: ChatInputCommandInteraction) {
  try {
    const user = await getOrCreateUserByDiscordId(interaction.user.id);
    const address = await getDepositAddress(user.id);

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("📥 Deposit Address")
      .setDescription("Send funds to this address")
      .addFields(
        { name: "Wallet Address", value: `\`${address}\``, inline: false },
        { name: "Network", value: "Solana Devnet", inline: true },
        { name: "Supported Tokens", value: "SOL, USDC, BONK, JUP", inline: true }
      )
      .setFooter({ text: "Only send tokens to this address on Solana Devnet" });

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('copy_address')
          .setLabel('Copy Address')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  } catch (error) {
    logger.error("Discord deposit command error:", error);
    await interaction.reply({ content: "❌ Failed to get deposit address. Please try again.", ephemeral: true });
  }
}

export async function handleDiscordWithdraw(interaction: ChatInputCommandInteraction) {
  try {
    const address = interaction.options.getString('address', true);
    const amount = interaction.options.getNumber('amount', true);
    const token = interaction.options.getString('token') || 'SOL';

    const user = await getOrCreateUserByDiscordId(interaction.user.id);

    // Mock context for withdraw function
    const mockCtx = {
      from: { id: interaction.user.id },
      reply: async (content: any) => {
        if (interaction.deferred) {
          await interaction.editReply(typeof content === 'string' ? content : content.content);
        } else {
          await interaction.reply(typeof content === 'string' ? content : content.content);
        }
      }
    };

    await interaction.deferReply({ ephemeral: true });
    // For now, provide a simplified withdrawal response
    await interaction.editReply("⏳ Withdrawal processing... (Demo mode)");

  } catch (error) {
    logger.error("Discord withdraw command error:", error);
    const errorMsg = "❌ Withdrawal failed. Please try again.";
    if (interaction.deferred) {
      await interaction.editReply(errorMsg);
    } else {
      await interaction.reply({ content: errorMsg, ephemeral: true });
    }
  }
}

export async function handleDiscordLinkTelegram(interaction: ChatInputCommandInteraction) {
  try {
    const user = await getOrCreateUserByDiscordId(interaction.user.id);
    const linkCode = await createLinkCode(user.id, "discord");

    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle("🔗 Link Telegram Account")
      .setDescription("Use this code to link your Telegram account")
      .addFields(
        { name: "Step 1", value: "Copy the code below", inline: false },
        { name: "Step 2", value: "Send `/linkcode` to @SendrPayBot on Telegram", inline: false },
        { name: "Step 3", value: "Paste the code when prompted", inline: false },
        { name: "Link Code", value: `\`${linkCode}\``, inline: false }
      )
      .setFooter({ text: "Code expires in 10 minutes" });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    logger.error("Discord link telegram command error:", error);
    await interaction.reply({ content: "❌ Failed to generate link code. Please try again.", ephemeral: true });
  }
}

export async function handleDiscordButtonInteraction(interaction: ButtonInteraction) {
  try {
    switch (interaction.customId) {
      case 'wallet_info':
        await handleWalletInfo(interaction);
        break;
      case 'help':
        await handleHelp(interaction);
        break;
      case 'copy_address':
        await interaction.reply({ content: "📋 Address copied! (Use Ctrl+C on desktop)", ephemeral: true });
        break;
      default:
        await interaction.reply({ content: "❌ Unknown button action.", ephemeral: true });
    }
  } catch (error) {
    logger.error("Discord button interaction error:", error);
    await interaction.reply({ content: "❌ Button action failed.", ephemeral: true });
  }
}

async function handleWalletInfo(interaction: ButtonInteraction) {
  const user = await getOrCreateUserByDiscordId(interaction.user.id);
  const address = await getDepositAddress(user.id);
  const balances = await getBalances(user.id);

  const embed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("👛 Wallet Information")
    .addFields(
      { name: "Address", value: `\`${address}\``, inline: false },
      { name: "Network", value: "Solana Devnet", inline: true },
      { name: "Status", value: "Active", inline: true }
    );

  if (typeof balances === 'object' && balances) {
    const entries = Object.entries(balances);
    if (entries.length > 0) {
      const balanceText = entries.map(([symbol, balance]) => `${balance} ${symbol}`).join('\n');
      embed.addFields({ name: "Balances", value: balanceText, inline: false });
    } else {
      embed.addFields({ name: "Balances", value: "Empty", inline: false });
    }
  } else {
    embed.addFields({ name: "Balances", value: "Empty", inline: false });
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleHelp(interaction: ButtonInteraction) {
  const embed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("📚 SendrPay Help")
    .setDescription("Available commands and features")
    .addFields(
      { name: "/start", value: "Get started with SendrPay", inline: true },
      { name: "/balance", value: "Check your wallet balance", inline: true },
      { name: "/deposit", value: "Get your deposit address", inline: true },
      { name: "/pay <user> <amount>", value: "Send payment to user", inline: true },
      { name: "/tip <user> <amount>", value: "Send a tip to user", inline: true },
      { name: "/withdraw <address> <amount>", value: "Withdraw to external wallet", inline: true },
      { name: "/linktelegram", value: "Link your Telegram account", inline: true },
      { name: "Cross-Platform", value: "Send payments between Discord and Telegram", inline: false }
    )
    .setFooter({ text: "Need more help? Contact support" });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}