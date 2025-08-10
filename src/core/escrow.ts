import { prisma } from "../infra/prisma";
import { env } from "../infra/env";
import { logger } from "../infra/logger";
import { executeTransfer } from "./transfer";
import { getWalletKeypair, encryptPrivateKey } from "./wallets";
import { resolveToken } from "./tokens";
import { v4 as uuidv4 } from "uuid";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BotContext } from "../bot";

export interface CreateEscrowParams {
  paymentId?: string;
  chatId?: string;
  payerWallet: string;
  payerTelegramId?: string;
  payeeHandle: string;
  payeeTid?: string;
  mint: string;
  amountRaw: bigint;
  feeRaw: bigint;
  serviceFeeRaw?: bigint;
  serviceFeeToken?: string;
  note?: string;
  type?: "payment" | "tip";
}

export interface EscrowResult {
  success: boolean;
  escrowId?: string;
  claimUrl?: string;
  escrowVault?: string;
  error?: string;
}

export interface EscrowVaultKeypair {
  keypair: Keypair;
  encryptedPrivKey: Buffer;
}

// Generate a unique escrow vault keypair
export function generateEscrowVault(): EscrowVaultKeypair {
  const keypair = Keypair.generate();
  const encryptedPrivKey = encryptPrivateKey(keypair.secretKey, env.MASTER_KMS_KEY);
  
  return { keypair, encryptedPrivKey };
}

export async function createEscrow(params: CreateEscrowParams): Promise<EscrowResult> {
  try {
    const {
      paymentId,
      chatId,
      payerWallet,
      payerTelegramId,
      payeeHandle,
      payeeTid,
      mint,
      amountRaw,
      feeRaw,
      serviceFeeRaw = 0n,
      serviceFeeToken,
      note,
      type = "payment"
    } = params;

    const escrowId = uuidv4();
    const expiryHours = parseInt(env.ESCROW_EXPIRY_HOURS || "168"); // 7 days default
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    // Get token info
    const token = await resolveToken(mint);
    if (!token) {
      return { success: false, error: "Unknown token" };
    }

    // Generate unique escrow vault keypair
    const { keypair: escrowKeypair, encryptedPrivKey } = generateEscrowVault();
    const escrowVaultAddress = escrowKeypair.publicKey.toBase58();

    // Transfer funds to escrow vault
    const transferResult = await executeTransfer({
      fromWallet: { address: payerWallet },
      toAddress: escrowVaultAddress,
      mint,
      amountRaw,
      feeRaw,
      serviceFeeRaw,
      serviceFeeToken,
      token,
      senderTelegramId: payerTelegramId,
      recipientTelegramId: payeeTid,
      note,
      type
    });

    if (!transferResult.success) {
      return { 
        success: false, 
        error: `Escrow funding failed: ${transferResult.error}` 
      };
    }

    // Store the encrypted escrow vault private key temporarily for claiming
    // In a production system, you'd use a proper key management system
    const tempEscrowWallet = await prisma.wallet.create({
      data: {
        userId: -1, // System wallet marker
        label: `escrow-${escrowId}`,
        address: escrowVaultAddress,
        encPrivKey: encryptedPrivKey,
        isActive: false // Not a user wallet
      }
    });

    // Create escrow record
    await prisma.escrow.create({
      data: {
        id: escrowId,
        chatId,
        payerWallet,
        payeeHandle,
        payeeTid,
        payeeWallet: null,
        mint,
        amountRaw: amountRaw.toString(),
        feeRaw: feeRaw.toString(),
        note,
        status: "open",
        expiresAt,
        txSigFund: transferResult.signature
      }
    });

    logger.info(`Escrow created: ${escrowId} for ${payeeHandle}, vault: ${escrowVaultAddress}`);

    return {
      success: true,
      escrowId,
      claimUrl: `t.me/${env.BOT_USERNAME || 'solanapaybot'}?start=claim_${escrowId}`,
      escrowVault: escrowVaultAddress
    };

  } catch (error) {
    logger.error("Error creating escrow:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

export async function claimEscrow(
  escrowId: string,
  claimerTelegramId: string,
  claimerWallet: string
): Promise<EscrowResult> {
  try {
    // Get escrow record
    const escrow = await prisma.escrow.findUnique({
      where: { id: escrowId }
    });

    if (!escrow) {
      return { success: false, error: "Escrow not found" };
    }

    if (escrow.status !== "open") {
      return { success: false, error: "Escrow already processed" };
    }

    if (new Date() > escrow.expiresAt) {
      await expireEscrow(escrowId);
      return { success: false, error: "Escrow expired" };
    }

    // For handle-based escrows, verify the claimer matches the intended recipient
    if (escrow.payeeTid && escrow.payeeTid !== claimerTelegramId) {
      return { success: false, error: "Not authorized to claim this escrow" };
    }

    // Get token info
    const token = await resolveToken(escrow.mint);
    if (!token) {
      return { success: false, error: "Unknown token" };
    }

    // Get escrow vault keypair from stored wallet
    const escrowWallet = await prisma.wallet.findFirst({
      where: { 
        label: `escrow-${escrowId}`,
        userId: -1
      }
    });

    if (!escrowWallet || !escrowWallet.encPrivKey) {
      return { success: false, error: "Escrow vault not accessible" };
    }

    const escrowKeypair = await getWalletKeypair(escrowWallet.address);
    if (!escrowKeypair) {
      return { success: false, error: "Escrow vault keypair not accessible" };
    }

    const amountRaw = BigInt(escrow.amountRaw);
    const feeRaw = BigInt(escrow.feeRaw);

    // Release funds to claimer
    const releaseResult = await executeTransfer({
      fromWallet: { address: escrowKeypair.publicKey.toBase58() },
      toAddress: claimerWallet,
      mint: escrow.mint,
      amountRaw,
      feeRaw: 0n, // No additional fees for release
      token,
      senderTelegramId: 'escrow',
      recipientTelegramId: claimerTelegramId,
      note: `Escrow claim: ${escrow.note || ''}`,
      type: 'payment',
      isWithdrawal: false
    });

    if (!releaseResult.success) {
      return {
        success: false,
        error: `Escrow release failed: ${releaseResult.error}`
      };
    }

    // Update escrow status and link to claiming user
    await prisma.escrow.update({
      where: { id: escrowId },
      data: {
        status: "claimed",
        payeeTid: claimerTelegramId,
        payeeWallet: claimerWallet,
        txSigRelease: releaseResult.signature
      }
    });

    // Clean up the temporary escrow vault wallet
    await prisma.wallet.deleteMany({
      where: { 
        label: `escrow-${escrowId}`,
        userId: -1
      }
    });

    logger.info(`Escrow claimed: ${escrowId} by ${claimerTelegramId}, released to ${claimerWallet}`);

    return { success: true, escrowId };

  } catch (error) {
    logger.error("Error claiming escrow:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

export async function expireEscrow(escrowId: string): Promise<boolean> {
  try {
    const escrow = await prisma.escrow.findUnique({
      where: { id: escrowId }
    });

    if (!escrow || escrow.status !== "open") {
      return false;
    }

    // Get token info
    const token = await resolveToken(escrow.mint);
    if (!token) {
      logger.error(`Cannot expire escrow ${escrowId}: unknown token ${escrow.mint}`);
      return false;
    }

    // Get escrow vault keypair
    const escrowWallet = await prisma.wallet.findFirst({
      where: { 
        label: `escrow-${escrowId}`,
        userId: -1
      }
    });

    if (!escrowWallet) {
      logger.error(`Cannot expire escrow ${escrowId}: escrow vault not found`);
      return false;
    }

    const escrowKeypair = await getWalletKeypair(escrowWallet.address);
    if (!escrowKeypair) {
      logger.error(`Cannot expire escrow ${escrowId}: escrow wallet not accessible`);
      return false;
    }

    const totalAmount = BigInt(escrow.amountRaw) + BigInt(escrow.feeRaw);

    // Refund to payer (no fees on refund)
    const refundResult = await executeTransfer({
      fromWallet: { address: escrowKeypair.publicKey.toBase58() },
      toAddress: escrow.payerWallet,
      mint: escrow.mint,
      amountRaw: totalAmount,
      feeRaw: 0n,
      token,
      senderTelegramId: 'escrow',
      note: `Escrow expired refund: ${escrow.note || ''}`,
      type: 'payment',
      isWithdrawal: true // No fees for refunds
    });

    if (refundResult.success) {
      // Update escrow status
      await prisma.escrow.update({
        where: { id: escrowId },
        data: {
          status: "refunded",
          txSigRelease: refundResult.signature
        }
      });

      // Clean up the escrow vault wallet
      await prisma.wallet.deleteMany({
        where: { 
          label: `escrow-${escrowId}`,
          userId: -1
        }
      });

      logger.info(`Escrow expired and refunded: ${escrowId}`);
      return true;
    } else {
      logger.error(`Escrow refund failed: ${escrowId} - ${refundResult.error}`);
      
      // Mark as expired even if refund failed (manual intervention needed)
      await prisma.escrow.update({
        where: { id: escrowId },
        data: { status: "expired" }
      });

      return false;
    }

  } catch (error) {
    logger.error("Error expiring escrow:", error);
    return false;
  }
}

export async function processExpiredEscrows(): Promise<void> {
  try {
    const expiredEscrows = await prisma.escrow.findMany({
      where: {
        status: "open",
        expiresAt: {
          lt: new Date()
        }
      },
      take: 10 // Process in batches
    });

    logger.info(`Processing ${expiredEscrows.length} expired escrows`);

    for (const escrow of expiredEscrows) {
      await expireEscrow(escrow.id);
      // Small delay to avoid overwhelming the network
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

  } catch (error) {
    logger.error("Error processing expired escrows:", error);
  }
}

// Notification functions for escrow events
export async function sendEscrowNotification(
  ctx: BotContext,
  chatId: string | undefined,
  escrowId: string,
  amount: number,
  tokenTicker: string,
  recipientHandle: string,
  senderHandle?: string,
  note?: string
): Promise<void> {
  try {
    const claimUrl = `t.me/${env.BOT_USERNAME || 'solanapaybot'}?start=claim_${escrowId}`;
    
    const message = `⏳ **Funds Reserved**

@${senderHandle || 'Someone'} reserved **${amount.toFixed(4)} ${tokenTicker}** for @${recipientHandle}${note ? `\n\n💬 *${note}*` : ''}

⏰ Claim within 7 days or funds will be refunded

[Claim in DM](${claimUrl})`;

    if (chatId && chatId !== ctx.chat?.id?.toString()) {
      // Send to group chat
      await ctx.api.sendMessage(chatId, message, { parse_mode: "Markdown" });
    }
  } catch (error) {
    logger.error("Error sending escrow notification:", error);
  }
}

export async function sendEscrowClaimedNotification(
  ctx: BotContext,
  chatId: string | undefined,
  amount: number,
  tokenTicker: string,
  recipientHandle: string,
  signature: string
): Promise<void> {
  try {
    const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
    
    const message = `✅ **Claimed**

@${recipientHandle} received **${amount.toFixed(4)} ${tokenTicker}**

[View Transaction](${explorerUrl})`;

    if (chatId && ctx.chat?.id?.toString() !== chatId) {
      await ctx.api.sendMessage(chatId, message, { parse_mode: "Markdown" });
    }
  } catch (error) {
    logger.error("Error sending escrow claimed notification:", error);
  }
}

export async function sendEscrowRefundNotification(
  ctx: BotContext,
  chatId: string | undefined,
  amount: number,
  tokenTicker: string,
  senderHandle: string,
  signature: string
): Promise<void> {
  try {
    const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
    
    const message = `↩️ **Escrow Expired**

Refunded **${amount.toFixed(4)} ${tokenTicker}** to @${senderHandle}

[View Transaction](${explorerUrl})`;

    if (chatId) {
      await ctx.api.sendMessage(chatId, message, { parse_mode: "Markdown" });
    }
  } catch (error) {
    logger.error("Error sending escrow refund notification:", error);
  }
}

export async function sendRecipientEscrowDM(
  ctx: BotContext,
  recipientTelegramId: string,
  escrowId: string,
  amount: number,
  tokenTicker: string,
  senderHandle?: string,
  note?: string
): Promise<void> {
  try {
    const message = `💸 **Payment Reserved**

@${senderHandle || 'Someone'} reserved **${amount.toFixed(4)} ${tokenTicker}** for you${note ? `\n\n💬 *${note}*` : ''}

Choose how to receive:`;

    const keyboard = [
      [{ text: "🔒 Claim to Telegram Wallet", callback_data: `claim_telegram_${escrowId}` }],
      [{ text: "🏦 Claim to My Address", callback_data: `claim_address_${escrowId}` }]
    ];

    await ctx.api.sendMessage(recipientTelegramId, message, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard }
    });
  } catch (error) {
    logger.error(`Error sending escrow DM to ${recipientTelegramId}:`, error);
  }
}

export async function getEscrowInfo(escrowId: string): Promise<any> {
  try {
    const escrow = await prisma.escrow.findUnique({
      where: { id: escrowId }
    });

    if (!escrow) return null;

    const token = await resolveToken(escrow.mint);
    const amount = Number(escrow.amountRaw) / (10 ** (token?.decimals || 9));

    return {
      id: escrow.id,
      amount,
      token: token?.ticker || escrow.mint,
      payeeHandle: escrow.payeeHandle,
      status: escrow.status,
      expiresAt: escrow.expiresAt,
      claimUrl: `${env.APP_BASE_URL}/claim/${escrowId}`
    };

  } catch (error) {
    logger.error("Error getting escrow info:", error);
    return null;
  }
}

// Start background process for expired escrows (call this from main app)
export function startEscrowCleanup(): void {
  const intervalMinutes = 60; // Check every hour
  
  setInterval(async () => {
    await processExpiredEscrows();
  }, intervalMinutes * 60 * 1000);

  logger.info(`Escrow cleanup process started (interval: ${intervalMinutes}m)`);
}
