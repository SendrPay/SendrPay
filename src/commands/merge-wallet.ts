import { logger } from "../infra/logger";
import type { BotContext } from "../bot";
import { prisma } from "../infra/prisma";

export async function commandKeepDiscord(ctx: BotContext) {
  if (ctx.chat?.type !== "private") {
    return ctx.reply("❌ This command only works in DM for security reasons.");
  }

  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) {
    return ctx.reply("❌ Could not identify your Telegram account.");
  }

  await handleWalletMerge(ctx, telegramUserId, "discord");
}

export async function commandKeepTelegram(ctx: BotContext) {
  if (ctx.chat?.type !== "private") {
    return ctx.reply("❌ This command only works in DM for security reasons.");
  }

  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) {
    return ctx.reply("❌ Could not identify your Telegram account.");
  }

  await handleWalletMerge(ctx, telegramUserId, "telegram");
}

async function handleWalletMerge(ctx: BotContext, telegramUserId: number, keepPlatform: "discord" | "telegram") {
  try {
    // Find pending merge record
    const mergeCode = `MERGE_${telegramUserId}_`;
    const mergeRecord = await prisma.linkCode.findFirst({
      where: { 
        code: { startsWith: mergeCode },
        platform: "merge",
        used: false
      },
      include: { user: true }
    });

    if (!mergeRecord) {
      return ctx.reply("❌ No pending wallet merge found. Please start the linking process again with `/linkcode`.");
    }

    // Extract Discord user ID from the merge code
    const discordUserId = parseInt(mergeRecord.code.split('_')[2]);
    
    // Get both users with their wallets
    const telegramUser = await prisma.user.findFirst({
      where: { telegramId: telegramUserId.toString() },
      include: { wallets: { where: { isActive: true } } }
    });

    const discordUser = await prisma.user.findFirst({
      where: { id: discordUserId },
      include: { wallets: { where: { isActive: true } } }
    });

    if (!telegramUser) {
      return ctx.reply("❌ Could not find your Telegram account.");
    }

    if (!discordUser) {
      return ctx.reply("❌ Could not find the Discord account to link with.");
    }

    // Use database transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      if (keepPlatform === "discord") {
        // Keep Discord wallet, deactivate Telegram wallet
        if (telegramUser.wallets.length > 0) {
          await tx.wallet.updateMany({
            where: { userId: telegramUser.id },
            data: { isActive: false }
          });
        }

        // Link Telegram user ID to Discord account
        await tx.user.update({
          where: { id: discordUserId },
          data: { telegramId: telegramUserId.toString() }
        });

        // Delete separate Telegram user record if different from Discord user
        if (telegramUser.id !== discordUserId) {
          await tx.user.delete({ where: { id: telegramUser.id } });
        }

      } else {
        // Keep Telegram wallet, deactivate Discord wallet
        if (discordUser.wallets.length > 0) {
          await tx.wallet.updateMany({
            where: { userId: discordUserId },
            data: { isActive: false }
          });
        }

        // Transfer Telegram user's wallets to Discord user record  
        if (telegramUser.wallets.length > 0) {
          await tx.wallet.updateMany({
            where: { userId: telegramUser.id },
            data: { userId: discordUserId }
          });
        }

        // Link Telegram ID to Discord user
        await tx.user.update({
          where: { id: discordUserId },
          data: { telegramId: telegramUserId.toString() }
        });

        // Delete the separate Telegram user record if different
        if (telegramUser.id !== discordUserId) {
          await tx.user.delete({ where: { id: telegramUser.id } });
        }
      }

      // Mark merge code as used
      await tx.linkCode.update({
        where: { id: mergeRecord.id },
        data: { used: true }
      });
    });

    const keptWallet = keepPlatform === "discord" ? 
      (discordUser.wallets[0]?.address || "Discord wallet") :
      (telegramUser.wallets[0]?.address || "Telegram wallet");

    await ctx.reply(`✅ **Accounts Successfully Linked!**

**${keepPlatform === "discord" ? "Discord" : "Telegram"} wallet kept** - Your ${keepPlatform === "discord" ? "Telegram" : "Discord"} wallet has been deactivated.

**Active wallet:** \`${keptWallet}\`

**What you can now do:**
• Send payments between Discord and Telegram users
• Use the same balance across both platforms
• Manage your wallet from either app

Cross-platform SendrPay is ready! 🚀`, { parse_mode: "Markdown" });

    logger.info("Wallet merge completed", {
      telegramUserId,
      discordUserId,
      keptPlatform: keepPlatform,
      keptWallet
    } as any);

  } catch (error) {
    logger.error("Error merging wallets:", error);
    await ctx.reply("❌ Something went wrong merging your wallets. Please try again.");
  }
}