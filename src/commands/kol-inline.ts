import { Bot, InlineKeyboard } from "grammy";
import { BotContext } from "../bot";
import { PrismaClient } from "@prisma/client";
const logger = {
  error: (msg: string, error?: any) => console.error(msg, error),
  info: (msg: string, data?: any) => console.log(msg, data)
};

const prisma = new PrismaClient();

// KOL Profile command with inline buttons
export async function commandKolProfile(ctx: BotContext) {
  try {
    if (ctx.chat?.type !== "private") {
      return ctx.reply("❌ Use this command in DM only.");
    }

    // Extract username from command or reply
    let targetUsername: string | undefined;
    
    if (ctx.message?.reply_to_message?.from?.username) {
      targetUsername = ctx.message.reply_to_message.from.username;
    } else if (ctx.match) {
      const match = ctx.match.toString().trim();
      if (match.startsWith("@")) {
        targetUsername = match.substring(1);
      } else if (match) {
        targetUsername = match;
      }
    }

    if (!targetUsername) {
      return ctx.reply(
        "❌ Please specify a username:\n\n" +
        "• `/kol @username`\n" +
        "• Reply to their message with `/kol`\n" +
        "• `/kol username`",
        { parse_mode: "Markdown" }
      );
    }

    // Find user by handle (username)
    const targetUser = await prisma.user.findFirst({
      where: { handle: targetUsername },
      include: { kolSettings: true }
    });

    if (!targetUser) {
      return ctx.reply(`❌ User @${targetUsername} not found in our system.`);
    }

    if (!targetUser.kolSettings) {
      return ctx.reply(`❌ @${targetUsername} hasn't set up KOL features yet.`);
    }

    const isOwnProfile = ctx.from?.id === parseInt(targetUser.telegramId || "0");
    
    await displayKolProfile(ctx, targetUser, isOwnProfile);

  } catch (error) {
    logger.error("Error in KOL profile command:", error);
    await ctx.reply("❌ Error loading KOL profile. Please try again.");
  }
}

// Display KOL profile with interactive buttons
async function displayKolProfile(ctx: BotContext, user: any, isOwnProfile: boolean) {
  const settings = user.kolSettings;
  
  // Build tip buttons
  const keyboard = new InlineKeyboard();
  
  if (settings.acceptedTipTokens && settings.acceptedTipTokens.length > 0) {
    keyboard.text("💖 Send Tip", `tip_select:${user.telegramId}`).row();
  }
  
  // Group access button
  if (settings.groupAccessEnabled && settings.privateGroupChatId) {
    const price = convertFromRawUnits(settings.groupAccessPrice, settings.groupAccessToken);
    keyboard.text(`🎭 Join Group (${price} ${settings.groupAccessToken})`, `group_join:${user.telegramId}`).row();
  }
  
  // Settings button for own profile
  if (isOwnProfile) {
    keyboard.text("⚙️ Manage Settings", `kol_settings:${user.telegramId}`).row();
  }
  
  // Profile info
  const profileText = 
    `👑 **KOL Profile: @${user.handle}**\n\n` +
    `💖 **Tip Options:**\n` +
    `${settings.acceptedTipTokens?.length > 0 ? 
      settings.acceptedTipTokens.map(token => `• ${token}`).join("\n") : 
      "• Not accepting tips"}\n\n` +
    `🎭 **Private Group:**\n` +
    `${settings.groupAccessEnabled && settings.privateGroupChatId ? 
      `• Access: ${convertFromRawUnits(settings.groupAccessPrice, settings.groupAccessToken)} ${settings.groupAccessToken}` : 
      "• No private group available"}\n\n` +
    `${isOwnProfile ? "_Use the buttons below to tip or manage your settings._" : "_Use the buttons below to interact with this KOL._"}`;

  await ctx.reply(profileText, { 
    parse_mode: "Markdown",
    reply_markup: keyboard
  });
}

// KOL Setup command with inline workflow
export async function commandKolSetup(ctx: BotContext) {
  try {
    if (ctx.chat?.type !== "private") {
      return ctx.reply("❌ Use this command in DM only.");
    }

    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { telegramId: String(telegramId) },
      include: { kolSettings: true }
    });

    if (!user) {
      return ctx.reply("❌ Please use /start first to create your account.");
    }

    // Show setup interface
    await showKolSetupMenu(ctx, user);

  } catch (error) {
    logger.error("Error in KOL setup:", error);
    await ctx.reply("❌ Error accessing KOL setup. Please try again.");
  }
}

// Main KOL setup menu
async function showKolSetupMenu(ctx: BotContext, user: any) {
  const settings = user.kolSettings;
  
  const keyboard = new InlineKeyboard()
    .text("💖 Tip Settings", `setup_tips:${user.telegramId}`).row()
    .text("🎭 Group Settings", `setup_group:${user.telegramId}`).row()
    .text("📊 View Profile", `view_profile:${user.telegramId}`).row();

  const setupText = 
    `⚙️ **KOL Setup Menu**\n\n` +
    `**Current Status:**\n` +
    `• Tips: ${settings?.acceptedTipTokens?.length > 0 ? "✅ Enabled" : "❌ Disabled"}\n` +
    `• Group Access: ${settings?.groupAccessEnabled ? "✅ Enabled" : "❌ Disabled"}\n\n` +
    `Choose what to configure:`;

  if (ctx.callbackQuery) {
    await ctx.editMessageText(setupText, { 
      parse_mode: "Markdown",
      reply_markup: keyboard 
    });
  } else {
    await ctx.reply(setupText, { 
      parse_mode: "Markdown",
      reply_markup: keyboard 
    });
  }
}

// Handle all KOL-related callback queries
export async function handleKolCallbacks(ctx: BotContext) {
  if (!ctx.callbackQuery?.data) return;
  
  const data = ctx.callbackQuery.data;
  
  try {
    if (data.startsWith("setup_tips:")) {
      const userId = data.split(":")[1];
      await showTipSetupMenu(ctx, userId);
    } else if (data.startsWith("setup_group:")) {
      const userId = data.split(":")[1];
      await showGroupSetupMenu(ctx, userId);
    } else if (data.startsWith("view_profile:")) {
      const userId = data.split(":")[1];
      await showProfilePreview(ctx, userId);
    } else if (data.startsWith("tip_token_")) {
      const [, token, userId] = data.split("_");
      await toggleTipToken(ctx, userId, token);
    } else if (data.startsWith("group_toggle:")) {
      const userId = data.split(":")[1];
      await toggleGroupAccess(ctx, userId);
    } else if (data.startsWith("group_price:")) {
      const userId = data.split(":")[1];
      await setGroupPrice(ctx, userId);
    } else if (data.startsWith("group_token:")) {
      const [, token, userId] = data.split(":");
      await setGroupToken(ctx, userId, token);
    } else if (data.startsWith("back_setup:")) {
      const userId = data.split(":")[1];
      const user = await prisma.user.findUnique({
        where: { telegramId: userId },
        include: { kolSettings: true }
      });
      if (user) await showKolSetupMenu(ctx, user);
    } else if (data.startsWith("tip_select:")) {
      const targetUserId = data.split(":")[1];
      await showTipOptions(ctx, targetUserId);
    } else if (data.startsWith("tip_amount:")) {
      const [, amount, token, targetUserId] = data.split(":");
      await processTipPayment(ctx, targetUserId, amount, token);
    } else if (data.startsWith("group_join:")) {
      const targetUserId = data.split(":")[1];
      await processGroupJoin(ctx, targetUserId);
    } else if (data.startsWith("kol_settings:")) {
      const userId = data.split(":")[1];
      const user = await prisma.user.findUnique({
        where: { telegramId: userId },
        include: { kolSettings: true }
      });
      if (user) await showKolSetupMenu(ctx, user);
    } else if (data.startsWith("confirm_tip_payment:")) {
      const [, targetUserId, amount, token] = data.split(":");
      await executeInlineTip(ctx, targetUserId, amount, token);
    } else if (data === "cancel_tip_payment") {
      await ctx.editMessageText("❌ Tip cancelled", { parse_mode: "Markdown" });
    } else if (data.startsWith("confirm_group_join:")) {
      const targetUserId = data.split(":")[1];
      await executeGroupJoin(ctx, targetUserId);
    } else if (data === "cancel_group_join") {
      await ctx.editMessageText("❌ Group join cancelled", { parse_mode: "Markdown" });
    }
    
    await ctx.answerCallbackQuery();
  } catch (error) {
    logger.error("Error handling KOL callback:", error);
    await ctx.answerCallbackQuery("❌ Error processing request");
  }
}

// Tip settings menu
async function showTipSetupMenu(ctx: BotContext, userId: string) {
  const user = await prisma.user.findUnique({
    where: { telegramId: userId },
    include: { kolSettings: true }
  });
  
  if (!user) return;
  
  const settings = user.kolSettings;
  const acceptedTokens = settings?.acceptedTipTokens || [];
  
  const keyboard = new InlineKeyboard();
  
  // Token toggle buttons
  const tokens = ["USDC", "SOL", "BONK", "JUP"];
  tokens.forEach(token => {
    const isEnabled = acceptedTokens.includes(token);
    keyboard.text(
      `${token} ${isEnabled ? "✅" : "❌"}`, 
      `tip_token_${token}_${userId}`
    );
  });
  keyboard.row().text("⬅️ Back", `back_setup:${userId}`);

  const tipText = 
    `💖 **Tip Token Settings**\n\n` +
    `Select which tokens you want to accept for tips:\n\n` +
    `Current tokens: ${acceptedTokens.length > 0 ? acceptedTokens.join(", ") : "None"}\n\n` +
    `Click tokens to toggle on/off:`;

  await ctx.editMessageText(tipText, { 
    parse_mode: "Markdown",
    reply_markup: keyboard 
  });
}

// Group settings menu
async function showGroupSetupMenu(ctx: BotContext, userId: string) {
  const user = await prisma.user.findUnique({
    where: { telegramId: userId },
    include: { kolSettings: true }
  });
  
  if (!user) return;
  
  const settings = user.kolSettings;
  
  const keyboard = new InlineKeyboard()
    .text(
      `Group Access ${settings?.groupAccessEnabled ? "✅" : "❌"}`, 
      `group_toggle:${userId}`
    ).row();
    
  if (settings?.groupAccessEnabled) {
    keyboard.text("💰 Set Price", `group_price:${userId}`).row();
    
    // Token selection
    const tokens = ["USDC", "SOL", "BONK", "JUP"];
    tokens.forEach(token => {
      const isSelected = settings.groupAccessToken === token;
      keyboard.text(
        `${token} ${isSelected ? "🔥" : ""}`, 
        `group_token:${token}:${userId}`
      );
    });
    keyboard.row();
  }
  
  keyboard.text("⬅️ Back", `back_setup:${userId}`);

  const groupText = 
    `🎭 **Group Access Settings**\n\n` +
    `${settings?.groupAccessEnabled ? "✅ Group access is enabled" : "❌ Group access is disabled"}\n\n` +
    `${settings?.groupAccessEnabled ? 
      `• Token: ${settings.groupAccessToken || "Not set"}\n` +
      `• Price: ${settings.groupAccessPrice ? convertFromRawUnits(settings.groupAccessPrice, settings.groupAccessToken || "USDC") : "Not set"}\n` +
      `• Group: ${settings.privateGroupChatId ? "Linked" : "Not linked"}\n\n` +
      `Use /linkgroup in your private group to connect it.` :
      `Enable group access to monetize a private group.`}`;

  await ctx.editMessageText(groupText, { 
    parse_mode: "Markdown",
    reply_markup: keyboard 
  });
}

// Profile preview
async function showProfilePreview(ctx: BotContext, userId: string) {
  const user = await prisma.user.findUnique({
    where: { telegramId: userId },
    include: { kolSettings: true }
  });
  
  if (!user) return;
  
  const keyboard = new InlineKeyboard()
    .text("⬅️ Back to Setup", `back_setup:${userId}`);

  await displayKolProfile(ctx, user, true);
}

// Toggle tip token
async function toggleTipToken(ctx: BotContext, userId: string, token: string) {
  const user = await prisma.user.findUnique({
    where: { telegramId: userId },
    include: { kolSettings: true }
  });
  
  if (!user) return;
  
  let settings = user.kolSettings;
  if (!settings) {
    settings = await prisma.kolSettings.create({
      data: {
        userId: user.id,
        acceptedTipTokens: [],
        groupAccessEnabled: false
      }
    });
  }
  
  const currentTokens = settings.acceptedTipTokens || [];
  const newTokens = currentTokens.includes(token) 
    ? currentTokens.filter(t => t !== token)
    : [...currentTokens, token];
  
  await prisma.kolSettings.update({
    where: { id: settings.id },
    data: { acceptedTipTokens: newTokens }
  });
  
  await showTipSetupMenu(ctx, userId);
}

// Toggle group access
async function toggleGroupAccess(ctx: BotContext, userId: string) {
  const user = await prisma.user.findUnique({
    where: { telegramId: userId },
    include: { kolSettings: true }
  });
  
  if (!user) return;
  
  let settings = user.kolSettings;
  if (!settings) {
    settings = await prisma.kolSettings.create({
      data: {
        userId: user.id,
        acceptedTipTokens: [],
        groupAccessEnabled: false
      }
    });
  }
  
  await prisma.kolSettings.update({
    where: { id: settings.id },
    data: { 
      groupAccessEnabled: !settings.groupAccessEnabled,
      groupAccessToken: settings.groupAccessToken || "USDC",
      groupAccessPrice: settings.groupAccessPrice || "1000000" // 1 USDC default
    }
  });
  
  await showGroupSetupMenu(ctx, userId);
}

// Show tip options for a KOL
async function showTipOptions(ctx: BotContext, targetUserId: string) {
  const targetUser = await prisma.user.findUnique({
    where: { telegramId: targetUserId },
    include: { kolSettings: true }
  });
  
  if (!targetUser?.kolSettings?.acceptedTipTokens) return;
  
  const keyboard = new InlineKeyboard();
  
  // Quick tip amounts for each token
  const amounts = [1, 5, 10, 25, 50, 100];
  
  targetUser.kolSettings.acceptedTipTokens.forEach(token => {
    keyboard.text(`💖 ${token}`, `tip_token_header_${token}`).row();
    amounts.forEach(amount => {
      keyboard.text(`${amount}`, `tip_amount:${amount}:${token}:${targetUserId}`);
    });
    keyboard.row();
  });
  
  const tipText = 
    `💖 **Send Tip to @${targetUser.handle}**\n\n` +
    `Choose amount and token:\n\n` +
    `_Platform fee: 2% (deducted from recipient)_`;

  await ctx.editMessageText(tipText, { 
    parse_mode: "Markdown",
    reply_markup: keyboard 
  });
}

// Process tip payment - integrates with existing tip system
async function processTipPayment(ctx: BotContext, targetUserId: string, amount: string, token: string) {
  try {
    const senderId = ctx.from?.id;
    if (!senderId) return;

    // Find sender
    const sender = await prisma.user.findUnique({
      where: { telegramId: String(senderId) }
    });

    if (!sender?.activeWalletId) {
      return ctx.editMessageText("❌ You need to create a wallet first using /start");
    }

    // Find recipient  
    const recipient = await prisma.user.findUnique({
      where: { telegramId: targetUserId }
    });

    if (!recipient?.activeWalletId) {
      return ctx.editMessageText("❌ Recipient doesn't have a wallet");
    }

    const numericAmount = parseFloat(amount);
    
    // Create confirmation message
    const keyboard = new InlineKeyboard()
      .text("✅ Confirm Tip", `confirm_tip_payment:${targetUserId}:${amount}:${token}`)
      .text("❌ Cancel", "cancel_tip_payment").row();

    await ctx.editMessageText(
      `💖 **Confirm Tip**\n\n` +
      `To: @${recipient.handle}\n` +
      `Amount: ${amount} ${token}\n` +
      `Platform fee: 2% (${(numericAmount * 0.02).toFixed(4)} ${token})\n\n` +
      `Total cost: ${amount} ${token}\n` +
      `Recipient gets: ${(numericAmount * 0.98).toFixed(4)} ${token}`,
      { 
        parse_mode: "Markdown",
        reply_markup: keyboard
      }
    );
  } catch (error) {
    logger.error("Error processing tip payment:", error);
    await ctx.editMessageText("❌ Error processing tip. Please try again.");
  }
}

// Process group join - integrates with existing group access system
async function processGroupJoin(ctx: BotContext, targetUserId: string) {
  try {
    const buyerId = ctx.from?.id;
    if (!buyerId) return;

    // Find KOL user with group settings
    const kolUser = await prisma.user.findUnique({
      where: { telegramId: targetUserId },
      include: { kolSettings: true }
    });

    if (!kolUser?.kolSettings?.groupAccessEnabled || !kolUser.kolSettings.privateGroupChatId) {
      return ctx.editMessageText("❌ Group access not available");
    }

    // Find buyer
    const buyer = await prisma.user.findUnique({
      where: { telegramId: String(buyerId) }
    });

    if (!buyer?.activeWalletId) {
      return ctx.editMessageText("❌ You need to create a wallet first using /start");
    }

    const price = convertFromRawUnits(kolUser.kolSettings.groupAccessPrice!, kolUser.kolSettings.groupAccessToken!);
    const platformFee = price * 0.05; // 5% fee for group access
    
    const keyboard = new InlineKeyboard()
      .text("✅ Confirm Purchase", `confirm_group_join:${targetUserId}`)
      .text("❌ Cancel", "cancel_group_join").row();

    await ctx.editMessageText(
      `🎭 **Join Private Group**\n\n` +
      `KOL: @${kolUser.handle}\n` +
      `Price: ${price} ${kolUser.kolSettings.groupAccessToken}\n` +
      `Platform fee: 5% (${platformFee.toFixed(4)} ${kolUser.kolSettings.groupAccessToken})\n\n` +
      `Total cost: ${price} ${kolUser.kolSettings.groupAccessToken}\n` +
      `KOL receives: ${(price * 0.95).toFixed(4)} ${kolUser.kolSettings.groupAccessToken}`,
      { 
        parse_mode: "Markdown",
        reply_markup: keyboard
      }
    );
  } catch (error) {
    logger.error("Error processing group join:", error);
    await ctx.editMessageText("❌ Error processing group access. Please try again.");
  }
}

// Set group price (would need text input handling)
async function setGroupPrice(ctx: BotContext, userId: string) {
  await ctx.editMessageText(
    `💰 **Set Group Price**\n\n` +
    `Please type the new price amount in chat.\n` +
    `_This would require session-based input handling._`,
    { parse_mode: "Markdown" }
  );
}

// Set group token
async function setGroupToken(ctx: BotContext, userId: string, token: string) {
  const user = await prisma.user.findUnique({
    where: { telegramId: userId },
    include: { kolSettings: true }
  });
  
  if (!user?.kolSettings) return;
  
  await prisma.kolSettings.update({
    where: { id: user.kolSettings.id },
    data: { groupAccessToken: token }
  });
  
  await showGroupSetupMenu(ctx, userId);
}

// Utility functions
function convertFromRawUnits(rawAmount: string, token: string): number {
  const decimals: Record<string, number> = {
    "USDC": 6,
    "SOL": 9,
    "BONK": 5,
    "JUP": 6
  };
  
  const decimal = decimals[token] || 6;
  return parseFloat(rawAmount) / Math.pow(10, decimal);
}

function convertToRawUnits(amount: number, token: string): string {
  const decimals: Record<string, number> = {
    "USDC": 6,
    "SOL": 9,
    "BONK": 5,
    "JUP": 6
  };
  
  const decimal = decimals[token] || 6;
  return String(Math.floor(amount * Math.pow(10, decimal)));
}

// Execute inline tip payment
async function executeInlineTip(ctx: BotContext, targetUserId: string, amount: string, token: string) {
  await ctx.editMessageText(
    `⏳ Processing tip payment...\n\n` +
    `Amount: ${amount} ${token}\n` +
    `This will integrate with the existing transfer system.`,
    { parse_mode: "Markdown" }
  );
  
  // TODO: Integrate with existing tip/transfer system
  // Call the existing tip processing function here
}

// Execute group join payment
async function executeGroupJoin(ctx: BotContext, targetUserId: string) {
  await ctx.editMessageText(
    `⏳ Processing group access purchase...\n\n` +
    `This will integrate with the existing group access system.`,
    { parse_mode: "Markdown" }
  );
  
  // TODO: Integrate with existing group access system
  // Call the existing group join processing function here
}