import { logger } from "../infra/logger";
import type { BotContext } from "../bot";
import { prisma } from "../infra/prisma";

export async function commandLinkcode(ctx: BotContext) {
  logger.info("Linkcode command triggered", { 
    chatType: ctx.chat?.type,
    messageText: ctx.message?.text,
    userId: ctx.from?.id 
  } as any);

  if (ctx.chat?.type !== "private") {
    return ctx.reply("❌ This command only works in DM for security reasons.");
  }

  const args = ctx.message?.text?.split(" ");
  logger.info("Linkcode args parsed", { args } as any);
  
  if (!args || args.length !== 2) {
    return ctx.reply("❌ Please provide a link code.\n\nUsage: `/linkcode A28D6531`", { parse_mode: "Markdown" });
  }

  const linkCode = args[1];
  const telegramUserId = ctx.from?.id;

  logger.info("Linkcode processing started", { linkCode, telegramUserId } as any);

  if (!telegramUserId) {
    return ctx.reply("❌ Could not identify your Telegram account.");
  }

  try {
    logger.info("Processing linkcode command", { 
      linkCode, 
      telegramUserId,
      username: ctx.from?.username 
    } as any);

    // Find the link code in the database
    const linkRecord = await prisma.linkCode.findUnique({
      where: { code: linkCode },
      include: { user: true }
    });

    logger.info("Link record lookup result", { 
      found: !!linkRecord,
      linkCode,
      recordId: linkRecord?.id 
    } as any);

    if (!linkRecord) {
      return ctx.reply("❌ Invalid or expired link code.\n\nPlease generate a new code from Discord using `/linktelegram`.");
    }

    // Check if code is expired (valid for 10 minutes)
    const now = new Date();
    const codeAge = now.getTime() - linkRecord.createdAt.getTime();
    if (codeAge > 10 * 60 * 1000) { // 10 minutes
      await prisma.linkCode.delete({ where: { id: linkRecord.id } });
      return ctx.reply("❌ Link code has expired.\n\nPlease generate a new code from Discord using `/linktelegram`.");
    }

    // Check if this is for Discord linking
    if (linkRecord.platform !== "discord") {
      return ctx.reply("❌ This link code is not for Discord linking.");
    }

    // Get the existing Telegram user (don't create duplicate)
    const telegramUser = await prisma.user.findUnique({
      where: { telegramId: telegramUserId.toString() }
    });

    if (!telegramUser) {
      // Create new Telegram user only if none exists
      const newTelegramUser = await prisma.user.create({
        data: {
          telegramId: telegramUserId.toString(),
          handle: ctx.from?.username || null
        }
      });
      
      logger.info("Created new Telegram user", { id: newTelegramUser.id } as any);
    } else {
      // Update existing user handle if needed
      if (ctx.from?.username && telegramUser.handle !== ctx.from.username) {
        await prisma.user.update({
          where: { id: telegramUser.id },
          data: { handle: ctx.from.username }
        });
      }
    }

    // Get the final telegram user
    const finalTelegramUser = telegramUser || await prisma.user.findUnique({
      where: { telegramId: telegramUserId.toString() }
    });

    if (!finalTelegramUser) {
      return ctx.reply("❌ Could not find or create your Telegram account.");
    }

    // Check if accounts are already linked
    if (linkRecord.user.telegramId === telegramUserId.toString()) {
      await prisma.linkCode.update({
        where: { id: linkRecord.id },
        data: { used: true }
      });
      return ctx.reply("✅ These accounts are already linked!");
    }

    // Handle wallet merging if both users have wallets
    const discordWallets = await prisma.wallet.findMany({
      where: { userId: linkRecord.userId, isActive: true }
    });
    
    const telegramWallets = await prisma.wallet.findMany({
      where: { userId: finalTelegramUser.id, isActive: true }
    });

    logger.info("Wallet check results", {
      discordWallets: discordWallets.length,
      telegramWallets: telegramWallets.length,
      discordUserId: linkRecord.userId,
      telegramUserId: finalTelegramUser.id
    } as any);

    if (discordWallets.length > 0 && telegramWallets.length > 0) {
      // Both accounts have wallets - ask user which one to keep
      await ctx.reply(`⚠️ **Both accounts have wallets!**

**Discord Wallet:** ${discordWallets[0].address}
**Telegram Wallet:** ${telegramWallets[0].address}

Which wallet would you like to keep?

Reply with:
• \`/keepdiscord\` - Keep Discord wallet (Telegram wallet will be deactivated)
• \`/keeptelegram\` - Keep Telegram wallet (Discord wallet will be deactivated)

**Note:** The unused wallet will be deactivated but not deleted for security.`, { parse_mode: "Markdown" });
      
      // Clean up any existing merge records for this user first
      await prisma.linkCode.deleteMany({
        where: {
          code: { startsWith: `MERGE_${telegramUserId}_` },
          platform: "merge"
        }
      });
      
      // Store the pending merge info for the user to process later
      await prisma.linkCode.create({
        data: {
          code: `MERGE_${telegramUserId}_${linkRecord.userId}`,
          userId: linkRecord.userId,
          platform: "merge",
          expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes to decide
          used: false
        }
      });
      
      return;
    }

    // Use database transaction for account linking
    await prisma.$transaction(async (tx) => {
      // Link the accounts by updating the Discord user with Telegram ID
      await tx.user.update({
        where: { id: linkRecord.userId },
        data: { telegramId: telegramUserId.toString() }
      });

      // Transfer any wallets from the Telegram-only user to the linked user
      if (finalTelegramUser.id !== linkRecord.userId && telegramWallets.length > 0) {
        await tx.wallet.updateMany({
          where: { userId: finalTelegramUser.id },
          data: { userId: linkRecord.userId }
        });
      }

      // Delete the separate Telegram user record since accounts are now linked
      if (finalTelegramUser.id !== linkRecord.userId) {
        await tx.user.delete({ where: { id: finalTelegramUser.id } });
      }

      // Mark the link code as used
      await tx.linkCode.update({
        where: { id: linkRecord.id },
        data: { used: true }
      });
    });

    await ctx.reply(`✅ **Accounts Successfully Linked!**

Your Discord and Telegram accounts now share ONE wallet.

**What you can now do:**
• Send payments between Discord and Telegram users
• Use the same balance across both platforms
• Manage your wallet from either app

Welcome to cross-platform SendrPay! 🚀`, { parse_mode: "Markdown" });

    logger.info("Accounts linked successfully", { 
      linkedUserId: linkRecord.userId, 
      telegramId: telegramUserId.toString()
    } as any);

  } catch (error) {
    logger.error("Error linking accounts:", error);
    logger.error("Error details:", {
      message: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      linkCode,
      telegramUserId
    } as any);
    await ctx.reply(`❌ Something went wrong linking your accounts. Please try again.\n\nError details: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}