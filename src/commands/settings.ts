import { BotContext } from "../types/bot";
import { prisma } from "../infra/prisma";
import { getWalletBalance } from "../core/wallets";

export async function commandSettings(ctx: BotContext) {
  const userId = ctx.from?.id.toString();
  if (!userId) {
    return ctx.reply("❌ Could not identify user.");
  }

  const user = await prisma.user.findUnique({
    where: { telegramId: userId },
    include: { wallets: { where: { isActive: true } } }
  });

  if (!user) {
    return ctx.reply("❌ Please start the bot first with /start");
  }

  const settingsMenu = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🏠 Home", callback_data: "home" },
          { text: "💰 My Wallet", callback_data: "wallet" }
        ],
        [
          { text: "💸 Send Payment", callback_data: "send_payment" },
          { text: "🎁 Receive Payment", callback_data: "receive_payment" }
        ],
        [
          { text: "🔒 Security Settings", callback_data: "security" },
          { text: "📊 Transaction History", callback_data: "history" }
        ],
        [
          { text: "❓ Help & Support", callback_data: "help" },
          { text: "⚙️ Bot Settings", callback_data: "bot_settings" }
        ]
      ]
    }
  };

  return ctx.reply("⚙️ **Settings Menu**\n\nChoose an option:", {
    parse_mode: "Markdown",
    ...settingsMenu
  });
}

export async function handleSettingsCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const userId = ctx.from?.id.toString();
  if (!userId) return;

  switch (data) {
    case "home":
      return showHomePage(ctx);
    case "wallet":
      return showWalletInfo(ctx);
    case "send_payment":
      return showSendPayment(ctx);
    case "receive_payment":
      return showReceivePayment(ctx);
    case "security":
      return showSecuritySettings(ctx);
    case "history":
      return showTransactionHistory(ctx);
    case "help":
      return showHelp(ctx);
    case "bot_settings":
      return showBotSettings(ctx);
  }
}

export async function showHomePage(ctx: BotContext) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const user = await prisma.user.findUnique({
    where: { telegramId: userId },
    include: { wallets: { where: { isActive: true } } }
  });

  if (!user || !user.wallets[0]) {
    const welcomeMenu = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔐 Generate Wallet", callback_data: "generate_wallet" }],
          [{ text: "📥 Import Private Key", callback_data: "import_wallet" }]
        ]
      }
    };

    return ctx.editMessageText(`🚀 **Welcome to Solana Pay Bot!**

**Features:**
• 🎁 Create giveaways
• 💰 Escrow for non-users  
• 🔒 Secure encrypted wallet storage

**Terms of Service:**
By using this bot, you agree to:
• Use only legitimate funds
• Understand blockchain risks
• Take responsibility for your wallet security

**Choose an option to get started:**`, {
      parse_mode: "Markdown",
      ...welcomeMenu
    });
  }

  // Get wallet balance
  const wallet = user.wallets[0];
  const balances = await getWalletBalance(wallet.address);
  
  let balanceText = "💰 **Your Balances:**\n";
  if (balances && balances.length > 0) {
    balances.forEach(balance => {
      balanceText += `• ${balance.formatted} ${balance.token}\n`;
    });
  } else {
    balanceText += "No tokens found\n";
  }

  const homeMenu = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "💸 Send Payment", callback_data: "send_payment" },
          { text: "🎁 Receive", callback_data: "receive_payment" }
        ],
        [
          { text: "📊 History", callback_data: "history" },
          { text: "⚙️ Settings", callback_data: "settings_main" }
        ]
      ]
    }
  };

  const homeText = `🏠 **Home** - @${user.handle || 'No username'}

${balanceText}

🏦 **Wallet Address:**
\`${wallet.address}\`

**How to use:**
• **In Groups:** Reply to messages with /tip or /pay
• **In DMs:** Use /pay @username amount TOKEN
• **Giveaways:** Use /giveaway in groups
• **Split Bills:** Use /split amount TOKEN @user1 @user2

Ready to make payments!`;

  return ctx.editMessageText(homeText, {
    parse_mode: "Markdown",
    ...homeMenu
  });
}

async function showWalletInfo(ctx: BotContext) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const user = await prisma.user.findUnique({
    where: { telegramId: userId },
    include: { wallets: { where: { isActive: true } } }
  });

  if (!user || !user.wallets[0]) {
    return ctx.editMessageText("❌ No wallet found. Please create one first.");
  }

  const wallet = user.wallets[0];
  const balances = await getWalletBalance(wallet.address);
  
  let balanceText = "💰 **Current Balances:**\n\n";
  if (balances && balances.length > 0) {
    balances.forEach(balance => {
      balanceText += `${balance.token}: ${balance.formatted}\n`;
    });
  } else {
    balanceText += "No tokens found";
  }

  const walletMenu = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔄 Refresh Balance", callback_data: "wallet" }],
        [{ text: "🏠 Back to Home", callback_data: "home" }]
      ]
    }
  };

  const walletText = `🏦 **My Wallet**

📍 **Address:**
\`${wallet.address}\`

${balanceText}

**Wallet Type:** ${wallet.label}
**Status:** Active ✅`;

  return ctx.editMessageText(walletText, {
    parse_mode: "Markdown",
    ...walletMenu
  });
}

async function showSendPayment(ctx: BotContext) {
  const sendMenu = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "💳 Quick Pay", callback_data: "quick_pay" }],
        [{ text: "🏠 Back to Home", callback_data: "home" }]
      ]
    }
  };

  const sendText = `💸 **Send Payment**

**How to Send:**

**In Groups:**
\`/pay @username 10 USDC\`
\`/tip 5 SOL\` (reply to message)

**In Direct Messages:**
\`/pay @username 25 BONK\`

**Supported Tokens:**
• SOL (Solana)
• USDC (USD Coin)  
• BONK (Bonk)
• JUP (Jupiter)

**Note:** Recipients must have their Telegram username set and registered with the bot.`;

  return ctx.editMessageText(sendText, {
    parse_mode: "Markdown",
    ...sendMenu
  });
}

async function showReceivePayment(ctx: BotContext) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const user = await prisma.user.findUnique({
    where: { telegramId: userId }
  });

  const receiveMenu = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🏠 Back to Home", callback_data: "home" }]
      ]
    }
  };

  const receiveText = `🎁 **Receive Payments**

**Your Payment Handle:**
${user?.handle ? `@${user.handle}` : "❌ No username set"}

**To receive payments:**
1. Make sure your Telegram username is set
2. Share your handle: @${user?.handle || 'yourusername'}
3. Others can pay you with:
   \`/pay @${user?.handle || 'yourusername'} 10 USDC\`

${!user?.handle ? "⚠️ **Set your Telegram username in Settings > Username to receive payments!**" : "✅ **Ready to receive payments!**"}`;

  return ctx.editMessageText(receiveText, {
    parse_mode: "Markdown",
    ...receiveMenu
  });
}

async function showSecuritySettings(ctx: BotContext) {
  const securityMenu = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔑 Export Private Key", callback_data: "export_key" }],
        [{ text: "🗑️ Delete Wallet", callback_data: "delete_wallet" }],
        [{ text: "🏠 Back to Home", callback_data: "home" }]
      ]
    }
  };

  const securityText = `🔒 **Security Settings**

**Wallet Security:**
• Your private key is encrypted with AES-256-GCM
• Keys are stored securely in encrypted database
• Only you have access to your wallet

**Important Reminders:**
• Never share your private key
• Keep backups secure
• Bot runs on Solana devnet (test network)
• Always verify recipient addresses`;

  return ctx.editMessageText(securityText, {
    parse_mode: "Markdown",
    ...securityMenu
  });
}

async function showTransactionHistory(ctx: BotContext) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const user = await prisma.user.findUnique({
    where: { telegramId: userId }
  });

  if (!user) {
    return ctx.editMessageText("❌ User not found.");
  }

  const payments = await prisma.payment.findMany({
    where: {
      OR: [
        { fromUserId: user.id },
        { toUserId: user.id }
      ]
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      fromUser: true,
      toUser: true
    }
  });

  let historyText = "📊 **Transaction History** (Last 10)\n\n";
  
  if (payments.length === 0) {
    historyText += "No transactions yet.";
  } else {
    payments.forEach((payment, index) => {
      const isSent = payment.fromUserId === user.id;
      const direction = isSent ? "→" : "←";
      const otherUser = isSent ? payment.toUser : payment.fromUser;
      const amount = parseFloat(payment.amountRaw) / Math.pow(10, 6); // Assuming 6 decimals for display
      
      historyText += `${index + 1}. ${direction} ${amount.toFixed(2)} ${payment.tokenTicker}\n`;
      historyText += `   ${isSent ? 'To' : 'From'}: @${otherUser?.handle || 'Unknown'}\n`;
      historyText += `   ${payment.status} • ${payment.createdAt.toLocaleDateString()}\n\n`;
    });
  }

  const historyMenu = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🏠 Back to Home", callback_data: "home" }]
      ]
    }
  };

  return ctx.editMessageText(historyText, {
    parse_mode: "Markdown",
    ...historyMenu
  });
}

async function showHelp(ctx: BotContext) {
  const helpMenu = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🏠 Back to Home", callback_data: "home" }]
      ]
    }
  };

  const helpText = `❓ **Help & Support**

**Basic Commands:**
• \`/start\` - Start the bot
• \`/wallet\` - Show wallet info
• \`/pay @user amount TOKEN\` - Send payment
• \`/tip amount TOKEN\` - Tip (reply to message)
• \`/balance\` - Check balance

**Group Commands:**
• \`/enable\` - Enable bot (admins only)
• \`/giveaway amount TOKEN\` - Create giveaway
• \`/split 100 USDC @user1 @user2\` - Split bill

**Support:**
• Bot runs on Solana devnet (test network)
• Transactions are real but on test network
• Report issues to bot administrator
• Keep your private keys secure

**Need Help?**
Contact the bot administrator or check our documentation.`;

  return ctx.editMessageText(helpText, {
    parse_mode: "Markdown",
    ...helpMenu
  });
}

async function showBotSettings(ctx: BotContext) {
  const settingsMenu = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔔 Notifications", callback_data: "notifications" }],
        [{ text: "🌐 Language", callback_data: "language" }],
        [{ text: "🏠 Back to Home", callback_data: "home" }]
      ]
    }
  };

  const settingsText = `⚙️ **Bot Settings**

**Current Settings:**
• Notifications: On ✅
• Language: English 🇺🇸
• Network: Solana Devnet
• Version: 1.0.0

**Features:**
• Real-time balance updates
• Transaction confirmations
• Security notifications
• Multi-token support`;

  return ctx.editMessageText(settingsText, {
    parse_mode: "Markdown",
    ...settingsMenu
  });
}