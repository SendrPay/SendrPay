"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commandStart = commandStart;
const grammy_1 = require("grammy");
const prisma_1 = require("../infra/prisma");
async function commandStart(ctx) {
    if (ctx.chat?.type !== "private") {
        return ctx.reply("Use /start in DM to begin setup.");
    }
    const userId = ctx.from?.id.toString();
    if (!userId) {
        return ctx.reply("❌ Could not identify user.");
    }
    // Create or update user record with their current Telegram username
    const user = await prisma_1.prisma.user.upsert({
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
    const existingWallet = await prisma_1.prisma.wallet.findFirst({
        where: {
            userId: user.id,
            isActive: true
        }
    });
    if (existingWallet) {
        // Show home page for existing users
        const { showHomePage } = await Promise.resolve().then(() => require("./settings"));
        return showHomePage(ctx);
    }
    const keyboard = new grammy_1.InlineKeyboard()
        .text("✨ Create New Wallet", "generate_wallet")
        .row()
        .text("🔑 Import Existing Wallet", "import_wallet")
        .row()
        .text("🔗 Link Discord Account", "link_discord");
    const welcomeText = `✨ **Welcome to SendrPay**

Send crypto payments instantly on Telegram

**What you can do:**
• Send payments to any user
• Tip users in group chats
• Track all transactions
• Secure wallet management
• Cross-platform payments with Discord

**Getting started:**
Choose how to set up your wallet`;
    await ctx.reply(welcomeText, {
        reply_markup: keyboard,
        parse_mode: "Markdown"
    });
}
