import type { BotContext } from "../bot";
import { InlineKeyboard } from "grammy";
import { env } from "../infra/env";
import { prisma } from "../infra/prisma";

export async function commandStart(ctx: BotContext) {
  if (ctx.chat?.type !== "private") {
    return ctx.reply("Use /start in DM to begin setup.");
  }

  const userId = ctx.from?.id.toString();
  if (!userId) {
    return ctx.reply("❌ Could not identify user.");
  }

  // Create or update user record with their current Telegram username
  const user = await prisma.user.upsert({
    where: { telegramId: userId },
    update: { 
      handle: ctx.from?.username || null // Always update from current Telegram account
    },
    create: {
      telegramId: userId,
      handle: ctx.from?.username || null // Use actual Telegram username
    }
  });

  // Check if user already has a wallet
  const existingWallet = await prisma.wallet.findFirst({
    where: { 
      userId: user.id,
      isActive: true 
    }
  });

  if (existingWallet) {
    // Show home page for existing users
    const { showHomePage } = await import("./settings");
    return showHomePage(ctx);
  }

  const keyboard = new InlineKeyboard()
    .text("✨ Create New Wallet", "generate_wallet")
    .row()
    .text("🔑 Import Existing Wallet", "import_wallet");

  const welcomeText = `✨ **Welcome to SendrPay**

Send crypto payments instantly on Telegram

**What you can do:**
• Send payments to any user
• Tip users in group chats
• Track all transactions
• Secure wallet management

**Getting started:**
Choose how to set up your wallet`;

  await ctx.reply(welcomeText, { 
    reply_markup: keyboard,
    parse_mode: "Markdown" 
  });
}
