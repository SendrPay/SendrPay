import { BotContext } from "../bot";
import { logger } from "../infra/logger";

export async function commandHelp(ctx: BotContext) {
  const chat = ctx.chat;
  if (!chat) {
    return ctx.reply("❌ Could not identify chat.");
  }

  logger.info("Help command received");

  const helpMessage = `**SendrPay - Solana Payments Made Easy**

**Getting Started**
/start - Begin using SendrPay and set up your wallet
/help - Show this help message

**Wallet Management**  
/balance - View your wallet balances
/deposit - Get your wallet address to receive funds
/withdraw - Withdraw funds to an external wallet

**Payments**
/pay @user amount [token] [note] - Send crypto to another user
/tip @user amount [token] [note] - Tip a user in group chat

**Transaction History**
/history - View your recent transactions

**Examples**
\`/pay @username 10 USDC lunch money\`
\`/tip @alice 0.1 SOL great job!\`

**Supported Tokens**
• SOL - Solana
• USDC - USD Coin  
• BONK - Bonk
• JUP - Jupiter

**Need Help?**
Questions? Contact support

*SendrPay operates on Solana devnet for testing*`;

  await ctx.reply(helpMessage, { parse_mode: "Markdown" });
}