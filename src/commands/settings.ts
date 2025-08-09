import type { BotContext } from "../bot";
import { prisma } from "../infra/prisma";
import { resolveToken } from "../core/tokens";
import { logger } from "../infra/logger";

export async function commandSettings(ctx: BotContext) {
  const chat = ctx.chat;
  if (!chat || chat.type === "private") {
    return ctx.reply("Use /settings in groups only.");
  }

  try {
    // Check if user is admin
    const chatMember = await ctx.getChatMember(ctx.from!.id);
    if (!["administrator", "creator"].includes(chatMember.status)) {
      return ctx.reply("❌ Only group admins can change settings.");
    }

    // Get current settings
    const chatRecord = await prisma.chat.findUnique({
      where: { chatId: chat.id.toString() }
    });

    if (!chatRecord?.whitelisted) {
      return ctx.reply("❌ Bot not enabled. Use /enable first.");
    }

    const args = ctx.message?.text?.split(' ').slice(1) || [];
    
    if (args.length === 0) {
      // Show current settings
      const settingsText = `⚙️ **Chat Settings**

Default Token: ${chatRecord.defaultTicker || "USDC"}
Fee Rate: ${chatRecord.feeBps || process.env.FEE_BPS || "50"} bps (${((chatRecord.feeBps || 50) / 100).toFixed(2)}%)
Tipping: ${chatRecord.tipping ? "Enabled" : "Disabled"}

**Available Commands:**
\`/settings defaulttoken TOKEN\`
\`/settings fee RATE_BPS\`
\`/settings tipping on|off\``;

      return ctx.reply(settingsText, { parse_mode: "Markdown" });
    }

    const setting = args[0].toLowerCase();
    const value = args[1];

    switch (setting) {
      case 'defaulttoken':
        if (!value) {
          return ctx.reply("❌ Usage: /settings defaulttoken TOKEN");
        }

        const token = await resolveToken(value.toUpperCase());
        if (!token) {
          return ctx.reply(`❌ Unknown token: ${value}`);
        }

        await prisma.chat.update({
          where: { chatId: chat.id.toString() },
          data: { defaultTicker: token.ticker }
        });

        await ctx.reply(`✅ Default token set to ${token.ticker}`);
        break;

      case 'fee':
        if (!value) {
          return ctx.reply("❌ Usage: /settings fee RATE_BPS (e.g., 75 for 0.75%)");
        }

        const feeBps = parseInt(value);
        if (isNaN(feeBps) || feeBps < 0 || feeBps > 1000) {
          return ctx.reply("❌ Fee rate must be between 0-1000 bps (0-10%)");
        }

        await prisma.chat.update({
          where: { chatId: chat.id.toString() },
          data: { feeBps }
        });

        await ctx.reply(`✅ Fee rate set to ${feeBps} bps (${(feeBps / 100).toFixed(2)}%)`);
        break;

      case 'tipping':
        if (!value || !['on', 'off', 'true', 'false'].includes(value.toLowerCase())) {
          return ctx.reply("❌ Usage: /settings tipping on|off");
        }

        const tippingEnabled = ['on', 'true'].includes(value.toLowerCase());

        await prisma.chat.update({
          where: { chatId: chat.id.toString() },
          data: { tipping: tippingEnabled }
        });

        await ctx.reply(`✅ Tipping ${tippingEnabled ? 'enabled' : 'disabled'}`);
        break;

      default:
        await ctx.reply(`❌ Unknown setting: ${setting}

Available settings:
• defaulttoken
• fee  
• tipping`);
    }

    logger.info(`Settings updated in chat ${chat.id}: ${setting} = ${value}`);

  } catch (error) {
    logger.error("Settings command error:", error);
    await ctx.reply("❌ Failed to update settings. Please try again.");
  }
}
