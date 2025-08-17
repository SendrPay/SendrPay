import { BotContext } from "../bot";
import { prisma } from "../infra/prisma";
import { logger } from "../infra/logger";

// Command to link a private group (use in DM)
export async function commandLinkGroup(ctx: BotContext) {
  try {
    // Ensure this is used in DM
    if (ctx.chat?.type !== "private") {
      return ctx.reply("❌ This command must be used in DM.");
    }

    const userId = ctx.from?.id.toString();
    if (!userId) {
      return ctx.reply("❌ Could not identify user.");
    }

    // Get user and check if they have KOL settings
    const user = await prisma.user.findUnique({
      where: { telegramId: userId },
      include: { kolSettings: true }
    });

    if (!user) {
      return ctx.reply("❌ Please start the bot first with /start.");
    }

    if (!user.kolSettings) {
      return ctx.reply("❌ Please configure your KOL settings first with /setup.");
    }

    if (!user.kolSettings.groupAccessEnabled) {
      return ctx.reply("❌ You haven't enabled paid group access. Use /setup to configure it.");
    }

    // Set up session to await group username
    (ctx.session as any).linkingGroup = true;

    await ctx.reply(
      `🔗 **Link Private Group**\n\n` +
      `To link your private group:\n\n` +
      `1. Add me as an admin to your group\n` +
      `2. Grant me "Invite Users" permission\n` +
      `3. Send me your group username or invite link\n\n` +
      `**Enter your group username or invite link:**`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    logger.error("Link group command error:", error);
    await ctx.reply("❌ Failed to initiate group linking. Please try again.");
  }
}

// Handle group username/link input for linking
export async function handleGroupLinkInput(ctx: BotContext) {
  try {
    const session = ctx.session as any;
    if (!session.linkingGroup) return;

    const text = ctx.message?.text?.trim();
    if (!text) return;

    const userId = ctx.from?.id.toString();
    if (!userId) {
      return ctx.reply("❌ Could not identify user.");
    }

    // Get user with KOL settings
    const user = await prisma.user.findUnique({
      where: { telegramId: userId },
      include: { kolSettings: true }
    });

    if (!user?.kolSettings) {
      delete session.linkingGroup;
      return ctx.reply("❌ KOL settings not found. Please run /setup first.");
    }

    let groupId: string | null = null;
    let groupTitle: string = "Unknown Group";

    try {
      // Handle invite links
      if (text.includes('t.me/')) {
        // For invite links, we need to try joining first
        return ctx.reply(
          `❌ Please provide the group username (e.g., @yourgroup) instead of an invite link.\n\n` +
          `Or use /linkgroup command directly in your group after adding me as admin.`,
          { parse_mode: "Markdown" }
        );
      }

      // Clean up group username (ensure it starts with @)
      const groupUsername = text.startsWith('@') ? text : `@${text}`;
      
      // Get chat info
      const chat = await ctx.api.getChat(groupUsername);
      
      if (chat.type !== "group" && chat.type !== "supergroup") {
        return ctx.reply("❌ This is not a group. Please provide a group username.");
      }

      groupId = String(chat.id);
      groupTitle = chat.title || "Unknown Group";

      // Check if bot is admin
      const botMember = await ctx.api.getChatMember(groupId, ctx.me.id);
      if (botMember.status !== "administrator") {
        return ctx.reply(
          `❌ I'm not an admin in **${groupTitle}**.\n\n` +
          `Please:\n` +
          `1. Add me as an admin to the group\n` +
          `2. Grant me "Invite Users" permission\n` +
          `3. Then send the group username again`,
          { parse_mode: "Markdown" }
        );
      }

      // Check for invite permission
      if (!botMember.can_invite_users) {
        return ctx.reply(
          `❌ I don't have "Invite Users" permission in **${groupTitle}**.\n\n` +
          `Please grant me this permission and try again.`,
          { parse_mode: "Markdown" }
        );
      }

      // Check if user is admin in the group
      const userMember = await ctx.api.getChatMember(groupId, parseInt(userId));
      if (userMember.status !== "administrator" && userMember.status !== "creator") {
        return ctx.reply(
          `❌ You're not an admin in **${groupTitle}**.\n\n` +
          `Only group admins can link groups for paid access.`,
          { parse_mode: "Markdown" }
        );
      }

    } catch (error: any) {
      if (error.error_code === 400 && error.description?.includes("not found")) {
        return ctx.reply(
          `❌ Group not found.\n\n` +
          `Make sure you:\n` +
          `1. Added me as an admin first\n` +
          `2. Used the correct username (e.g., @yourgroup)`,
          { parse_mode: "Markdown" }
        );
      }
      logger.error("Error checking group:", error);
      return ctx.reply("❌ Could not verify group. Make sure I'm added as an admin first.");
    }

    // Link the group
    await prisma.kolSettings.update({
      where: { userId: user.id },
      data: {
        privateGroupChatId: groupId
      }
    });

    // Clear session
    delete session.linkingGroup;

    const priceDisplay = parseFloat(user.kolSettings.groupAccessPrice!) / Math.pow(10, 
      user.kolSettings.groupAccessToken === 'SOL' ? 9 : 6
    );

    await ctx.reply(
      `✅ **Group Linked Successfully!**\n\n` +
      `**${groupTitle}** is now linked to your KOL account.\n\n` +
      `**Settings:**\n` +
      `• Payment Token: ${user.kolSettings.groupAccessToken}\n` +
      `• Access Price: ${priceDisplay} ${user.kolSettings.groupAccessToken}\n` +
      `• Platform Fee: 5%\n\n` +
      `Users can now pay to join this group through:\n` +
      `/kol @${ctx.from?.username || userId}`,
      { parse_mode: "Markdown" }
    );

    logger.info(`Group linked: ${groupId} to user ${userId}`);
  } catch (error) {
    logger.error("Group link input error:", error);
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