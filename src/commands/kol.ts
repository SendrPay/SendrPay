import { BotContext } from "../bot";
import { InlineKeyboard } from "grammy";
import { prisma } from "../infra/prisma";
import { logger } from "../infra/logger";
import { resolveToken } from "../core/tokens";
import { getWalletBalance } from "../core/wallets";
import { checkRateLimit } from "../core/rate-limiter";
import { calculatePlatformFee, executePaymentWithPlatformFee } from "../core/platform-fees";
import { sendPaymentNotification } from "../core/notifications-simple";
import { env } from "../infra/env";

// Display KOL profile with inline payment buttons
export async function commandKolProfile(ctx: BotContext) {
  try {
    const args = ctx.message?.text?.split(" ") || [];
    let kolHandle = args[1]?.replace("@", "");

    // If no handle provided, show own profile if user is a KOL
    if (!kolHandle) {
      const userId = ctx.from?.id.toString();
      if (!userId) {
        return ctx.reply("❌ Please specify a KOL username: /kol @username");
      }

      const user = await prisma.user.findUnique({
        where: { telegramId: userId },
        include: { kolSettings: true }
      });

      if (!user?.isKol || !user.kolSettings) {
        return ctx.reply("❌ You are not a registered KOL. Use /setup to configure KOL settings.");
      }

      kolHandle = user.handle || "";
    }

    // Find KOL by handle
    const kol = await prisma.user.findFirst({
      where: {
        handle: {
          equals: kolHandle,
          mode: 'insensitive'
        },
        isKol: true
      },
      include: {
        kolSettings: true,
        wallets: { where: { isActive: true } }
      }
    });

    if (!kol || !kol.kolSettings) {
      return ctx.reply(`❌ KOL @${kolHandle} not found or hasn't configured payment settings.`);
    }

    // Build profile message
    let profileText = `👤 **KOL Profile: @${kol.handle}**\n\n`;
    
    // Add tip information
    if (kol.kolSettings.acceptedTipTokens?.length > 0) {
      profileText += `💸 **Accepts Tips In:**\n`;
      for (const token of kol.kolSettings.acceptedTipTokens) {
        profileText += `  • ${token}\n`;
      }
    }

    // Add group information
    if (kol.kolSettings.groupAccessEnabled && kol.kolSettings.groupAccessToken && kol.kolSettings.groupAccessPrice) {
      const token = await resolveToken(kol.kolSettings.groupAccessToken);
      const price = parseFloat(kol.kolSettings.groupAccessPrice) / Math.pow(10, token?.decimals || 6);
      profileText += `\n🔐 **Private Group:**\n`;
      profileText += `  • Price: ${price} ${kol.kolSettings.groupAccessToken}\n`;
      profileText += `  • Platform Fee: 5%\n`;
    }

    // Build inline keyboard
    const keyboard = new InlineKeyboard();

    // Add tip buttons
    if (kol.kolSettings.acceptedTipTokens?.length > 0) {
      for (const tokenTicker of kol.kolSettings.acceptedTipTokens) {
        keyboard.text(
          `💸 Tip in ${tokenTicker}`,
          `tip_${kol.telegramId}_${tokenTicker}`
        );
        keyboard.row();
      }
    }

    // Add group join button
    if (kol.kolSettings.groupAccessEnabled && kol.kolSettings.groupAccessToken && kol.kolSettings.privateGroupChatId) {
      const token = await resolveToken(kol.kolSettings.groupAccessToken);
      const price = parseFloat(kol.kolSettings.groupAccessPrice!) / Math.pow(10, token?.decimals || 6);
      keyboard.text(
        `🔐 Join Group (${price} ${kol.kolSettings.groupAccessToken})`,
        `join_${kol.telegramId}_${kol.kolSettings.groupAccessToken}`
      );
    }

    await ctx.reply(profileText, {
      parse_mode: "Markdown",
      reply_markup: keyboard
    });

  } catch (error) {
    logger.error("KOL profile command error:", error);
    await ctx.reply("❌ Failed to load KOL profile.");
  }
}

// Handle tip button clicks
export async function handleTipCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith("tip_")) return;

  try {
    const [_, kolId, tokenTicker] = data.split("_");
    const userId = ctx.from?.id.toString();
    
    if (!userId) {
      return ctx.answerCallbackQuery("❌ Could not identify user.");
    }

    // Store tip intent in session
    const session = ctx.session as any;
    session.tipIntent = {
      kolId,
      tokenTicker,
      step: 'amount'
    };

    await ctx.answerCallbackQuery();

    // Ask for amount with quick options
    const keyboard = new InlineKeyboard()
      .text("1", "tip_amount_1")
      .text("5", "tip_amount_5")
      .text("10", "tip_amount_10")
      .row()
      .text("25", "tip_amount_25")
      .text("50", "tip_amount_50")
      .text("100", "tip_amount_100")
      .row()
      .text("Custom Amount", "tip_amount_custom")
      .row()
      .text("❌ Cancel", "tip_cancel");

    await ctx.editMessageText(
      `💸 **Send Tip in ${tokenTicker}**

Select an amount or choose custom to enter your own:`,
      {
        parse_mode: "Markdown",
        reply_markup: keyboard
      }
    );
  } catch (error) {
    logger.error("Tip callback error:", error);
    await ctx.answerCallbackQuery("❌ An error occurred.");
  }
}

// Handle tip amount selection
export async function handleTipAmountCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith("tip_amount_")) return;

  const session = ctx.session as any;
  if (!session.tipIntent) {
    return ctx.answerCallbackQuery("❌ Tip session expired. Please start again.");
  }

  try {
    const amount = data.replace("tip_amount_", "");
    
    if (amount === "custom") {
      session.tipIntent.step = 'custom_amount';
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        `💸 **Enter Custom Tip Amount**

Please reply with the amount you want to tip in ${session.tipIntent.tokenTicker}.

Example: 15.5`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    // Process tip with selected amount
    await processTip(ctx, parseFloat(amount));
  } catch (error) {
    logger.error("Tip amount callback error:", error);
    await ctx.answerCallbackQuery("❌ An error occurred.");
  }
}

// Process the tip payment
async function processTip(ctx: BotContext, amount: number) {
  const session = ctx.session as any;
  const tipIntent = session.tipIntent;
  
  if (!tipIntent) {
    return ctx.reply("❌ Tip session expired. Please start again.");
  }

  try {
    const userId = ctx.from?.id.toString();
    if (!userId) {
      return ctx.reply("❌ Could not identify user.");
    }

    // Get sender
    const sender = await prisma.user.findUnique({
      where: { telegramId: userId },
      include: { wallets: { where: { isActive: true } } }
    });

    if (!sender?.wallets?.[0]) {
      await ctx.answerCallbackQuery("❌ You need a wallet first. Use /start");
      return ctx.deleteMessage();
    }

    // Get recipient KOL
    const kol = await prisma.user.findUnique({
      where: { telegramId: tipIntent.kolId },
      include: { 
        wallets: { where: { isActive: true } },
        kolSettings: true
      }
    });

    if (!kol?.wallets?.[0]) {
      await ctx.answerCallbackQuery("❌ KOL wallet not found.");
      return ctx.deleteMessage();
    }

    // Get token info
    const token = await resolveToken(tipIntent.tokenTicker);
    if (!token) {
      await ctx.answerCallbackQuery("❌ Invalid token.");
      return ctx.deleteMessage();
    }

    // Calculate amounts with platform fee (2% for tips)
    const amountRaw = BigInt(Math.floor(amount * Math.pow(10, token.decimals)));
    const platformFee = calculatePlatformFee(amountRaw, 'tip');
    const netAmount = amountRaw - platformFee;

    // Check balance
    const balance = await getWalletBalance(sender.wallets[0].address);
    const tokenBalance = balance.find(b => b.mint === token.mint);
    
    if (!tokenBalance || BigInt(tokenBalance.amount) < amountRaw) {
      await ctx.answerCallbackQuery("❌ Insufficient balance.");
      return ctx.deleteMessage();
    }

    // Show confirmation
    const keyboard = new InlineKeyboard()
      .text("✅ Confirm", `tip_confirm_${tipIntent.kolId}_${tipIntent.tokenTicker}_${amount}`)
      .text("❌ Cancel", "tip_cancel");

    await ctx.editMessageText(
      `💸 **Confirm Tip**

**Amount:** ${amount} ${tipIntent.tokenTicker}
**To:** @${kol.handle || 'Anonymous'}
**Platform Fee:** ${Number(platformFee) / Math.pow(10, token.decimals)} ${tipIntent.tokenTicker} (2%)
**Creator Receives:** ${Number(netAmount) / Math.pow(10, token.decimals)} ${tipIntent.tokenTicker}

Confirm this tip?`,
      {
        parse_mode: "Markdown",
        reply_markup: keyboard
      }
    );

    // Clear session
    delete session.tipIntent;
  } catch (error) {
    logger.error("Process tip error:", error);
    await ctx.reply("❌ Failed to process tip.");
  }
}

// Handle tip confirmation
export async function handleTipConfirmCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith("tip_confirm_")) return;

  try {
    const parts = data.replace("tip_confirm_", "").split("_");
    const kolId = parts[0];
    const tokenTicker = parts[1];
    const amount = parseFloat(parts[2]);

    const userId = ctx.from?.id.toString();
    if (!userId) {
      return ctx.answerCallbackQuery("❌ Could not identify user.");
    }

    // Execute payment with platform fee
    const result = await executePaymentWithPlatformFee({
      senderId: userId,
      recipientId: kolId,
      tokenTicker,
      amount,
      paymentType: 'tip',
      platformFeePercent: 0.02
    });

    if (result.success) {
      await ctx.answerCallbackQuery("✅ Tip sent!");
      await ctx.editMessageText(
        `✅ **Tip Sent!**

**Amount:** ${amount} ${tokenTicker}
**Transaction:** [View on Explorer](${result.explorerLink})

The creator has been notified of your tip!`,
        { 
          parse_mode: "Markdown",
          disable_web_page_preview: true
        }
      );

      // Send notification to KOL
      if (result.recipientTelegramId) {
        await sendPaymentNotification(ctx.api, {
          senderHandle: ctx.from?.username || 'Anonymous',
          recipientTelegramId: result.recipientTelegramId,
          amount,
          tokenTicker,
          signature: result.signature,
          type: 'tip'
        });
      }
    } else {
      await ctx.answerCallbackQuery("❌ Payment failed");
      await ctx.editMessageText(`❌ Tip failed: ${result.error}`);
    }
  } catch (error) {
    logger.error("Tip confirm callback error:", error);
    await ctx.answerCallbackQuery("❌ An error occurred.");
  }
}

// Handle group join button clicks
export async function handleJoinGroupCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith("join_")) return;

  try {
    const [_, kolId, tokenTicker] = data.split("_");
    const userId = ctx.from?.id.toString();
    
    if (!userId) {
      return ctx.answerCallbackQuery("❌ Could not identify user.");
    }

    // Get KOL and their group settings
    const kol = await prisma.user.findUnique({
      where: { telegramId: kolId },
      include: { 
        kolSettings: true,
        wallets: { where: { isActive: true } }
      }
    });

    if (!kol?.kolSettings?.groupAccessEnabled || !kol.kolSettings.groupAccessPrice) {
      return ctx.answerCallbackQuery("❌ Group access not available.");
    }

    // Check if user already has access by finding the user first
    const user = await prisma.user.findUnique({
      where: { telegramId: userId }
    });

    if (!user) {
      return ctx.answerCallbackQuery("❌ Please create a wallet first using /start");
    }

    const existingAccess = await prisma.groupAccess.findUnique({
      where: {
        memberId_groupChatId: {
          memberId: user.id,
          groupChatId: kol.kolSettings.privateGroupChatId!
        }
      }
    });

    if (existingAccess) {
      return ctx.answerCallbackQuery("✅ You already have access to this group!");
    }

    // Get token info
    const token = await resolveToken(tokenTicker);
    if (!token) {
      return ctx.answerCallbackQuery("❌ Invalid token.");
    }

    const price = parseFloat(kol.kolSettings.groupAccessPrice) / Math.pow(10, token.decimals);

    // Show confirmation
    const keyboard = new InlineKeyboard()
      .text("✅ Confirm Purchase", `join_confirm_${kolId}_${tokenTicker}`)
      .text("❌ Cancel", "join_cancel");

    await ctx.editMessageText(
      `🔐 **Join Private Group**

**Group Owner:** @${kol.handle || 'Anonymous'}
**Price:** ${price} ${tokenTicker}
**Platform Fee:** ${price * 0.05} ${tokenTicker} (5%)
**Owner Receives:** ${price * 0.95} ${tokenTicker}

After payment, you'll receive an invite link to join the group.

Confirm purchase?`,
      {
        parse_mode: "Markdown",
        reply_markup: keyboard
      }
    );
  } catch (error) {
    logger.error("Join group callback error:", error);
    await ctx.answerCallbackQuery("❌ An error occurred.");
  }
}

// Handle group join confirmation
export async function handleJoinConfirmCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith("join_confirm_")) return;

  try {
    const [_, __, kolId, tokenTicker] = data.split("_");
    const userId = ctx.from?.id.toString();
    
    if (!userId) {
      return ctx.answerCallbackQuery("❌ Could not identify user.");
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { telegramId: userId },
      include: { wallets: { where: { isActive: true } } }
    });

    if (!user?.wallets?.[0]) {
      return ctx.answerCallbackQuery("❌ You need a wallet first. Use /start");
    }

    // Get KOL
    const kol = await prisma.user.findUnique({
      where: { telegramId: kolId },
      include: { 
        kolSettings: true,
        wallets: { where: { isActive: true } }
      }
    });

    if (!kol?.kolSettings?.groupAccessPrice || !kol.kolSettings.privateGroupChatId) {
      return ctx.answerCallbackQuery("❌ Group settings not found.");
    }

    // Get token and calculate amounts
    const token = await resolveToken(tokenTicker);
    if (!token) {
      return ctx.answerCallbackQuery("❌ Invalid token.");
    }

    const priceRaw = BigInt(kol.kolSettings.groupAccessPrice);
    const amount = Number(priceRaw) / Math.pow(10, token.decimals);

    // Execute payment with 5% platform fee
    const result = await executePaymentWithPlatformFee({
      senderId: userId,
      recipientId: kolId,
      tokenTicker,
      amount,
      paymentType: 'group_access',
      platformFeePercent: 0.05
    });

    if (result.success) {
      // Create group access record
      await prisma.groupAccess.create({
        data: {
          memberId: user.id,
          groupOwnerId: kol.id,
          groupChatId: kol.kolSettings.privateGroupChatId,
          paymentId: result.paymentId
        }
      });

      // Generate invite link
      try {
        const inviteLink = await ctx.api.createChatInviteLink(
          parseInt(kol.kolSettings.privateGroupChatId),
          {
            member_limit: 1,
            name: `Access for @${user.handle || userId}`
          }
        );

        await ctx.answerCallbackQuery("✅ Payment successful!");
        await ctx.editMessageText(
          `✅ **Group Access Granted!**

**Payment:** ${amount} ${tokenTicker}
**Transaction:** [View on Explorer](${result.explorerLink})

**Your Invite Link:**
${inviteLink.invite_link}

_This is a single-use link. Click it to join the group!_`,
          { 
            parse_mode: "Markdown",
            disable_web_page_preview: true
          }
        );

        // Notify KOL
        if (kol.telegramId) {
          await ctx.api.sendMessage(
            kol.telegramId,
            `👥 **New Group Member!**

@${user.handle || 'User'} has paid ${amount} ${tokenTicker} to join your private group.

You received: ${amount * 0.95} ${tokenTicker} (after 5% platform fee)`,
            { parse_mode: "Markdown" }
          );
        }
      } catch (inviteError) {
        logger.error("Failed to create invite link:", inviteError);
        await ctx.editMessageText(
          `✅ **Payment Successful!**

Transaction: [View on Explorer](${result.explorerLink})

⚠️ Could not generate invite link automatically. Please contact @${kol.handle} for manual access.`,
          { 
            parse_mode: "Markdown",
            disable_web_page_preview: true
          }
        );
      }
    } else {
      await ctx.answerCallbackQuery("❌ Payment failed");
      await ctx.editMessageText(`❌ Payment failed: ${result.error}`);
    }
  } catch (error) {
    logger.error("Join confirm callback error:", error);
    await ctx.answerCallbackQuery("❌ An error occurred.");
  }
}

// Handle cancel callbacks
export async function handleCancelCallback(ctx: BotContext, type: string) {
  const session = ctx.session as any;
  
  if (type === "tip") {
    delete session.tipIntent;
  }
  
  await ctx.answerCallbackQuery("Cancelled");
  await ctx.deleteMessage();
}

// Handle custom tip amount input
export async function handleCustomTipAmount(ctx: BotContext) {
  const session = ctx.session as any;
  
  if (!session.tipIntent || session.tipIntent.step !== 'custom_amount') {
    return;
  }

  const amountText = ctx.message?.text;
  if (!amountText) return;

  const amount = parseFloat(amountText);
  if (isNaN(amount) || amount <= 0) {
    return ctx.reply("❌ Please enter a valid positive number.");
  }

  // Process tip with custom amount
  await processTip(ctx, amount);
}