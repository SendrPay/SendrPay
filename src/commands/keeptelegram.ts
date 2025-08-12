import { Context } from "grammy";
import { logger } from "../infra/logger.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function handleKeepTelegram(ctx: Context) {
  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) {
    return ctx.reply("❌ Could not identify your Telegram account.");
  }

  logger.info("Processing keeptelegram command", { telegramUserId } as any);

  try {
    // Find the pending merge record
    const mergeRecord = await prisma.linkCode.findFirst({
      where: {
        code: { startsWith: `MERGE_${telegramUserId}_` },
        platform: "merge",
        used: false,
        expiresAt: { gt: new Date() }
      }
    });

    if (!mergeRecord) {
      return ctx.reply("❌ No pending wallet merge found or link expired. Please start the linking process again with `/linkcode`.");
    }

    // Extract Discord user ID from the merge code
    const discordUserId = parseInt(mergeRecord.code.split('_')[2]);
    
    // Get both users and their wallets
    const [discordUser, telegramUser] = await Promise.all([
      prisma.user.findUnique({ 
        where: { id: discordUserId },
        include: { wallets: { where: { isActive: true } } }
      }),
      prisma.user.findUnique({ 
        where: { telegramId: telegramUserId.toString() },
        include: { wallets: { where: { isActive: true } } }
      })
    ]);

    if (!discordUser || !telegramUser) {
      return ctx.reply("❌ Could not find user accounts. Please try linking again.");
    }

    // Perform the wallet merge transaction
    await prisma.$transaction(async (tx) => {
      // Step 1: Deactivate Discord wallets (keep Telegram wallets)
      if (discordUser.wallets.length > 0) {
        await tx.wallet.updateMany({
          where: { 
            userId: discordUser.id,
            isActive: true
          },
          data: { isActive: false }
        });
      }

      // Step 2: Transfer Telegram wallets to Discord user
      if (telegramUser.wallets.length > 0) {
        await tx.wallet.updateMany({
          where: { userId: telegramUser.id },
          data: { userId: discordUser.id }
        });
      }

      // Step 3: Clear telegramId from existing telegram user to avoid constraint
      await tx.user.update({
        where: { id: telegramUser.id },
        data: { telegramId: null }
      });

      // Step 4: Link accounts by updating Discord user with telegramId
      await tx.user.update({
        where: { id: discordUser.id },
        data: { telegramId: telegramUserId.toString() }
      });

      // Step 5: Delete the old telegram user record
      await tx.user.delete({ where: { id: telegramUser.id } });

      // Step 6: Mark merge record as used
      await tx.linkCode.update({
        where: { id: mergeRecord.id },
        data: { used: true }
      });
    });

    logger.info("Successfully kept Telegram wallet", {
      discordUserId,
      telegramUserId,
      transferredTelegramWallets: telegramUser.wallets.length,
      deactivatedDiscordWallets: discordUser.wallets.length
    } as any);

    await ctx.reply(`✅ **Accounts linked successfully!**

**Kept Telegram wallet:** ${telegramUser.wallets[0]?.address || 'No wallet found'}
**Deactivated Discord wallet:** ${discordUser.wallets[0]?.address || 'No wallet found'}

Your Discord and Telegram accounts now share the same wallet. You can use wallet commands on both platforms.`, { parse_mode: "Markdown" });

  } catch (error) {
    logger.error("Error keeping Telegram wallet", { error: error.message, telegramUserId } as any);
    await ctx.reply("❌ Failed to complete wallet merge. Please try again or contact support.");
  }
}