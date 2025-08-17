import { BotContext } from "../bot";
import { logger } from "../infra/logger";

export async function commandHelp(ctx: BotContext) {
  const chat = ctx.chat;
  if (!chat) {
    return ctx.reply("❌ Could not identify chat.");
  }

  logger.info("Help command received");

  const helpMessage = `**🚀 SendrPay - Crypto Payments & KOL Monetization**

**💼 BASIC COMMANDS**
/start - Set up your wallet
/balance - Check wallet balances
/deposit - Get deposit address
/withdraw - Withdraw to external wallet
/history - View transaction history
/help - Show this help

**💸 PAYMENT COMMANDS**
/pay @user amount TOKEN [note] - Send payment
/tip amount TOKEN - Reply to message to tip

**🌟 KOL MONETIZATION**

**Setup Your KOL Profile:**
/setup - Configure monetization settings
• Choose accepted tip tokens
• Set private group pricing
• Enable/disable features

**Manage Private Groups:**
/linkgroup - Link paid group (use in DM)
1. Add bot as admin to group
2. Grant "Invite Users" permission
3. Send group username to bot
/unlinkgroup - Remove group linking

**Channel Paywalls:**
/channel_init - Set up paywalled content
1. Add bot as admin to channel
2. Grant "Post Messages" permission
3. Send channel username to bot

/post_locked - Create locked post
• Set title and teaser
• Upload text/video content
• Configure unlock price
• Auto-watermarking included

**View Profiles:**
/kol [@username] - Display KOL profile
• Shows tip buttons
• Group join options
• Accepted tokens

**🎯 HOW IT WORKS**

**For Content Creators:**
1. Run /setup to configure
2. Link groups/channels
3. Create paywalled content
4. Receive payments automatically

**For Supporters:**
1. View creator with /kol
2. Use inline buttons to:
   • Send tips (2% fee)
   • Join groups (5% fee)
   • Unlock content (5% fee)
3. Receive content via DM

**💰 SUPPORTED TOKENS**
• SOL - Solana
• USDC - USD Coin
• BONK - Bonk token
• JUP - Jupiter

**📊 PLATFORM FEES**
• Tips: 2% (from recipient)
• Group Access: 5% (from recipient)
• Content Unlock: 5% (from recipient)
• Regular payments: 0%

**⚡ QUICK EXAMPLES**
\`/pay @alice 10 USDC lunch\`
\`/tip 5 SOL\` (reply to message)
\`/kol @creator\` (view profile)
\`/setup\` (configure monetization)

**🔗 CROSS-PLATFORM**
Link Discord + Telegram accounts:
1. Use /linktelegram in Discord
2. Use /linkcode CODE here
3. Share one wallet across platforms

*Operating on Solana devnet*`;

  await ctx.reply(helpMessage, { parse_mode: "Markdown" });
}