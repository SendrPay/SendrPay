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
    .text("🔐 Generate Wallet", "generate_wallet")
    .row()
    .text("📥 Import Private Key", "import_wallet");

  const welcomeText = `🚀 **Welcome to Solana Pay Bot!**

**Features:**
• 🎁 Create giveaways
• 💰 Escrow for non-users  
• 🔒 Secure encrypted wallet storage

**Terms of Service:**
By using this bot, you agree to:
• Use only legitimate funds
• Understand blockchain risks
• Take responsibility for your wallet security

**Choose an option to get started:**`;

  await ctx.reply(welcomeText, { 
    reply_markup: keyboard,
    parse_mode: "Markdown" 
  });
}
