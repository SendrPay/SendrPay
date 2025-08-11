"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commandLinkcode = commandLinkcode;
const logger_1 = require("../infra/logger");
const prisma_1 = require("../infra/prisma");
async function commandLinkcode(ctx) {
    if (ctx.chat?.type !== "private") {
        return ctx.reply("❌ This command only works in DM for security reasons.");
    }
    const args = ctx.message?.text?.split(" ");
    if (!args || args.length !== 2) {
        return ctx.reply("❌ Please provide a link code.\n\nUsage: `/linkcode A28D6531`", { parse_mode: "Markdown" });
    }
    const linkCode = args[1];
    const telegramUserId = ctx.from?.id;
    if (!telegramUserId) {
        return ctx.reply("❌ Could not identify your Telegram account.");
    }
    try {
        // Find the link code in the database
        const linkRecord = await prisma_1.prisma.linkCode.findUnique({
            where: { code: linkCode },
            include: { user: true }
        });
        if (!linkRecord) {
            return ctx.reply("❌ Invalid or expired link code.\n\nPlease generate a new code from Discord using `/linktelegram`.");
        }
        // Check if code is expired (valid for 10 minutes)
        const now = new Date();
        const codeAge = now.getTime() - linkRecord.createdAt.getTime();
        if (codeAge > 10 * 60 * 1000) { // 10 minutes
            await prisma_1.prisma.linkCode.delete({ where: { id: linkRecord.id } });
            return ctx.reply("❌ Link code has expired.\n\nPlease generate a new code from Discord using `/linktelegram`.");
        }
        // Check if this is for Discord linking
        if (linkRecord.platform !== "discord") {
            return ctx.reply("❌ This link code is not for Discord linking.");
        }
        // Get or create the Telegram user
        const telegramUser = await prisma_1.prisma.user.upsert({
            where: { telegramId: telegramUserId.toString() },
            update: {
                handle: ctx.from?.username || null
            },
            create: {
                telegramId: telegramUserId.toString(),
                handle: ctx.from?.username || null
            }
        });
        // Check if accounts are already linked
        if (linkRecord.user.telegramId === telegramUserId.toString()) {
            await prisma_1.prisma.linkCode.delete({ where: { id: linkRecord.id } });
            return ctx.reply("✅ These accounts are already linked!");
        }
        // Handle wallet merging if both users have wallets
        const discordWallets = await prisma_1.prisma.wallet.findMany({
            where: { userId: linkRecord.userId, isActive: true }
        });
        const telegramWallets = await prisma_1.prisma.wallet.findMany({
            where: { userId: telegramUser.id, isActive: true }
        });
        if (discordWallets.length > 0 && telegramWallets.length > 0) {
            // Both accounts have wallets - ask user which one to keep
            await ctx.reply(`⚠️ **Both accounts have wallets!**

**Discord Wallet:** ${discordWallets[0].address}
**Telegram Wallet:** ${telegramWallets[0].address}

Which wallet would you like to keep?

Reply with:
• \`/keepdiscord\` - Keep Discord wallet (Telegram wallet will be deactivated)
• \`/keeptelegram\` - Keep Telegram wallet (Discord wallet will be deactivated)

**Note:** The unused wallet will be deactivated but not deleted for security.`, { parse_mode: "Markdown" });
            // Store the pending merge info for the user to process later
            await prisma_1.prisma.linkCode.create({
                data: {
                    code: `MERGE_${telegramUserId}_${linkRecord.userId}`,
                    userId: linkRecord.userId,
                    platform: "merge",
                    expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes to decide
                }
            });
            return;
        }
        // Link the accounts by updating the Discord user with Telegram ID
        await prisma_1.prisma.user.update({
            where: { id: linkRecord.userId },
            data: { telegramId: telegramUserId.toString() }
        });
        // Transfer any wallets from the Telegram-only user to the linked user
        await prisma_1.prisma.wallet.updateMany({
            where: { userId: telegramUser.id },
            data: { userId: linkRecord.userId }
        });
        // Delete the separate Telegram user record since accounts are now linked
        if (telegramUser.id !== linkRecord.userId) {
            await prisma_1.prisma.user.delete({ where: { id: telegramUser.id } });
        }
        // Clean up the used link code
        await prisma_1.prisma.linkCode.delete({ where: { id: linkRecord.id } });
        await ctx.reply(`✅ **Accounts Successfully Linked!**

Your Discord and Telegram accounts now share ONE wallet.

**What you can now do:**
• Send payments between Discord and Telegram users
• Use the same balance across both platforms
• Manage your wallet from either app

Welcome to cross-platform SendrPay! 🚀`, { parse_mode: "Markdown" });
        logger_1.logger.info("Accounts linked successfully", {
            linkedUserId: linkRecord.userId,
            telegramId: telegramUserId.toString()
        });
    }
    catch (error) {
        logger_1.logger.error("Error linking accounts:", error);
        await ctx.reply("❌ Something went wrong linking your accounts. Please try again.");
    }
}
