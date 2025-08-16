import { BotContext } from "../bot";
import { InlineKeyboard } from "grammy";
import { prisma } from "../infra/prisma";
import { logger } from "../infra/logger";
import { resolveToken } from "../core/tokens";

// KOL setup flow state management
interface SetupState {
  step: 'main' | 'tip_tokens' | 'group_setup' | 'group_price' | 'group_link';
  tipTokens?: string[];
  groupToken?: string;
  groupPrice?: number;
}

// Main setup command
export async function commandSetup(ctx: BotContext) {
  try {
    const userId = ctx.from?.id.toString();
    if (!userId) {
      return ctx.reply("❌ Could not identify user.");
    }

    // Get or create user
    const user = await prisma.user.findUnique({
      where: { telegramId: userId },
      include: { kolSettings: true, wallets: true }
    });

    if (!user) {
      return ctx.reply("❌ Please start the bot first with /start");
    }

    if (!user.wallets?.length) {
      return ctx.reply("❌ You need to create a wallet first. Use /start to set up your wallet.");
    }

    // Mark user as KOL if not already
    if (!user.isKol) {
      await prisma.user.update({
        where: { id: user.id },
        data: { isKol: true }
      });
    }

    // Show current settings if they exist
    if (user.kolSettings) {
      return showCurrentSettings(ctx, user.kolSettings);
    }

    // Start new setup
    return showSetupMenu(ctx);
  } catch (error) {
    logger.error("Setup command error:", error);
    await ctx.reply("❌ An error occurred. Please try again.");
  }
}

// Show main setup menu
async function showSetupMenu(ctx: BotContext) {
  const keyboard = new InlineKeyboard()
    .text("💸 Configure Tip Tokens", "setup_tip_tokens")
    .row()
    .text("🔐 Setup Private Group", "setup_group")
    .row()
    .text("📊 View Current Settings", "setup_view")
    .row()
    .text("❌ Cancel", "setup_cancel");

  await ctx.reply(
    `⚙️ **KOL Payment Setup**

Welcome to the KOL configuration panel! Here you can:

• Configure which tokens you accept for tips
• Set up paid access to your private group
• Manage your payment preferences

Choose an option to get started:`,
    {
      parse_mode: "Markdown",
      reply_markup: keyboard
    }
  );
}

// Show current KOL settings
async function showCurrentSettings(ctx: BotContext, settings: any) {
  let settingsText = `📊 **Your Current Settings**\n\n`;

  if (settings.acceptedTipTokens?.length > 0) {
    settingsText += `💸 **Accepted Tip Tokens:**\n`;
    for (const token of settings.acceptedTipTokens) {
      settingsText += `  • ${token}\n`;
    }
  } else {
    settingsText += `💸 **Tips:** Not configured\n`;
  }

  if (settings.groupAccessEnabled && settings.groupAccessToken && settings.groupAccessPrice) {
    const token = await resolveToken(settings.groupAccessToken);
    const price = parseFloat(settings.groupAccessPrice) / Math.pow(10, token?.decimals || 6);
    settingsText += `\n🔐 **Private Group:**\n`;
    settingsText += `  • Price: ${price} ${settings.groupAccessToken}\n`;
    if (settings.privateGroupChatId) {
      settingsText += `  • Group: Connected ✅\n`;
    } else {
      settingsText += `  • Group: Not linked ⚠️\n`;
    }
  } else {
    settingsText += `\n🔐 **Private Group:** Not configured\n`;
  }

  settingsText += `\n_Platform fees: 2% on tips, 5% on group access_`;

  const keyboard = new InlineKeyboard()
    .text("✏️ Edit Settings", "setup_edit")
    .row()
    .text("🗑️ Reset All", "setup_reset")
    .row()
    .text("✅ Done", "setup_done");

  await ctx.reply(settingsText, {
    parse_mode: "Markdown",
    reply_markup: keyboard
  });
}

// Handle tip token selection
export async function handleTipTokenSetup(ctx: BotContext) {
  const keyboard = new InlineKeyboard()
    .text("💵 USDC", "setup_select_tip_USDC")
    .text("⚡ SOL", "setup_select_tip_SOL")
    .row()
    .text("🐕 BONK", "setup_select_tip_BONK")
    .text("🪐 JUP", "setup_select_tip_JUP")
    .row()
    .text("✅ Confirm Selection", "setup_confirm_tip_tokens")
    .row()
    .text("↩️ Back", "setup_back");

  await ctx.editMessageText(
    `💸 **Select Tip Tokens**

Choose which tokens you want to accept for tips.
You can select multiple tokens.

_Selected tokens will have a ✓ mark_`,
    {
      parse_mode: "Markdown",
      reply_markup: keyboard
    }
  );
}

// Handle group setup
export async function handleGroupSetup(ctx: BotContext) {
  const keyboard = new InlineKeyboard()
    .text("💵 USDC", "setup_group_token_USDC")
    .text("⚡ SOL", "setup_group_token_SOL")
    .row()
    .text("❌ Disable Group Access", "setup_group_disable")
    .row()
    .text("↩️ Back", "setup_back");

  await ctx.editMessageText(
    `🔐 **Private Group Setup**

Set up paid access to your private Telegram group.

**Step 1:** Choose the payment token
**Step 2:** Set the access price
**Step 3:** Link your private group

Select a token for group payments:`,
    {
      parse_mode: "Markdown",
      reply_markup: keyboard
    }
  );
}

// Handle callback queries for setup
export async function handleSetupCallbacks(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith("setup_")) return;

  const userId = ctx.from?.id.toString();
  if (!userId) {
    return ctx.answerCallbackQuery("❌ Could not identify user.");
  }

  try {
    // Get user with KOL settings
    const user = await prisma.user.findUnique({
      where: { telegramId: userId },
      include: { kolSettings: true }
    });

    if (!user) {
      return ctx.answerCallbackQuery("❌ User not found.");
    }

    // Handle different setup actions
    switch (data) {
      case "setup_tip_tokens":
        await ctx.answerCallbackQuery();
        return handleTipTokenSetup(ctx);

      case "setup_group":
        await ctx.answerCallbackQuery();
        return handleGroupSetup(ctx);

      case "setup_view":
        await ctx.answerCallbackQuery();
        if (user.kolSettings) {
          return showCurrentSettings(ctx, user.kolSettings);
        } else {
          await ctx.editMessageText("No settings configured yet. Use the menu to set up your preferences.");
          return showSetupMenu(ctx);
        }

      case "setup_cancel":
      case "setup_done":
        await ctx.answerCallbackQuery("Setup complete!");
        return ctx.deleteMessage();

      case "setup_edit":
        await ctx.answerCallbackQuery();
        return showSetupMenu(ctx);

      case "setup_back":
        await ctx.answerCallbackQuery();
        return showSetupMenu(ctx);

      default:
        // Handle token selection and other setup steps
        if (data.startsWith("setup_select_tip_")) {
          return handleTipTokenSelection(ctx, data.replace("setup_select_tip_", ""));
        } else if (data.startsWith("setup_group_token_")) {
          return handleGroupTokenSelection(ctx, data.replace("setup_group_token_", ""));
        } else if (data === "setup_confirm_tip_tokens") {
          return saveTipTokens(ctx);
        } else if (data === "setup_group_disable") {
          return disableGroupAccess(ctx);
        } else if (data === "setup_reset") {
          return resetKolSettings(ctx);
        }
    }

    await ctx.answerCallbackQuery();
  } catch (error) {
    logger.error("Setup callback error:", error);
    await ctx.answerCallbackQuery("❌ An error occurred.");
  }
}

// Handle tip token selection (toggle)
async function handleTipTokenSelection(ctx: BotContext, token: string) {
  const session = ctx.session as any;
  if (!session.setupTipTokens) {
    session.setupTipTokens = [];
  }

  // Toggle token selection
  const index = session.setupTipTokens.indexOf(token);
  if (index > -1) {
    session.setupTipTokens.splice(index, 1);
  } else {
    session.setupTipTokens.push(token);
  }

  // Update keyboard with checkmarks
  const keyboard = new InlineKeyboard();
  const tokens = ["USDC", "SOL", "BONK", "JUP"];
  
  for (let i = 0; i < tokens.length; i += 2) {
    const token1 = tokens[i];
    const token2 = tokens[i + 1];
    
    const selected1 = session.setupTipTokens.includes(token1);
    const selected2 = token2 && session.setupTipTokens.includes(token2);
    
    const label1 = `${selected1 ? "✓ " : ""}${getTokenIcon(token1)} ${token1}`;
    const label2 = token2 ? `${selected2 ? "✓ " : ""}${getTokenIcon(token2)} ${token2}` : "";
    
    keyboard.text(label1, `setup_select_tip_${token1}`);
    if (token2) {
      keyboard.text(label2, `setup_select_tip_${token2}`);
    }
    keyboard.row();
  }

  keyboard
    .text("✅ Confirm Selection", "setup_confirm_tip_tokens")
    .row()
    .text("↩️ Back", "setup_back");

  const isSelected = session.setupTipTokens.includes(token);
  await ctx.answerCallbackQuery(isSelected ? `${token} added` : `${token} removed`);
  
  await ctx.editMessageText(
    `💸 **Select Tip Tokens**

Choose which tokens you want to accept for tips.

Selected: ${session.setupTipTokens.length > 0 ? session.setupTipTokens.join(", ") : "None"}`,
    {
      parse_mode: "Markdown",
      reply_markup: keyboard
    }
  );
}

// Save selected tip tokens
async function saveTipTokens(ctx: BotContext) {
  const session = ctx.session as any;
  const tipTokens = session.setupTipTokens || [];

  if (tipTokens.length === 0) {
    return ctx.answerCallbackQuery("Please select at least one token");
  }

  const userId = ctx.from?.id.toString();
  if (!userId) {
    return ctx.answerCallbackQuery("❌ Could not identify user.");
  }

  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: userId }
    });

    if (!user) {
      return ctx.answerCallbackQuery("❌ User not found.");
    }

    // Create or update KOL settings
    await prisma.kolSettings.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        acceptedTipTokens: tipTokens
      },
      update: {
        acceptedTipTokens: tipTokens
      }
    });

    // Clear session
    delete session.setupTipTokens;

    await ctx.answerCallbackQuery("✅ Tip tokens configured!");
    
    const settings = await prisma.kolSettings.findUnique({
      where: { userId: user.id }
    });
    
    return showCurrentSettings(ctx, settings);
  } catch (error) {
    logger.error("Save tip tokens error:", error);
    return ctx.answerCallbackQuery("❌ Failed to save settings.");
  }
}

// Handle group token selection
async function handleGroupTokenSelection(ctx: BotContext, token: string) {
  const session = ctx.session as any;
  session.setupGroupToken = token;

  // Ask for price
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `💰 **Set Group Access Price**

You've selected **${token}** as the payment token.

Please reply with the price for group access (e.g., "1" for 1 ${token}, "0.5" for 0.5 ${token}).

_Note: Platform will take 5% fee from group payments_`,
    {
      parse_mode: "Markdown"
    }
  );

  // Set a flag to expect price input
  session.expectingGroupPrice = true;
}

// Disable group access
async function disableGroupAccess(ctx: BotContext) {
  const userId = ctx.from?.id.toString();
  if (!userId) {
    return ctx.answerCallbackQuery("❌ Could not identify user.");
  }

  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: userId }
    });

    if (!user) {
      return ctx.answerCallbackQuery("❌ User not found.");
    }

    await prisma.kolSettings.update({
      where: { userId: user.id },
      data: {
        groupAccessEnabled: false,
        groupAccessToken: null,
        groupAccessPrice: null,
        privateGroupChatId: null
      }
    });

    await ctx.answerCallbackQuery("✅ Group access disabled");
    
    const settings = await prisma.kolSettings.findUnique({
      where: { userId: user.id }
    });
    
    return showCurrentSettings(ctx, settings);
  } catch (error) {
    logger.error("Disable group access error:", error);
    return ctx.answerCallbackQuery("❌ Failed to disable group access.");
  }
}

// Reset all KOL settings
async function resetKolSettings(ctx: BotContext) {
  const userId = ctx.from?.id.toString();
  if (!userId) {
    return ctx.answerCallbackQuery("❌ Could not identify user.");
  }

  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: userId }
    });

    if (!user) {
      return ctx.answerCallbackQuery("❌ User not found.");
    }

    await prisma.kolSettings.delete({
      where: { userId: user.id }
    });

    await ctx.answerCallbackQuery("✅ Settings reset");
    return showSetupMenu(ctx);
  } catch (error) {
    logger.error("Reset settings error:", error);
    return ctx.answerCallbackQuery("❌ Failed to reset settings.");
  }
}

// Helper to get token icon
function getTokenIcon(token: string): string {
  const icons: Record<string, string> = {
    "USDC": "💵",
    "SOL": "⚡",
    "BONK": "🐕",
    "JUP": "🪐",
    "WSOL": "🌊"
  };
  return icons[token] || "🪙";
}

// Handle message input for group price
export async function handleGroupPriceInput(ctx: BotContext) {
  const session = ctx.session as any;
  
  if (!session.expectingGroupPrice || !session.setupGroupToken) {
    return;
  }

  const priceText = ctx.message?.text;
  if (!priceText) return;

  const price = parseFloat(priceText);
  if (isNaN(price) || price <= 0) {
    return ctx.reply("❌ Please enter a valid positive number for the price.");
  }

  const userId = ctx.from?.id.toString();
  if (!userId) {
    return ctx.reply("❌ Could not identify user.");
  }

  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: userId }
    });

    if (!user) {
      return ctx.reply("❌ User not found.");
    }

    // Get token info for conversion to raw units
    const token = await resolveToken(session.setupGroupToken);
    if (!token) {
      return ctx.reply("❌ Invalid token.");
    }

    const priceRaw = BigInt(Math.floor(price * Math.pow(10, token.decimals)));

    // Save group settings
    await prisma.kolSettings.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        groupAccessEnabled: true,
        groupAccessToken: session.setupGroupToken,
        groupAccessPrice: priceRaw.toString()
      },
      update: {
        groupAccessEnabled: true,
        groupAccessToken: session.setupGroupToken,
        groupAccessPrice: priceRaw.toString()
      }
    });

    // Clear session
    delete session.expectingGroupPrice;
    delete session.setupGroupToken;

    // Provide instructions for linking group
    const keyboard = new InlineKeyboard()
      .text("✅ Done", "setup_done");

    await ctx.reply(
      `✅ **Group Price Set!**

Price: ${price} ${session.setupGroupToken}

**Next Step: Link Your Private Group**

1. Add @${ctx.me.username} as an admin in your private group
2. Make sure the bot has "Invite Users" permission
3. Use /linkgroup command in your private group

Once linked, users will be able to pay to join your group!`,
      {
        parse_mode: "Markdown",
        reply_markup: keyboard
      }
    );
  } catch (error) {
    logger.error("Set group price error:", error);
    await ctx.reply("❌ Failed to save group price.");
  }
}