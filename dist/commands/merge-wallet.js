"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commandKeepDiscord = commandKeepDiscord;
exports.commandKeepTelegram = commandKeepTelegram;
const logger_1 = require("../infra/logger");
const prisma_1 = require("../infra/prisma");
async function commandKeepDiscord(ctx) {
    if (ctx.chat?.type !== "private") {
        return ctx.reply("❌ This command only works in DM for security reasons.");
    }
    const telegramUserId = ctx.from?.id;
    if (!telegramUserId) {
        return ctx.reply("❌ Could not identify your Telegram account.");
    }
    await handleWalletMerge(ctx, telegramUserId, "discord");
}
async function commandKeepTelegram(ctx) {
    if (ctx.chat?.type !== "private") {
        return ctx.reply("❌ This command only works in DM for security reasons.");
    }
    const telegramUserId = ctx.from?.id;
    if (!telegramUserId) {
        return ctx.reply("❌ Could not identify your Telegram account.");
    }
    await handleWalletMerge(ctx, telegramUserId, "telegram");
}
async function handleWalletMerge(ctx, telegramUserId, keepPlatform) {
    try {
        // Find pending merge record
        const mergeCode = `MERGE_${telegramUserId}_`;
        const mergeRecord = await prisma_1.prisma.linkCode.findFirst({
            where: {
                code: { startsWith: mergeCode },
                platform: "merge"
            },
            include: { user: true }
        });
        if (!mergeRecord) {
            return ctx.reply("❌ No pending wallet merge found. Please start the linking process again with `/linkcode`.");
        }
        // Extract Discord user ID from the merge code
        const discordUserId = parseInt(mergeRecord.code.split('_')[2]);
        // Get both users
        const telegramUser = await prisma_1.prisma.user.findFirst({
            where: { telegramId: telegramUserId.toString() }
        });
        if (!telegramUser) {
            return ctx.reply("❌ Could not find your Telegram account.");
        }
        if (keepPlatform === "discord") {
            // Keep Discord wallet, deactivate Telegram wallet
            await prisma_1.prisma.wallet.updateMany({
                where: { userId: telegramUser.id },
                data: { isActive: false }
            });
            // Link Telegram user to Discord account
            await prisma_1.prisma.user.update({
                where: { id: discordUserId },
                data: { telegramId: telegramUserId.toString() }
            });
            // Delete separate Telegram user record
            await prisma_1.prisma.user.delete({ where: { id: telegramUser.id } });
            await ctx.reply(`✅ **Accounts Successfully Linked!**

**Discord wallet kept** - Your Telegram wallet has been deactivated.

Your Discord and Telegram accounts now share the Discord wallet.

**What you can now do:**
• Send payments between Discord and Telegram users
• Use the same balance across both platforms
• Manage your wallet from either app

Cross-platform SendrPay is ready! 🚀`, { parse_mode: "Markdown" });
        }
        else {
            // Keep Telegram wallet, deactivate Discord wallet
            await prisma_1.prisma.wallet.updateMany({
                where: { userId: discordUserId },
                data: { isActive: false }
            });
            // Link Discord user to point to this Telegram user's ID
            await prisma_1.prisma.user.update({
                where: { id: discordUserId },
                data: { telegramId: telegramUserId.toString() }
            });
            // Transfer Telegram user's wallets to Discord user record  
            await prisma_1.prisma.wallet.updateMany({
                where: { userId: telegramUser.id },
                data: { userId: discordUserId }
            });
            // Delete the separate Telegram user record
            await prisma_1.prisma.user.delete({ where: { id: telegramUser.id } });
            await ctx.reply(`✅ **Accounts Successfully Linked!**

**Telegram wallet kept** - Your Discord wallet has been deactivated.

Your Discord and Telegram accounts now share the Telegram wallet.

**What you can now do:**
• Send payments between Discord and Telegram users
• Use the same balance across both platforms
• Manage your wallet from either app

Cross-platform SendrPay is ready! 🚀`, { parse_mode: "Markdown" });
        }
        // Clean up the merge record
        await prisma_1.prisma.linkCode.delete({ where: { id: mergeRecord.id } });
        logger_1.logger.info("Wallet merge completed", {
            telegramUserId,
            discordUserId,
            keptPlatform: keepPlatform
        });
    }
    catch (error) {
        logger_1.logger.error("Error merging wallets:", error);
        await ctx.reply("❌ Something went wrong merging your wallets. Please try again.");
    }
}
