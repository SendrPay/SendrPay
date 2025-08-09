import { BotContext } from "../bot";
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

  // Answer the callback query to remove loading state
  await ctx.answerCallbackQuery();

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
          [{ text: "✨ Create New Wallet", callback_data: "generate_wallet" }],
          [{ text: "🔑 Import Existing Wallet", callback_data: "import_wallet" }]
        ]
      }
    };

    return ctx.reply(`✨ **Welcome to Solana Pay**

Send crypto payments instantly on Telegram

**What you can do:**
• Send payments to any user
• Create group giveaways  
• Split bills automatically
• Track all transactions

**Getting started:**
Choose how to set up your wallet`, {
      parse_mode: "Markdown",
      ...welcomeMenu
    });
  }

  // Get wallet balance
  const wallet = user.wallets[0];
  const balances = await getWalletBalance(wallet.address);
  
  let balanceText = "💳 **Balance**\n";
  if (balances && balances.length > 0) {
    balances.forEach(balance => {
      const amount = balance.uiAmount?.toFixed(4) || "0";
      const symbol = balance.mint.slice(0, 4);
      balanceText += `${amount} ${symbol}\n`;
    });
  } else {
    balanceText += "Ready to receive payments\n";
  }

  const homeMenu = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "💸 Send", callback_data: "send_payment" },
          { text: "📱 Receive", callback_data: "receive_payment" }
        ],
        [
          { text: "📋 History", callback_data: "history" },
          { text: "⚙️ Settings", callback_data: "settings_main" }
        ]
      ]
    }
  };

  const homeText = `🏠 **Home**
@${user.handle || 'Set username in Telegram'}

${balanceText}

**Wallet:** \`${wallet.address.slice(0, 8)}...${wallet.address.slice(-4)}\`

**Quick commands:**
• Reply + /tip amount - Tip a message
• /pay @user amount TOKEN - Send payment  
• /split 100 USDC @user1 @user2 - Split bills
• /giveaway start - Create group giveaways`;

  return ctx.reply(homeText, {
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
    return ctx.reply("❌ No wallet found. Please create one first.");
  }

  const wallet = user.wallets[0];
  const balances = await getWalletBalance(wallet.address);
  
  let balanceText = "💰 **Current Balances:**\n\n";
  if (balances && balances.length > 0) {
    balances.forEach(balance => {
      const amount = balance.uiAmount?.toFixed(4) || "0";
      const symbol = balance.mint.slice(0, 4);
      balanceText += `${symbol}: ${amount}\n`;
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

  return ctx.reply(walletText, {
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

  return ctx.reply(sendText, {
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

  return ctx.reply(receiveText, {
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

  return ctx.reply(securityText, {
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
    return ctx.reply("❌ User not found.");
  }

  const payments = await prisma.payment.findMany({
    where: {
      OR: [
        { fromUserId: user.id },
        { toUserId: user.id }
      ]
    },
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  let historyText = "📊 **Transaction History** (Last 10)\n\n";
  
  if (payments.length === 0) {
    historyText += "No transactions yet.";
  } else {
    payments.forEach((payment, index) => {
      const isSent = payment.fromUserId === user.id;
      const direction = isSent ? "→" : "←";
      const amount = parseFloat(payment.amountRaw) / Math.pow(10, 6); // Assuming 6 decimals for display
      const symbol = payment.mint.slice(0, 4);
      
      historyText += `${index + 1}. ${direction} ${amount.toFixed(2)} ${symbol}\n`;
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

  return ctx.reply(historyText, {
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

  const helpText = `❓ **Help**

**Commands:**
• \`/pay @user amount TOKEN\` - Send payment
• \`/tip amount\` - Tip a message (reply required)
• \`/split 100 USDC @user1 @user2\` - Split bills
• \`/balance\` - Check your balance


**Groups:**
• Admins use \`/enable\` to activate bot
• Reply to messages with \`/tip amount\`
• Use \`/giveaway\` for community events

**Network:**
Operates on Solana devnet (test network)

**Security:**
• Keep private keys secure
• Only import wallets you control
• Verify recipients before sending`;

  return ctx.reply(helpText, {
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

  return ctx.reply(settingsText, {
    parse_mode: "Markdown",
    ...settingsMenu
  });
}