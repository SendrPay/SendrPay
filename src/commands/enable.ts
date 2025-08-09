import type { BotContext } from "../bot";
import { prisma } from "../infra/prisma";
import { logger } from "../infra/logger";

export async function commandEnable(ctx: BotContext) {
  const chat = ctx.chat;
  if (!chat || chat.type === "private") {
    return ctx.reply("This command only works in groups/channels.");
  }

  // Check if user is admin
  try {
    const chatMember = await ctx.getChatMember(ctx.from!.id);
    if (!["administrator", "creator"].includes(chatMember.status)) {
      return ctx.reply("❌ Only group admins can enable the bot.");
    }
  } catch (error) {
    logger.error("Error checking admin status:", error);
    return ctx.reply("❌ Could not verify admin status.");
  }

  try {
    // Create or update chat record
    await prisma.chat.upsert({
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
• /giveaway start/enter/draw

Default token: USDC
Use /settings to customize.

Next: DM me @${ctx.me.username} to set up your wallet!`, {
      parse_mode: "Markdown"
    });

    logger.info(`Bot enabled in chat ${chat.id} by user ${ctx.from?.id}`);
  } catch (error) {
    logger.error("Error enabling bot:", error);
    await ctx.reply("❌ Failed to enable bot. Please try again.");
  }
}
