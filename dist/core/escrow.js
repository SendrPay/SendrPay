"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEscrow = createEscrow;
exports.claimEscrow = claimEscrow;
exports.expireEscrow = expireEscrow;
exports.processExpiredEscrows = processExpiredEscrows;
exports.getEscrowInfo = getEscrowInfo;
exports.startEscrowCleanup = startEscrowCleanup;
const prisma_1 = require("../infra/prisma");
const env_1 = require("../infra/env");
const logger_1 = require("../infra/logger");
const transfer_1 = require("./transfer");
const wallets_1 = require("./wallets");
const tokens_1 = require("./tokens");
const uuid_1 = require("uuid");
async function createEscrow(params) {
    try {
        const { paymentId, chatId, payerWallet, payeeHandle, payeeTid, mint, amountRaw, feeRaw } = params;
        const escrowId = (0, uuid_1.v4)();
        const expiryHours = parseInt(env_1.env.ESCROW_EXPIRY_HOURS || "168"); // 7 days default
        const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
        // Get token info
        const token = await (0, tokens_1.resolveToken)(mint);
        if (!token) {
            return { success: false, error: "Unknown token" };
        }
        // Get payer keypair for escrow funding
        const payerKeypair = await (0, wallets_1.getWalletKeypair)(payerWallet);
        if (!payerKeypair) {
            return { success: false, error: "Payer wallet not accessible" };
        }
        // Create escrow wallet (simple approach: use a derived account)
        // In production, you might want to use a PDA (Program Derived Address)
        const escrowKeypair = await (0, wallets_1.getWalletKeypair)(env_1.env.FEE_TREASURY_SECRET || payerWallet);
        if (!escrowKeypair) {
            return { success: false, error: "Escrow wallet not accessible" };
        }
        // Transfer funds to escrow (simplified - using fee treasury as escrow)
        const transferResult = await (0, transfer_1.executeTransfer)({
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
        await prisma_1.prisma.escrow.create({
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
        const claimUrl = `${env_1.env.APP_BASE_URL}/claim/${escrowId}`;
        logger_1.logger.info(`Escrow created: ${escrowId} for ${payeeHandle}`);
        return {
            success: true,
            escrowId,
            claimUrl
        };
    }
    catch (error) {
        logger_1.logger.error("Error creating escrow:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error"
        };
    }
}
async function claimEscrow(escrowId, claimerTelegramId, claimerWallet) {
    try {
        // Get escrow record
        const escrow = await prisma_1.prisma.escrow.findUnique({
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
        const token = await (0, tokens_1.resolveToken)(escrow.mint);
        if (!token) {
            return { success: false, error: "Unknown token" };
        }
        // Get escrow keypair
        const escrowKeypair = await (0, wallets_1.getWalletKeypair)(env_1.env.FEE_TREASURY_SECRET || "");
        if (!escrowKeypair) {
            return { success: false, error: "Escrow wallet not accessible" };
        }
        const amountRaw = BigInt(escrow.amountRaw);
        const feeRaw = BigInt(escrow.feeRaw);
        // Release funds to claimer
        const releaseResult = await (0, transfer_1.executeTransfer)({
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
        await prisma_1.prisma.escrow.update({
            where: { id: escrowId },
            data: {
                status: "claimed",
                payeeWallet: claimerWallet,
                txSigRelease: releaseResult.signature
            }
        });
        logger_1.logger.info(`Escrow claimed: ${escrowId} by ${claimerTelegramId}`);
        return { success: true };
    }
    catch (error) {
        logger_1.logger.error("Error claiming escrow:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error"
        };
    }
}
async function expireEscrow(escrowId) {
    try {
        const escrow = await prisma_1.prisma.escrow.findUnique({
            where: { id: escrowId }
        });
        if (!escrow || escrow.status !== "open") {
            return false;
        }
        // Get token info
        const token = await (0, tokens_1.resolveToken)(escrow.mint);
        if (!token) {
            logger_1.logger.error(`Cannot expire escrow ${escrowId}: unknown token ${escrow.mint}`);
            return false;
        }
        // Get escrow keypair
        const escrowKeypair = await (0, wallets_1.getWalletKeypair)(env_1.env.FEE_TREASURY_SECRET || "");
        if (!escrowKeypair) {
            logger_1.logger.error(`Cannot expire escrow ${escrowId}: escrow wallet not accessible`);
            return false;
        }
        const totalAmount = BigInt(escrow.amountRaw) + BigInt(escrow.feeRaw);
        // Refund to payer (no fees on refund)
        const refundResult = await (0, transfer_1.executeTransfer)({
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
            await prisma_1.prisma.escrow.update({
                where: { id: escrowId },
                data: {
                    status: "refunded",
                    txSigRelease: refundResult.signature
                }
            });
            logger_1.logger.info(`Escrow expired and refunded: ${escrowId}`);
            return true;
        }
        else {
            logger_1.logger.error(`Escrow refund failed: ${escrowId} - ${refundResult.error}`);
            // Mark as expired even if refund failed (manual intervention needed)
            await prisma_1.prisma.escrow.update({
                where: { id: escrowId },
                data: { status: "expired" }
            });
            return false;
        }
    }
    catch (error) {
        logger_1.logger.error("Error expiring escrow:", error);
        return false;
    }
}
async function processExpiredEscrows() {
    try {
        const expiredEscrows = await prisma_1.prisma.escrow.findMany({
            where: {
                status: "open",
                expiresAt: {
                    lt: new Date()
                }
            },
            take: 10 // Process in batches
        });
        logger_1.logger.info(`Processing ${expiredEscrows.length} expired escrows`);
        for (const escrow of expiredEscrows) {
            await expireEscrow(escrow.id);
            // Small delay to avoid overwhelming the network
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    catch (error) {
        logger_1.logger.error("Error processing expired escrows:", error);
    }
}
async function getEscrowInfo(escrowId) {
    try {
        const escrow = await prisma_1.prisma.escrow.findUnique({
            where: { id: escrowId }
        });
        if (!escrow)
            return null;
        const token = await (0, tokens_1.resolveToken)(escrow.mint);
        const amount = Number(escrow.amountRaw) / (10 ** (token?.decimals || 9));
        return {
            id: escrow.id,
            amount,
            token: token?.ticker || escrow.mint,
            payeeHandle: escrow.payeeHandle,
            status: escrow.status,
            expiresAt: escrow.expiresAt,
            claimUrl: `${env_1.env.APP_BASE_URL}/claim/${escrowId}`
        };
    }
    catch (error) {
        logger_1.logger.error("Error getting escrow info:", error);
        return null;
    }
}
// Start background process for expired escrows (call this from main app)
function startEscrowCleanup() {
    const intervalMinutes = 60; // Check every hour
    setInterval(async () => {
        await processExpiredEscrows();
    }, intervalMinutes * 60 * 1000);
    logger_1.logger.info(`Escrow cleanup process started (interval: ${intervalMinutes}m)`);
}
