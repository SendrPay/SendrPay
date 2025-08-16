import { BotContext } from "../bot";
import { prisma } from "../infra/prisma";
import { logger } from "../infra/logger";

// Command to link a private group (must be used in the group)
export async function commandLinkGroup(ctx: BotContext) {
  try {
    const chat = ctx.chat;
    if (!chat) {
      return ctx.reply("❌ Could not identify chat.");
    }

    // Check if this is a group/supergroup
    if (chat.type !== "group" && chat.type !== "supergroup") {
      return ctx.reply("❌ This command must be used in a group chat.");
    }

    const userId = ctx.from?.id.toString();
    if (!userId) {
      return ctx.reply("❌ Could not identify user.");
    }

    // Check if user is admin in the group
    const member = await ctx.getChatMember(parseInt(userId));
    if (member.status !== "administrator" && member.status !== "creator") {
      return ctx.reply("❌ Only group admins can link groups.");
    }

    // Get user and check if they have KOL settings
    const user = await prisma.user.findUnique({
      where: { telegramId: userId },
      include: { kolSettings: true }
    });

    if (!user) {
      return ctx.reply("❌ Please start the bot first with /start in DM.");
    }

    if (!user.kolSettings) {
      return ctx.reply("❌ Please configure your KOL settings first with /setup in DM.");
    }

    if (!user.kolSettings.groupAccessEnabled) {
      return ctx.reply("❌ You haven't enabled paid group access. Use /setup in DM to configure it.");
    }

    // Check if bot is admin in the group
    const botMember = await ctx.getChatMember(ctx.me.id);
    if (botMember.status !== "administrator") {
      return ctx.reply("❌ Please make me an admin with 'Invite Users' permission first.");
    }

    // Link the group
    await prisma.kolSettings.update({
      where: { userId: user.id },
      data: {
        privateGroupChatId: chat.id.toString()
      }
    });

    await ctx.reply(
      `✅ **Group Linked Successfully!**

This group is now linked to your KOL account.

**Settings:**
• Payment Token: ${user.kolSettings.groupAccessToken}
• Access Price: ${parseFloat(user.kolSettings.groupAccessPrice!) / Math.pow(10, 6)} ${user.kolSettings.groupAccessToken}
• Platform Fee: 5%

Users can now pay to join this group through your profile!`,
      { parse_mode: "Markdown" }
    );

    logger.info(`Group linked: ${chat.id} to user ${userId}`);
  } catch (error) {
    logger.error("Link group command error:", error);
    await ctx.reply("❌ Failed to link group. Please try again.");
  }
}

// Command to unlink a private group
export async function commandUnlinkGroup(ctx: BotContext) {
  try {
    const chat = ctx.chat;
    if (!chat) {
      return ctx.reply("❌ Could not identify chat.");
    }

    const userId = ctx.from?.id.toString();
    if (!userId) {
      return ctx.reply("❌ Could not identify user.");
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { telegramId: userId },
      include: { kolSettings: true }
    });

    if (!user?.kolSettings) {
      return ctx.reply("❌ No KOL settings found.");
    }

    if (chat.type === "private") {
      // Unlink from DM
      if (!user.kolSettings.privateGroupChatId) {
        return ctx.reply("❌ No group is currently linked.");
      }

      await prisma.kolSettings.update({
        where: { userId: user.id },
        data: {
          privateGroupChatId: null,
          groupAccessEnabled: false
        }
      });

      return ctx.reply("✅ Group unlinked successfully. Group access has been disabled.");
    } else {
      // Unlink from group - check if it's the linked group
      if (user.kolSettings.privateGroupChatId !== chat.id.toString()) {
        return ctx.reply("❌ This group is not linked to your account.");
      }

      // Check if user is admin
      const member = await ctx.getChatMember(parseInt(userId));
      if (member.status !== "administrator" && member.status !== "creator") {
        return ctx.reply("❌ Only group admins can unlink groups.");
      }

      await prisma.kolSettings.update({
        where: { userId: user.id },
        data: {
          privateGroupChatId: null,
          groupAccessEnabled: false
        }
      });

      return ctx.reply("✅ Group unlinked successfully. Paid access has been disabled.");
    }
  } catch (error) {
    logger.error("Unlink group command error:", error);
    await ctx.reply("❌ Failed to unlink group. Please try again.");
  }
}