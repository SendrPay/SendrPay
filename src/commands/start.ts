import type { BotContext } from "../bot";
import { InlineKeyboard } from "grammy";
import { env } from "../infra/env";

export async function commandStart(ctx: BotContext) {
  if (ctx.chat?.type !== "private") {
    return ctx.reply("Use /start in DM to begin setup.");
  }

  const keyboard = new InlineKeyboard()
    .text("📱 Generate Wallet", "generate_wallet")
    .row()
    .text("📥 Import Private Key", "import_wallet");

  const welcomeText = `
🚀 **Welcome to Solana Pay Bot**

This bot enables Solana payments in Telegram groups with:
• 💸 Send/tip SOL, USDC, BONK, JUP
• 🎁 Create giveaways
• 💰 Escrow for non-users
• 🔒 Secure encrypted wallet storage

**Terms of Service:**
By using this bot, you agree to:
• Use only legitimate funds
• Understand blockchain risks
• Take responsibility for your wallet security

Choose an option to get started:
  `;

  await ctx.reply(welcomeText, { 
    reply_markup: keyboard,
    parse_mode: "Markdown" 
  });
}
