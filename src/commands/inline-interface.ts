import { InlineKeyboard } from "grammy";
import type { BotContext } from "../bot";
import { logger } from "../infra/logger";
import { prisma } from "../infra/prisma";

// Complete inline interface for all bot commands
export async function commandInlineInterface(ctx: BotContext) {
  if (ctx.chat?.type !== "private") {
    return ctx.reply("This command only works in DM.");
  }

  const userId = ctx.from!.id.toString();
  
  try {
    // Get user data
    const user = await prisma.user.findUnique({
      where: { telegramId: userId },
      include: { 
        wallets: true, 
        kolSettings: true,
        payments: { 
          take: 5, 
          orderBy: { createdAt: 'desc' } 
        }
      }
    });

    if (!user) {
      return showWelcomeInterface(ctx);
    }

    return showMainInterface(ctx, user);
  } catch (error) {
    logger.error("Inline interface error:", error);
    await ctx.reply("❌ An error occurred. Please try again.");
  }
}

// Welcome interface for new users
async function showWelcomeInterface(ctx: BotContext) {
  const keyboard = new InlineKeyboard()
    .text("🆕 Create Account", "interface_create_account").row()
    .text("💰 Generate Wallet", "interface_generate_wallet")
    .text("📥 Import Wallet", "interface_import_wallet").row()
    .text("❓ Help & Info", "interface_help");

  await ctx.reply(
    `🤖 **SendrPay Bot Interface**\n\n` +
    `Welcome! I'm your crypto payment assistant.\n\n` +
    `**What I can do:**\n` +
    `• Send & receive crypto payments\n` +
    `• KOL monetization features\n` +
    `• Paywalled content creation\n` +
    `• Group access management\n\n` +
    `**Get started:**`,
    {
      parse_mode: "Markdown",
      reply_markup: keyboard
    }
  );
}

// Main interface for existing users
async function showMainInterface(ctx: BotContext, user: any) {
  const hasWallet = user.wallets && user.wallets.length > 0;
  const isKol = user.isKol;
  
  const keyboard = new InlineKeyboard()
    // Wallet section
    .text("💰 My Wallet", "interface_wallet")
    .text("📊 Balance", "interface_balance").row()
    .text("💸 Send Payment", "interface_send")
    .text("📈 History", "interface_history").row()
    
    // KOL section
    .text("🎯 KOL Features", "interface_kol")
    .text("👤 My Profile", "interface_profile").row()
    
    // Content section
    .text("📝 Create Content", "interface_content")
    .text("🔐 Manage Groups", "interface_groups").row()
    
    // Settings section
    .text("⚙️ Settings", "interface_settings")
    .text("❓ Help", "interface_help");

  const stats = await getUserStats(user.id);
  
  await ctx.reply(
    `🤖 **SendrPay Bot Interface**\n\n` +
    `👋 Welcome back, ${user.displayName || "User"}!\n\n` +
    `**Quick Stats:**\n` +
    `• Wallet: ${hasWallet ? "✅ Active" : "❌ Not Set"}\n` +
    `• KOL Status: ${isKol ? "✅ Enabled" : "❌ Disabled"}\n` +
    `• Total Payments: ${stats.totalPayments}\n` +
    `• Recent Activity: ${stats.recentActivity}\n\n` +
    `**Choose an option:**`,
    {
      parse_mode: "Markdown",
      reply_markup: keyboard
    }
  );
}

// Handle all interface callbacks
export async function handleInterfaceCallbacks(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith("interface_")) return;

  const action = data.replace("interface_", "");
  
  try {
    switch (action) {
      case "create_account":
        await handleCreateAccount(ctx);
        break;
      case "generate_wallet":
        await handleGenerateWallet(ctx);
        break;
      case "import_wallet":
        await handleImportWallet(ctx);
        break;
      case "wallet":
        await handleWalletInterface(ctx);
        break;
      case "balance":
        await handleBalanceInterface(ctx);
        break;
      case "send":
        await handleSendInterface(ctx);
        break;
      case "history":
        await handleHistoryInterface(ctx);
        break;
      case "kol":
        await handleKolInterface(ctx);
        break;
      case "profile":
        await handleKolInterface(ctx); // Use KOL interface for profile
        break;
      case "content":
        await handleContentInterface(ctx);
        break;
      case "groups":
        await handleGroupsInterface(ctx);
        break;
      case "settings":
        await handleSettingsInterface(ctx);
        break;
      case "help":
        await handleHelpInterface(ctx);
        break;
      case "back_main":
        await commandInlineInterface(ctx);
        break;
      default:
        await ctx.answerCallbackQuery("Unknown action");
    }
  } catch (error) {
    logger.error("Interface callback error:", error);
    await ctx.answerCallbackQuery("❌ Error occurred");
  }
}

// Individual interface handlers
async function handleCreateAccount(ctx: BotContext) {
  await ctx.answerCallbackQuery();
  const { commandStart } = await import("./start");
  await commandStart(ctx);
}

async function handleGenerateWallet(ctx: BotContext) {
  await ctx.answerCallbackQuery();
  const { generateWallet } = await import("../core/wallets");
  await generateWallet(ctx);
}

async function handleImportWallet(ctx: BotContext) {
  await ctx.answerCallbackQuery();
  ctx.session.awaitingPrivateKey = true;
  await ctx.editMessageText(
    `🔑 **Import Wallet**\n\n` +
    `Send your private key in your next message:\n\n` +
    `**Supported formats:**\n` +
    `• Base58 string\n` +
    `• JSON array\n\n` +
    `**Security:**\n` +
    `• Only import keys you control\n` +
    `• Never share private keys\n` +
    `• Message will be deleted automatically\n\n` +
    `Send private key now:`,
    { 
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("⬅️ Back", "interface_back_main")
    }
  );
}

async function handleWalletInterface(ctx: BotContext) {
  await ctx.answerCallbackQuery();
  
  const userId = ctx.from!.id.toString();
  const user = await prisma.user.findUnique({
    where: { telegramId: userId },
    include: { wallets: true }
  });

  if (!user || !user.wallets?.length) {
    const keyboard = new InlineKeyboard()
      .text("🆕 Generate Wallet", "interface_generate_wallet")
      .text("📥 Import Wallet", "interface_import_wallet").row()
      .text("⬅️ Back", "interface_back_main");

    return ctx.editMessageText(
      `💰 **Wallet Management**\n\n` +
      `❌ No wallet found.\n\n` +
      `Create or import a wallet to get started:`,
      {
        parse_mode: "Markdown",
        reply_markup: keyboard
      }
    );
  }

  const wallet = user.wallets[0];
  const keyboard = new InlineKeyboard()
    .text("📊 View Balance", "interface_balance")
    .text("📈 Transaction History", "interface_history").row()
    .text("💸 Send Payment", "interface_send")
    .text("📥 Deposit Address", "interface_deposit").row()
    .text("💱 Withdraw Funds", "interface_withdraw").row()
    .text("⬅️ Back", "interface_back_main");

  await ctx.editMessageText(
    `💰 **Your Wallet**\n\n` +
    `**Address:** \`${wallet.address}\`\n\n` +
    `**Actions:**`,
    {
      parse_mode: "Markdown",
      reply_markup: keyboard
    }
  );
}

async function handleBalanceInterface(ctx: BotContext) {
  await ctx.answerCallbackQuery();
  const { commandBalance } = await import("./balance");
  await commandBalance(ctx);
}

async function handleSendInterface(ctx: BotContext) {
  await ctx.answerCallbackQuery();
  
  const keyboard = new InlineKeyboard()
    .text("💰 Direct Payment", "interface_direct_pay")
    .text("🎁 Tip Someone", "interface_tip").row()
    .text("📝 Payment Guide", "interface_pay_guide").row()
    .text("⬅️ Back", "interface_back_main");

  await ctx.editMessageText(
    `💸 **Send Payment**\n\n` +
    `**Quick Commands:**\n` +
    `• \`/pay @username 10 USDC\`\n` +
    `• \`/tip 5 SOL\` (reply to message)\n\n` +
    `**Choose payment type:**`,
    {
      parse_mode: "Markdown",
      reply_markup: keyboard
    }
  );
}

async function handleHistoryInterface(ctx: BotContext) {
  await ctx.answerCallbackQuery();
  const { commandHistory } = await import("./history");
  await commandHistory(ctx);
}

async function handleKolInterface(ctx: BotContext) {
  await ctx.answerCallbackQuery();
  
  const keyboard = new InlineKeyboard()
    .text("⚙️ KOL Setup", "interface_kol_setup")
    .text("👤 My Profile", "interface_profile").row()
    .text("🔗 Link Group", "interface_link_group")
    .text("📊 KOL Stats", "interface_kol_stats").row()
    .text("⬅️ Back", "interface_back_main");

  await ctx.editMessageText(
    `🎯 **KOL Features**\n\n` +
    `**Monetization Tools:**\n` +
    `• Accept tips from followers\n` +
    `• Charge for private group access\n` +
    `• Create paywalled content\n\n` +
    `**Commands:**\n` +
    `• \`/kol_setup\` - Configure payment settings\n` +
    `• \`/kol @username\` - View KOL profile\n` +
    `• \`/linkgroup\` - Link private group\n\n` +
    `**Choose an option:**`,
    {
      parse_mode: "Markdown",
      reply_markup: keyboard
    }
  );
}

async function handleContentInterface(ctx: BotContext) {
  await ctx.answerCallbackQuery();
  
  const keyboard = new InlineKeyboard()
    .text("🎬 Setup Channel", "interface_paywall_setup")
    .text("📝 Create Post", "interface_create_post").row()
    .text("📊 Content Stats", "interface_content_stats").row()
    .text("⬅️ Back", "interface_back_main");

  await ctx.editMessageText(
    `📝 **Content Creation**\n\n` +
    `**Paywalled Content:**\n` +
    `• Setup channel for monetization\n` +
    `• Create locked posts with teasers\n` +
    `• Set custom pricing per post\n\n` +
    `**Commands:**\n` +
    `• \`/paywall_setup\` - Setup channel\n` +
    `• \`/create_post\` - Create locked content\n\n` +
    `**Choose an option:**`,
    {
      parse_mode: "Markdown",
      reply_markup: keyboard
    }
  );
}

async function handleGroupsInterface(ctx: BotContext) {
  await ctx.answerCallbackQuery();
  
  const keyboard = new InlineKeyboard()
    .text("🔗 Link Group", "interface_link_group")
    .text("🔓 Unlink Group", "interface_unlink_group").row()
    .text("👥 Group Members", "interface_group_members")
    .text("💰 Group Revenue", "interface_group_revenue").row()
    .text("⬅️ Back", "interface_back_main");

  await ctx.editMessageText(
    `🔐 **Group Management**\n\n` +
    `**Private Group Access:**\n` +
    `• Link your private groups\n` +
    `• Set access pricing\n` +
    `• Manage member access\n\n` +
    `**Commands:**\n` +
    `• \`/linkgroup\` - Link a group\n` +
    `• \`/unlinkgroup\` - Unlink a group\n\n` +
    `**Choose an option:**`,
    {
      parse_mode: "Markdown",
      reply_markup: keyboard
    }
  );
}

async function handleSettingsInterface(ctx: BotContext) {
  await ctx.answerCallbackQuery();
  const { showHomePage } = await import("./settings");
  await showHomePage(ctx);
}

async function handleHelpInterface(ctx: BotContext) {
  await ctx.answerCallbackQuery();
  const { commandHelp } = await import("./help");
  await commandHelp(ctx);
}

// Utility function to get user stats
async function getUserStats(userId: string) {
  try {
    const payments = await prisma.payment.count({
      where: {
        OR: [
          { fromUserId: userId },
          { toUserId: userId }
        ]
      }
    });

    const recentPayment = await prisma.payment.findFirst({
      where: {
        OR: [
          { fromUserId: userId },
          { toUserId: userId }
        ]
      },
      orderBy: { createdAt: 'desc' }
    });

    const recentActivity = recentPayment 
      ? `${Math.floor((Date.now() - recentPayment.createdAt.getTime()) / (1000 * 60 * 60 * 24))} days ago`
      : "No activity";

    return {
      totalPayments: payments,
      recentActivity
    };
  } catch (error) {
    return {
      totalPayments: 0,
      recentActivity: "Unknown"
    };
  }
}