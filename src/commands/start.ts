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
    // Show main menu for existing users
    return showMainMenu(ctx);
  }

  const keyboard = new InlineKeyboard()
    .text("✨ Create New Wallet", "generate_wallet")
    .row()
    .text("🔑 Import Existing Wallet", "import_wallet")
    .row()
    .text("🔗 Link Discord Account", "link_discord");

  const welcomeText = `✨ *Welcome to SendrPay*

Send crypto payments instantly on Telegram

*💰 Payment Features:*
• Send payments to any user
• Tip users in group chats  
• Track all transactions
• Secure wallet management
• Cross\\-platform payments with Discord

*🎯 KOL Monetization Features:*
• Set up paid group access
• Create paywalled content
• Receive tips with buttons
• Configure accepted tokens
• 2\\-5% platform fees only

*📚 New Commands:*
• /interface or /menu \\- Full inline interface
• /kol\\_setup \\- KOL private group setup  
• /paywall\\_setup \\- Channel paywall setup
• /create\\_post \\- Create locked content
• /kol \\- View KOL profile

*Getting started:*
Choose how to set up your wallet`;

  await ctx.reply(welcomeText, { 
    reply_markup: keyboard,
    parse_mode: "MarkdownV2" 
  });
}

// Main menu for existing users with clear navigation
export async function showMainMenu(ctx: BotContext) {
  const userId = ctx.from?.id.toString();
  if (!userId) {
    return ctx.reply("❌ Could not identify user.");
  }

  // Get user's wallet info
  const user = await prisma.user.findUnique({
    where: { telegramId: userId },
    include: {
      wallets: { where: { isActive: true } }
    }
  });

  const wallet = user?.wallets?.[0];
  if (!wallet) {
    return ctx.reply("❌ No active wallet found. Use /start to set up.");
  }

  // Get balance (simplified for now)
  let balanceText = "Loading...";
  try {
    const { getWalletBalance } = await import("../core/wallets");
    const balance = await getWalletBalance(wallet.address);
    balanceText = `${balance.toFixed(4)} SOL`;
  } catch (error) {
    balanceText = "0.0000 SOL";
  }

  const keyboard = new InlineKeyboard()
    .text("🎯 KOL Features", "main_kol").text("💰 Wallet", "main_wallet").row()
    .text("📤 Send Payment", "main_send").text("📊 History", "main_history").row()
    .text("⚙️ Settings", "main_settings").text("❓ Help", "main_help").row();

  const menuText = 
    `🏠 **SendrPay Main Menu**\n\n` +
    `👤 **User:** @${ctx.from?.username || "Anonymous"}\n` +
    `💼 **Wallet:** \`${wallet.address.slice(0, 8)}...${wallet.address.slice(-8)}\`\n` +
    `💰 **Balance:** ${balanceText}\n\n` +
    `Choose a section to explore:`;

  if (ctx.callbackQuery) {
    await ctx.editMessageText(menuText, {
      parse_mode: "Markdown",
      reply_markup: keyboard
    });
  } else {
    await ctx.reply(menuText, {
      parse_mode: "Markdown", 
      reply_markup: keyboard
    });
  }
}
