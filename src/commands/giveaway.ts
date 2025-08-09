import type { BotContext } from "../bot";
import { prisma } from "../infra/prisma";
import { parseGiveawayCommand } from "../core/parse";
import { resolveToken } from "../core/tokens";
import { executeTransfer } from "../core/transfer";
import { InlineKeyboard } from "grammy";
import { logger } from "../infra/logger";
import { v4 as uuidv4 } from "uuid";

// In-memory giveaway storage (could be moved to database)
const activeGiveaways = new Map<string, {
  id: string;
  chatId: string;
  hostId: string;
  amount: number;
  token: string;
  description: string;
  participants: Set<string>;
  messageId: number;
  createdAt: Date;
}>();

export async function commandGiveaway(ctx: BotContext) {
  const chat = ctx.chat;
  if (!chat || chat.type === "private") {
    return ctx.reply("Use /giveaway in groups only.");
  }

  try {
    // Check if chat is whitelisted
    const chatRecord = await prisma.chat.findUnique({
      where: { chatId: chat.id.toString() }
    });

    if (!chatRecord?.whitelisted) {
      return ctx.reply("❌ Bot not enabled. Admins: use /enable first.");
    }

    const args = ctx.message?.text?.split(' ').slice(1) || [];
    const subcommand = args[0];

    switch (subcommand) {
      case 'start':
        await handleGiveawayStart(ctx, args.slice(1));
        break;
      case 'enter':
        await handleGiveawayEnter(ctx);
        break;
      case 'draw':
        await handleGiveawayDraw(ctx, args.slice(1));
        break;
      case 'list':
        await handleGiveawayList(ctx);
        break;
      default:
        await ctx.reply(`❌ Usage:
/giveaway start <amount> <TOKEN> "<description>"
/giveaway enter
/giveaway draw [winners]
/giveaway list`);
    }

  } catch (error) {
    logger.error("Giveaway command error:", error);
    await ctx.reply("❌ Giveaway command failed. Please try again.");
  }
}

async function handleGiveawayStart(ctx: BotContext, args: string[]) {
  if (args.length < 3) {
    return ctx.reply("❌ Usage: /giveaway start <amount> <TOKEN> \"<description>\"");
  }

  const amount = parseFloat(args[0]);
  const tokenTicker = args[1];
  const description = args.slice(2).join(' ').replace(/"/g, '');

  if (isNaN(amount) || amount <= 0) {
    return ctx.reply("❌ Invalid amount.");
  }

  // Resolve token
  const token = await resolveToken(tokenTicker);
  if (!token) {
    return ctx.reply(`❌ Unknown token: ${tokenTicker}`);
  }

  // Get host wallet
  const hostId = ctx.from?.id.toString();
  if (!hostId) {
    return ctx.reply("❌ Could not identify host.");
  }

  const host = await prisma.user.findUnique({
    where: { telegramId: hostId },
    include: { wallets: { where: { isActive: true } } }
  });

  if (!host || !host.wallets[0]) {
    return ctx.reply("❌ You need to create a wallet first. DM me with /start.");
  }

  // Create giveaway
  const giveawayId = uuidv4();
  const keyboard = new InlineKeyboard()
    .text("🎁 Enter Giveaway", `enter_giveaway:${giveawayId}`);

  const giveawayText = `🎁 **GIVEAWAY STARTED!**

Prize: ${amount} ${token.ticker}
Description: ${description}
Host: @${ctx.from?.username || 'user'}

Click below to enter!
Participants: 0`;

  const message = await ctx.reply(giveawayText, {
    parse_mode: "Markdown",
    reply_markup: keyboard
  });

  // Store giveaway
  activeGiveaways.set(giveawayId, {
    id: giveawayId,
    chatId: ctx.chat!.id.toString(),
    hostId,
    amount,
    token: token.ticker,
    description,
    participants: new Set(),
    messageId: message.message_id,
    createdAt: new Date()
  });

  // Try to pin the message
  try {
    await ctx.pinChatMessage(message.message_id);
  } catch (error) {
    logger.warn("Could not pin giveaway message:", error);
  }

  logger.info(`Giveaway started: ${giveawayId} by ${hostId}`);
}

async function handleGiveawayEnter(ctx: BotContext) {
  // This is handled by callback query handler
  await ctx.reply("❌ Use the button on a giveaway post to enter.");
}

async function handleGiveawayDraw(ctx: BotContext, args: string[]) {
  const chatId = ctx.chat!.id.toString();
  const hostId = ctx.from?.id.toString();
  
  // Find active giveaway in this chat by this host
  const giveaway = Array.from(activeGiveaways.values())
    .find(g => g.chatId === chatId && g.hostId === hostId);

  if (!giveaway) {
    return ctx.reply("❌ No active giveaway found that you're hosting.");
  }

  if (giveaway.participants.size === 0) {
    return ctx.reply("❌ No participants in the giveaway yet.");
  }

  const winnerCount = Math.min(
    parseInt(args[0]) || 1,
    giveaway.participants.size,
    5 // Max 5 winners
  );

  // Select random winners
  const participantArray = Array.from(giveaway.participants);
  const winners = [];
  for (let i = 0; i < winnerCount; i++) {
    const randomIndex = Math.floor(Math.random() * participantArray.length);
    winners.push(participantArray.splice(randomIndex, 1)[0]);
  }

  // Get host wallet
  const host = await prisma.user.findUnique({
    where: { telegramId: hostId },
    include: { wallets: { where: { isActive: true } } }
  });

  if (!host || !host.wallets[0]) {
    return ctx.reply("❌ Host wallet not found.");
  }

  const token = await resolveToken(giveaway.token);
  if (!token) {
    return ctx.reply("❌ Token not found.");
  }

  const amountPerWinner = giveaway.amount / winners.length;
  const amountPerWinnerRaw = BigInt(Math.floor(amountPerWinner * (10 ** token.decimals)));

  // Send prizes to winners
  const results = await Promise.all(
    winners.map(async (winnerId) => {
      const winner = await prisma.user.findUnique({
        where: { telegramId: winnerId },
        include: { wallets: { where: { isActive: true } } }
      });

      if (!winner || !winner.wallets[0]) {
        return { winnerId, success: false, error: "No wallet" };
      }

      const result = await executeTransfer({
        fromWallet: host.wallets[0],
        toAddress: winner.wallets[0].address,
        mint: token.mint,
        amountRaw: amountPerWinnerRaw,
        feeRaw: 0n, // No fees for giveaway payouts
        token,
        isGiveaway: true
      });

      return {
        winnerId,
        success: result.success,
        error: result.error,
        signature: result.signature
      };
    })
  );

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  let resultText = `🎉 **GIVEAWAY RESULTS**\n\n`;
  
  if (successful.length > 0) {
    resultText += `🏆 **Winners:**\n`;
    for (const result of successful) {
      const winner = await prisma.user.findUnique({
        where: { telegramId: result.winnerId }
      });
      resultText += `@${winner?.handle || 'user'}: ${amountPerWinner} ${giveaway.token}\n`;
    }
  }

  if (failed.length > 0) {
    resultText += `\n❌ **Failed payouts:** ${failed.length}`;
  }

  resultText += `\nTotal participants: ${giveaway.participants.size}`;

  await ctx.reply(resultText, { parse_mode: "Markdown" });

  // Clean up giveaway
  activeGiveaways.delete(giveaway.id);

  logger.info(`Giveaway drawn: ${giveaway.id}, ${successful.length}/${winners.length} successful`);
}

async function handleGiveawayList(ctx: BotContext) {
  const chatId = ctx.chat!.id.toString();
  const chatGiveaways = Array.from(activeGiveaways.values())
    .filter(g => g.chatId === chatId);

  if (chatGiveaways.length === 0) {
    return ctx.reply("No active giveaways in this chat.");
  }

  let listText = "🎁 **Active Giveaways:**\n\n";
  for (const giveaway of chatGiveaways) {
    const host = await prisma.user.findUnique({
      where: { telegramId: giveaway.hostId }
    });
    
    listText += `Prize: ${giveaway.amount} ${giveaway.token}\n`;
    listText += `Host: @${host?.handle || 'user'}\n`;
    listText += `Participants: ${giveaway.participants.size}\n`;
    listText += `Description: ${giveaway.description}\n\n`;
  }

  await ctx.reply(listText, { parse_mode: "Markdown" });
}

// Handle giveaway entry callback
export async function handleGiveawayCallback(ctx: BotContext, giveawayId: string) {
  const userId = ctx.from?.id.toString();
  if (!userId) {
    return ctx.answerCallbackQuery("❌ Could not identify user");
  }

  const giveaway = activeGiveaways.get(giveawayId);
  if (!giveaway) {
    return ctx.answerCallbackQuery("❌ Giveaway not found or ended");
  }

  if (giveaway.hostId === userId) {
    return ctx.answerCallbackQuery("❌ You cannot enter your own giveaway");
  }

  if (giveaway.participants.has(userId)) {
    return ctx.answerCallbackQuery("❌ You're already entered!");
  }

  // Check if user has a wallet
  const user = await prisma.user.findUnique({
    where: { telegramId: userId },
    include: { wallets: { where: { isActive: true } } }
  });

  if (!user || !user.wallets[0]) {
    return ctx.answerCallbackQuery("❌ You need a wallet first. DM @" + ctx.me.username);
  }

  // Add participant
  giveaway.participants.add(userId);

  // Update message
  const keyboard = new InlineKeyboard()
    .text("🎁 Enter Giveaway", `enter_giveaway:${giveawayId}`);

  const updatedText = `🎁 **GIVEAWAY STARTED!**

Prize: ${giveaway.amount} ${giveaway.token}
Description: ${giveaway.description}
Host: @${(await prisma.user.findUnique({ where: { telegramId: giveaway.hostId } }))?.handle || 'user'}

Click below to enter!
Participants: ${giveaway.participants.size}`;

  try {
    await ctx.editMessageText(updatedText, {
      parse_mode: "Markdown",
      reply_markup: keyboard
    });
  } catch (error) {
    // Message might be too old to edit
    logger.warn("Could not update giveaway message:", error);
  }

  await ctx.answerCallbackQuery("✅ Entered giveaway!");
  
  logger.info(`User ${userId} entered giveaway ${giveawayId}`);
}
