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
        platform: "merge"
      },
      include: { user: true }
    });

    if (!mergeRecord) {
      return ctx.reply("❌ No pending wallet merge found. Please start the linking process again with `/linkcode`.");
    }

    // Extract Discord user ID from the merge code
    const discordUserId = parseInt(mergeRecord.code.split('_')[2]);
    
    // Get both users
    const telegramUser = await prisma.user.findFirst({
      where: { telegramId: telegramUserId.toString() }
    });

    if (!telegramUser) {
      return ctx.reply("❌ Could not find your Telegram account.");
    }

    if (keepPlatform === "discord") {
      // Keep Discord wallet, deactivate Telegram wallet
      await prisma.wallet.updateMany({
        where: { userId: telegramUser.id },
        data: { isActive: false }
      });

      // Link Telegram user to Discord account
      await prisma.user.update({
        where: { id: discordUserId },
        data: { telegramId: telegramUserId.toString() }
      });

      // Delete separate Telegram user record
      await prisma.user.delete({ where: { id: telegramUser.id } });

      await ctx.reply(`✅ **Accounts Successfully Linked!**

**Discord wallet kept** - Your Telegram wallet has been deactivated.

Your Discord and Telegram accounts now share the Discord wallet.

**What you can now do:**
• Send payments between Discord and Telegram users
• Use the same balance across both platforms
• Manage your wallet from either app

Cross-platform SendrPay is ready! 🚀`, { parse_mode: "Markdown" });

    } else {
      // Keep Telegram wallet, deactivate Discord wallet
      await prisma.wallet.updateMany({
        where: { userId: discordUserId },
        data: { isActive: false }
      });

      // Link Discord user to point to this Telegram user's ID
      await prisma.user.update({
        where: { id: discordUserId },
        data: { telegramId: telegramUserId.toString() }
      });

      // Transfer Telegram user's wallets to Discord user record  
      await prisma.wallet.updateMany({
        where: { userId: telegramUser.id },
        data: { userId: discordUserId }
      });

      // Delete the separate Telegram user record
      await prisma.user.delete({ where: { id: telegramUser.id } });

      await ctx.reply(`✅ **Accounts Successfully Linked!**

**Telegram wallet kept** - Your Discord wallet has been deactivated.

Your Discord and Telegram accounts now share the Telegram wallet.

**What you can now do:**
• Send payments between Discord and Telegram users
• Use the same balance across both platforms
• Manage your wallet from either app

Cross-platform SendrPay is ready! 🚀`, { parse_mode: "Markdown" });
    }

    // Clean up the merge record
    await prisma.linkCode.delete({ where: { id: mergeRecord.id } });

    logger.info("Wallet merge completed", {
      telegramUserId,
      discordUserId,
      keptPlatform: keepPlatform
    } as any);

  } catch (error) {
    logger.error("Error merging wallets:", error);
    await ctx.reply("❌ Something went wrong merging your wallets. Please try again.");
  }
}