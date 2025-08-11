"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commandEnable = commandEnable;
const prisma_1 = require("../infra/prisma");
const logger_1 = require("../infra/logger");
async function commandEnable(ctx) {
    const chat = ctx.chat;
    if (!chat || chat.type === "private") {
        return ctx.reply("This command only works in groups/channels.");
    }
    // Check if user is admin
    try {
        const chatMember = await ctx.getChatMember(ctx.from.id);
        if (!["administrator", "creator"].includes(chatMember.status)) {
            return ctx.reply("❌ Only group admins can enable the bot.");
        }
    }
    catch (error) {
        logger_1.logger.error("Error checking admin status:", error);
        return ctx.reply("❌ Could not verify admin status.");
    }
    try {
        // Create or update chat record
        await prisma_1.prisma.chat.upsert({
            where: { chatId: chat.id.toString() },
            update: { whitelisted: true },
            create: {
                chatId: chat.id.toString(),
                type: chat.type,
                whitelisted: true,
                tipping: true,
                defaultTicker: "USDC"
            }
        });
        await ctx.reply(`✅ **Bot Enabled!**

This group can now use payment features:
• /pay @user amount TOKEN
• /tip amount TOKEN (reply to message)
• /balance

Default token: USDC
Use /settings to customize.

Next: DM me @${ctx.me.username} to set up your wallet!`, {
            parse_mode: "Markdown"
        });
        logger_1.logger.info(`Bot enabled in chat ${chat.id} by user ${ctx.from?.id}`);
    }
    catch (error) {
        logger_1.logger.error("Error enabling bot:", error);
        await ctx.reply("❌ Failed to enable bot. Please try again.");
    }
}
