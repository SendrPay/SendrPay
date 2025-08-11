import { logger } from "../infra/logger";
import type { BotContext } from "../bot";
import { prisma } from "../infra/prisma";

export async function commandLinkcode(ctx: BotContext) {
  if (ctx.chat?.type !== "private") {
    return ctx.reply("❌ This command only works in DM for security reasons.");
  }

  const args = ctx.message?.text?.split(" ");
  if (!args || args.length !== 2) {
    return ctx.reply("❌ Please provide a link code.\n\nUsage: `/linkcode A28D6531`", { parse_mode: "Markdown" });
  }

  const linkCode = args[1];
  const telegramUserId = ctx.from?.id;

  if (!telegramUserId) {
    return ctx.reply("❌ Could not identify your Telegram account.");
  }

  try {

    // Find the link code in the database
    const linkRecord = await prisma.linkCode.findUnique({
      where: { code: linkCode },
      include: { user: true }
    });

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

    // Get or create the Telegram user
    const telegramUser = await prisma.user.upsert({
      where: { telegramId: telegramUserId.toString() },
      update: { 
        handle: ctx.from?.username || null
      },
      create: {
        telegramId: telegramUserId.toString(),
        handle: ctx.from?.username || null
      }
    });

    // Check if accounts are already linked
    if (linkRecord.user.telegramId === telegramUserId.toString()) {
      await prisma.linkCode.delete({ where: { id: linkRecord.id } });
      return ctx.reply("✅ These accounts are already linked!");
    }

    // Link the accounts by updating the Discord user with Telegram ID
    await prisma.user.update({
      where: { id: linkRecord.userId },
      data: { telegramId: telegramUserId.toString() }
    });

    // Transfer any wallets from the Telegram-only user to the linked user
    await prisma.wallet.updateMany({
      where: { userId: telegramUser.id },
      data: { userId: linkRecord.userId }
    });

    // Delete the separate Telegram user record since accounts are now linked
    if (telegramUser.id !== linkRecord.userId) {
      await prisma.user.delete({ where: { id: telegramUser.id } });
    }


    // Clean up the used link code
    await prisma.linkCode.delete({ where: { id: linkRecord.id } });

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
    await ctx.reply("❌ Something went wrong linking your accounts. Please try again.");
  }
}