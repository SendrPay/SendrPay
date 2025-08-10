import { BotContext } from "../bot";
import { prisma } from "../infra/prisma";
import { logger } from "../infra/logger";
import { claimEscrow, sendEscrowClaimedNotification, sendRecipientEscrowDM } from "../core/escrow";
import { generateWallet } from "../core/wallets";
import { resolveToken } from "../core/tokens";

interface ClaimSession {
  escrowId: string;
  userId: string;
  type: 'address';
  createdAt: Date;
}

// In-memory session storage (use Redis in production)
const claimSessions = new Map<string, ClaimSession>();

export async function handleClaimStart(ctx: BotContext, escrowId: string): Promise<void> {
  try {
    const userId = ctx.from?.id.toString();
    if (!userId) {
      return ctx.reply("❌ Could not identify user.");
    }

    // Get escrow info
    const escrow = await prisma.escrow.findUnique({
      where: { id: escrowId }
    });

    if (!escrow) {
      return ctx.reply("❌ Escrow not found or already claimed.");
    }

    if (escrow.status !== "open") {
      return ctx.reply("❌ This escrow has already been processed.");
    }

    if (new Date() > escrow.expiresAt) {
      return ctx.reply("❌ This escrow has expired. Funds have been refunded to the sender.");
    }

    // Get token info for display
    const token = await resolveToken(escrow.mint);
    if (!token) {
      return ctx.reply("❌ Unknown token in escrow.");
    }

    const amount = Number(escrow.amountRaw) / (10 ** token.decimals);
    
    // Send recipient the claim options
    await sendRecipientEscrowDM(
      ctx,
      userId,
      escrowId,
      amount,
      token.ticker,
      'Someone', // We don't have sender handle in escrow record yet
      escrow.note
    );

  } catch (error) {
    logger.error("Error handling claim start:", error);
    await ctx.reply("❌ Error processing escrow claim. Please try again.");
  }
}

export async function handleClaimToTelegramWallet(ctx: BotContext, escrowId: string): Promise<void> {
  try {
    const userId = ctx.from?.id.toString();
    if (!userId) {
      return ctx.reply("❌ Could not identify user.");
    }

    // Check if user already has a wallet
    const user = await prisma.user.findUnique({
      where: { telegramId: userId },
      include: { wallets: { where: { isActive: true } } }
    });

    let userWallet: string;

    if (!user || !user.wallets[0]) {
      // Generate wallet for the user
      await ctx.reply("🔄 Creating your Telegram wallet...");
      
      await generateWallet(ctx);
      
      // Get the newly created wallet
      const newUser = await prisma.user.findUnique({
        where: { telegramId: userId },
        include: { wallets: { where: { isActive: true } } }
      });

      if (!newUser || !newUser.wallets[0]) {
        return ctx.reply("❌ Failed to create wallet. Please try again.");
      }
      
      userWallet = newUser.wallets[0].address;
    } else {
      userWallet = user.wallets[0].address;
    }

    // Claim the escrow
    const claimResult = await claimEscrow(escrowId, userId, userWallet);

    if (!claimResult.success) {
      return ctx.reply(`❌ Failed to claim escrow: ${claimResult.error}`);
    }

    // Get escrow info for notification
    const escrow = await prisma.escrow.findUnique({
      where: { id: escrowId }
    });

    if (escrow) {
      const token = await resolveToken(escrow.mint);
      if (token) {
        const amount = Number(escrow.amountRaw) / (10 ** token.decimals);
        
        // Send success message
        await ctx.reply(`✅ **Successfully Claimed!**

You received **${amount.toFixed(4)} ${token.ticker}** in your Telegram wallet.

**Wallet:** \`${userWallet.slice(0, 8)}...${userWallet.slice(-4)}\``, 
          { parse_mode: "Markdown" });

        // Send notification to group if applicable
        if (escrow.chatId) {
          await sendEscrowClaimedNotification(
            ctx,
            escrow.chatId,
            amount,
            token.ticker,
            ctx.from?.username || 'user',
            claimResult.signature || ''
          );
        }
      }
    }

  } catch (error) {
    logger.error("Error claiming to Telegram wallet:", error);
    await ctx.reply("❌ Failed to claim escrow. Please try again.");
  }
}

export async function handleClaimToAddress(ctx: BotContext, escrowId: string): Promise<void> {
  try {
    const userId = ctx.from?.id.toString();
    if (!userId) {
      return ctx.reply("❌ Could not identify user.");
    }

    await ctx.reply("🏦 **Claim to Your Address**\n\nPlease send your Solana wallet address:");

    // Store session for address collection - expose this session storage
    // We'll import this from index.ts where it's defined
    const { setClaimSession } = await import("./index");
    setClaimSession(`address_${userId}`, { escrowId, type: 'address' });

  } catch (error) {
    logger.error("Error setting up claim to address:", error);
    await ctx.reply("❌ Error setting up address claim. Please try again.");
  }
}

// Helper function to validate Solana addresses
export function isValidSolanaAddress(address: string): boolean {
  try {
    // Basic validation - should be base58 and correct length
    if (address.length < 32 || address.length > 44) return false;
    
    // Check if it contains only valid base58 characters
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    return base58Regex.test(address);
  } catch {
    return false;
  }
}

// Handle direct address claiming (called when user sends address)
export async function handleAddressClaim(
  ctx: BotContext, 
  escrowId: string, 
  address: string
): Promise<void> {
  try {
    const userId = ctx.from?.id.toString();
    if (!userId) {
      return ctx.reply("❌ Could not identify user.");
    }

    // Validate the address
    if (!isValidSolanaAddress(address)) {
      return ctx.reply("❌ Invalid Solana address. Please check and try again.");
    }

    // Claim the escrow
    const claimResult = await claimEscrow(escrowId, userId, address);

    if (!claimResult.success) {
      return ctx.reply(`❌ Failed to claim escrow: ${claimResult.error}`);
    }

    // Get escrow info for notification
    const escrow = await prisma.escrow.findUnique({
      where: { id: escrowId }
    });

    if (escrow) {
      const token = await resolveToken(escrow.mint);
      if (token) {
        const amount = Number(escrow.amountRaw) / (10 ** token.decimals);
        
        await ctx.reply(`✅ **Successfully Claimed!**

You received **${amount.toFixed(4)} ${token.ticker}** at your address:

\`${address}\``, 
          { parse_mode: "Markdown" });

        // Send notification to group if applicable
        if (escrow.chatId) {
          await sendEscrowClaimedNotification(
            ctx,
            escrow.chatId,
            amount,
            token.ticker,
            ctx.from?.username || 'user',
            claimResult.signature || ''
          );
        }
      }
    }

  } catch (error) {
    logger.error("Error claiming to address:", error);
    await ctx.reply("❌ Failed to claim to address. Please try again.");
  }
}