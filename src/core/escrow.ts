import { prisma } from "../infra/prisma";
import { env } from "../infra/env";
import { logger } from "../infra/logger";
import { executeTransfer } from "./transfer";
import { getWalletKeypair } from "./wallets";
import { resolveToken } from "./tokens";
import { v4 as uuidv4 } from "uuid";

export interface CreateEscrowParams {
  paymentId: string;
  chatId: string;
  payerWallet: string;
  payeeHandle: string;
  payeeTid?: string;
  mint: string;
  amountRaw: bigint;
  feeRaw: bigint;
}

export interface EscrowResult {
  success: boolean;
  escrowId?: string;
  claimUrl?: string;
  error?: string;
}

export async function createEscrow(params: CreateEscrowParams): Promise<EscrowResult> {
  try {
    const {
      paymentId,
      chatId,
      payerWallet,
      payeeHandle,
      payeeTid,
      mint,
      amountRaw,
      feeRaw
    } = params;

    const escrowId = uuidv4();
    const expiryHours = parseInt(env.ESCROW_EXPIRY_HOURS || "168"); // 7 days default
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    // Get token info
    const token = await resolveToken(mint);
    if (!token) {
      return { success: false, error: "Unknown token" };
    }

    // Get payer keypair for escrow funding
    const payerKeypair = await getWalletKeypair(payerWallet);
    if (!payerKeypair) {
      return { success: false, error: "Payer wallet not accessible" };
    }

    // Create escrow wallet (simple approach: use a derived account)
    // In production, you might want to use a PDA (Program Derived Address)
    const escrowKeypair = await getWalletKeypair(env.FEE_TREASURY_SECRET || payerWallet);
    if (!escrowKeypair) {
      return { success: false, error: "Escrow wallet not accessible" };
    }

    // Transfer funds to escrow (simplified - using fee treasury as escrow)
    const transferResult = await executeTransfer({
      fromWallet: { address: payerWallet },
      toAddress: escrowKeypair.publicKey.toBase58(),
      mint,
      amountRaw: amountRaw + feeRaw, // Hold full amount including fee
      feeRaw: 0n, // No additional fees for escrow funding
      token,
      isEscrow: true // No additional fees for escrow funding
    });

    if (!transferResult.success) {
      return { 
        success: false, 
        error: `Escrow funding failed: ${transferResult.error}` 
      };
    }

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
        status: "open",
        expiresAt,
        txSigFund: transferResult.signature
      }
    });

    const claimUrl = `${env.APP_BASE_URL}/claim/${escrowId}`;

    logger.info(`Escrow created: ${escrowId} for ${payeeHandle}`);

    return {
      success: true,
      escrowId,
      claimUrl
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

    // Verify claimer is the intended recipient
    if (escrow.payeeTid && escrow.payeeTid !== claimerTelegramId) {
      return { success: false, error: "Not authorized to claim this escrow" };
    }

    // Get token info
    const token = await resolveToken(escrow.mint);
    if (!token) {
      return { success: false, error: "Unknown token" };
    }

    // Get escrow keypair
    const escrowKeypair = await getWalletKeypair(env.FEE_TREASURY_SECRET || "");
    if (!escrowKeypair) {
      return { success: false, error: "Escrow wallet not accessible" };
    }

    const amountRaw = BigInt(escrow.amountRaw);
    const feeRaw = BigInt(escrow.feeRaw);

    // Release funds to claimer
    const releaseResult = await executeTransfer({
      fromWallet: { address: escrowKeypair.publicKey.toBase58() },
      toAddress: claimerWallet,
      mint: escrow.mint,
      amountRaw,
      feeRaw,
      token,
      isWithdrawal: false // Apply normal fees
    });

    if (!releaseResult.success) {
      return {
        success: false,
        error: `Escrow release failed: ${releaseResult.error}`
      };
    }

    // Update escrow status
    await prisma.escrow.update({
      where: { id: escrowId },
      data: {
        status: "claimed",
        payeeWallet: claimerWallet,
        txSigRelease: releaseResult.signature
      }
    });

    logger.info(`Escrow claimed: ${escrowId} by ${claimerTelegramId}`);

    return { success: true };

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

    // Get escrow keypair
    const escrowKeypair = await getWalletKeypair(env.FEE_TREASURY_SECRET || "");
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
