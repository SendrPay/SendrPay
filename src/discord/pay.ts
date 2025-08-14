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
    console.log("🚀 Discord Pay Command Started");
    console.log("User:", interaction.user.username);
    console.log("Guild:", interaction.guild?.name || "DM");
    
    await interaction.deferReply({ ephemeral: true });

    const targetUser = interaction.options.getString("target", true);
    const amount = parseFloat(interaction.options.getString("amount", true));
    const tokenTicker = interaction.options.getString("token") || "USDC";
    const note = interaction.options.getString("note");
    
    console.log("📝 Payment Parameters:");
    console.log("- Target User:", targetUser);
    console.log("- Amount:", amount);
    console.log("- Token:", tokenTicker);
    console.log("- Note:", note || "none");

    // Parse target user and platform
    console.log("🔍 Parsing target user...");
    let targetHandle: string;
    let targetPlatform: "telegram" | "discord" | null = null;

    if (targetUser.includes(':')) {
      const [platform, handle] = targetUser.split(':');
      const platformLower = platform.toLowerCase();
      console.log("Cross-platform payment detected:", platform, "->", handle);
      
      if (platformLower === 'discord' || platformLower === 'dc') {
        targetPlatform = 'discord';
        targetHandle = handle.replace('@', '').toLowerCase();
      } else if (platformLower === 'telegram' || platformLower === 'tg') {
        targetPlatform = 'telegram';
        targetHandle = handle.replace('@', '').toLowerCase();
      } else {
        console.log("❌ Invalid platform specified:", platform);
        return interaction.editReply({
          content: "❌ Invalid platform. Use `discord:username` or `telegram:username`"
        });
      }
    } else {
      targetHandle = targetUser.replace('@', '').toLowerCase();
    }
    
    console.log("✅ Parsed target:", { targetHandle, targetPlatform });

    // Resolve token
    console.log("🪙 Resolving token:", tokenTicker);
    const token = await resolveToken(tokenTicker);
    if (!token) {
      console.log("❌ Token resolution failed for:", tokenTicker);
      return interaction.editReply({
        content: `❌ Unknown token: ${tokenTicker}`
      });
    }
    console.log("✅ Token resolved:", token.ticker, "Decimals:", token.decimals);

    // Convert amount to raw units
    const amountRaw = BigInt(Math.floor(amount * (10 ** token.decimals)));
    if (amountRaw <= 0n) {
      return interaction.editReply({
        content: "❌ Amount must be positive."
      });
    }

    // Get payer (Discord user)
    console.log("👤 Finding payer Discord user:", interaction.user.id);
    const payer = await prisma.user.findUnique({
      where: { discordId: interaction.user.id },
      include: { wallets: { where: { isActive: true } } }
    });

    if (!payer || !payer.wallets[0]) {
      console.log("❌ Payer not found or no wallet. Payer exists:", !!payer, "Has wallet:", !!payer?.wallets[0]);
      return interaction.editReply({
        content: "❌ Create wallet first with `/start`"
      });
    }
    console.log("✅ Payer found:", payer.handle, "Wallet:", payer.wallets[0].address.slice(0, 8) + "...");

    // Cross-platform user resolution
    console.log("🔍 Resolving payee across platforms...");
    const resolvedPayee = await resolveUserCrossPlatform(targetHandle, targetPlatform, "discord");
    
    if (!resolvedPayee) {
      console.log("❌ Payee resolution failed for:", targetHandle, "on platform:", targetPlatform);
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
    console.log("✅ Payee resolved:", resolvedPayee.handle, "Platform:", resolvedPayee.platform, "ID:", resolvedPayee.id);

    // Get full payee details
    console.log("💰 Fetching payee wallet details...");
    const payee = await prisma.user.findUnique({
      where: { id: resolvedPayee.id },
      include: { wallets: { where: { isActive: true } } }
    });

    if (!payee || !payee.wallets[0]) {
      console.log("❌ Payee wallet not found. User exists:", !!payee, "Has wallet:", !!payee?.wallets[0]);
      return interaction.editReply({
        content: `❌ User @${targetHandle} needs to create a wallet first.`
      });
    }
    console.log("✅ Payee wallet found:", payee.wallets[0].address.slice(0, 8) + "...");

    // Calculate fees
    console.log("💸 Calculating fees for amount:", amountRaw.toString(), "Token:", token.mint);
    const feeCalc = await calculateFee(amountRaw, token.mint);
    const totalCost = amountRaw + feeCalc.feeRaw + feeCalc.serviceFeeRaw;
    console.log("✅ Fees calculated - Network fee:", feeCalc.feeRaw.toString(), "Service fee:", feeCalc.serviceFeeRaw.toString(), "Total cost:", totalCost.toString());

    // Show platform info if cross-platform payment
    let platformInfo = "";
    if (targetPlatform && targetPlatform !== "discord") {
      platformInfo = ` (${targetPlatform} user)`;
    }

    // Store payment data for confirmation
    console.log("💾 Storing payment data for confirmation...");
    const { storePendingPayment } = await import("./payment-storage");
    const paymentId = `${interaction.user.id}_${Date.now()}`;
    
    const paymentData = {
      userId: interaction.user.id,
      targetHandle,
      targetPlatform,
      amount,
      token: token.ticker,
      note: note || undefined,
      resolvedPayeeId: resolvedPayee.id,
      timestamp: Date.now()
    };
    
    storePendingPayment(paymentId, paymentData);
    console.log("✅ Payment data stored with ID:", paymentId);

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

    console.log("📤 Sending confirmation dialog...");
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
              custom_id: `confirm_pay_${paymentId}`
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
    console.log("✅ Payment confirmation dialog sent successfully");

  } catch (error) {
    console.error("💥 DISCORD PAY ERROR:", error);
    logger.error("Discord pay error", { error: error.message } as any);
    
    try {
      if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({
          content: `❌ Payment failed: ${error.message}`
        });
      } else if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: `❌ Payment failed: ${error.message}`,
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error("❌ Failed to send error reply:", replyError.message);
    }
  }
}