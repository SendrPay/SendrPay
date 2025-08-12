import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { PrismaClient } from "@prisma/client";
import { resolveUserCrossPlatform } from "../core/cross-platform-resolver";
import { resolveToken } from "../core/tokens";
import { calculateFee } from "../core/fees";
import { executeTransfer } from "../core/transfer";
import { logger } from "../infra/logger";
import { v4 as uuidv4 } from "uuid";
import { generateClientIntentId } from "../core/idempotency";

const prisma = new PrismaClient();

export async function handleDiscordPay(interaction: ChatInputCommandInteraction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const targetUser = interaction.options.getString("user", true);
    const amount = interaction.options.getNumber("amount", true);
    const tokenTicker = interaction.options.getString("token") || "USDC";
    const note = interaction.options.getString("note");

    // Parse target user and platform
    let targetHandle: string;
    let targetPlatform: "telegram" | "discord" | null = null;

    if (targetUser.includes(':')) {
      const [platform, handle] = targetUser.split(':');
      const platformLower = platform.toLowerCase();
      
      if (platformLower === 'discord' || platformLower === 'dc') {
        targetPlatform = 'discord';
        targetHandle = handle.replace('@', '').toLowerCase();
      } else if (platformLower === 'telegram' || platformLower === 'tg') {
        targetPlatform = 'telegram';
        targetHandle = handle.replace('@', '').toLowerCase();
      } else {
        return interaction.editReply({
          content: "❌ Invalid platform. Use `discord:username` or `telegram:username`"
        });
      }
    } else {
      targetHandle = targetUser.replace('@', '').toLowerCase();
    }

    // Resolve token
    const token = await resolveToken(tokenTicker);
    if (!token) {
      return interaction.editReply({
        content: `❌ Unknown token: ${tokenTicker}`
      });
    }

    // Convert amount to raw units
    const amountRaw = BigInt(Math.floor(amount * (10 ** token.decimals)));
    if (amountRaw <= 0n) {
      return interaction.editReply({
        content: "❌ Amount must be positive."
      });
    }

    // Get payer (Discord user)
    const payer = await prisma.user.findUnique({
      where: { discordId: interaction.user.id },
      include: { wallets: { where: { isActive: true } } }
    });

    if (!payer || !payer.wallets[0]) {
      return interaction.editReply({
        content: "❌ Create wallet first with `/start`"
      });
    }

    // Cross-platform user resolution
    const resolvedPayee = await resolveUserCrossPlatform(targetHandle, targetPlatform, "discord");
    
    if (!resolvedPayee) {
      if (targetPlatform) {
        return interaction.editReply({
          content: `❌ User @${targetHandle} not found on ${targetPlatform}. They need to start the bot to register.`
        });
      } else {
        return interaction.editReply({
          content: `❌ User @${targetHandle} not found. They need to start the bot to register their username.`
        });
      }
    }

    // Get full payee details
    const payee = await prisma.user.findUnique({
      where: { id: resolvedPayee.id },
      include: { wallets: { where: { isActive: true } } }
    });

    if (!payee || !payee.wallets[0]) {
      return interaction.editReply({
        content: `❌ User @${targetHandle} needs to create a wallet first.`
      });
    }

    // Calculate fees
    const feeCalc = await calculateFee(amountRaw, token.mint);
    const totalCost = amountRaw + feeCalc.feeRaw + feeCalc.serviceFeeRaw;

    // Show platform info if cross-platform payment
    let platformInfo = "";
    if (targetPlatform && targetPlatform !== "discord") {
      platformInfo = ` (${targetPlatform} user)`;
    }

    // Create confirmation embed
    const embed = new EmbedBuilder()
      .setTitle("💸 Payment Confirmation")
      .setColor(0x00ff00)
      .addFields(
        { name: "Recipient", value: `@${targetHandle}${platformInfo}`, inline: true },
        { name: "Amount", value: `${amount} ${token.ticker}`, inline: true },
        { name: "Network Fee", value: `${Number(feeCalc.feeRaw) / (10 ** token.decimals)} ${token.ticker}`, inline: true },
        { name: "Service Fee", value: `${Number(feeCalc.serviceFeeRaw) / (10 ** token.decimals)} ${feeCalc.serviceFeeToken}`, inline: true },
        { name: "Total Cost", value: `${Number(totalCost) / (10 ** token.decimals)} ${token.ticker}`, inline: true }
      );

    if (note) {
      embed.addFields({ name: "Note", value: note });
    }

    await interaction.editReply({
      content: "✅ Cross-platform payment ready! Click **Confirm** to send.",
      embeds: [embed],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 3,
              label: "Confirm Payment",
              custom_id: `confirm_pay_${interaction.user.id}_${Date.now()}`
            },
            {
              type: 2,
              style: 4,
              label: "Cancel",
              custom_id: "cancel_pay"
            }
          ]
        }
      ]
    });

    // Store payment data for confirmation
    // In a real implementation, you'd store this temporarily in Redis or database
    // For now, we'll use the custom_id to encode basic info

  } catch (error) {
    logger.error("Discord pay error", { error: error.message } as any);
    if (interaction.deferred) {
      await interaction.editReply({
        content: "❌ Payment failed. Please try again."
      });
    } else {
      await interaction.reply({
        content: "❌ Payment failed. Please try again.",
        ephemeral: true
      });
    }
  }
}