import { prisma } from "../infra/prisma";
import { logger } from "../infra/logger";
import { env } from "../infra/env";
import { resolveToken } from "./tokens";
import { getOrCreateWallet, getWalletKeypair, getWalletBalance } from "./wallets";
import { Connection, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createTransferInstruction } from "@solana/spl-token";

// Platform fee percentages
export const PLATFORM_FEE_TIP = 0.02;    // 2% for tips
export const PLATFORM_FEE_GROUP = 0.05;  // 5% for group access

// Calculate platform fee based on payment type
export function calculatePlatformFee(amountRaw: bigint, paymentType: 'tip' | 'group_access'): bigint {
  const feePercent = paymentType === 'tip' ? PLATFORM_FEE_TIP : PLATFORM_FEE_GROUP;
  return amountRaw * BigInt(Math.floor(feePercent * 100)) / 100n;
}

// Execute payment with platform fee
export async function executePaymentWithPlatformFee(params: {
  senderId: string;
  recipientId: string;
  tokenTicker: string;
  amount: number;
  paymentType: 'tip' | 'group_access';
  platformFeePercent: number;
  note?: string;
}): Promise<{
  success: boolean;
  signature?: string;
  paymentId?: string;
  explorerLink?: string;
  recipientTelegramId?: string;
  error?: string;
}> {
  const { senderId, recipientId, tokenTicker, amount, paymentType, platformFeePercent, note } = params;

  try {
    // Get sender user and wallet
    const sender = await prisma.user.findUnique({
      where: { telegramId: senderId },
      include: { wallets: { where: { isActive: true } } }
    });

    if (!sender?.wallets?.[0]) {
      return { success: false, error: "Sender wallet not found" };
    }

    // Get recipient user and wallet
    const recipient = await prisma.user.findUnique({
      where: { telegramId: recipientId },
      include: { wallets: { where: { isActive: true } } }
    });

    if (!recipient?.wallets?.[0]) {
      return { success: false, error: "Recipient wallet not found" };
    }

    // Get token info
    const token = await resolveToken(tokenTicker);
    if (!token) {
      return { success: false, error: "Invalid token" };
    }

    // Calculate amounts
    const amountRaw = BigInt(Math.floor(amount * Math.pow(10, token.decimals)));
    const platformFeeRaw = amountRaw * BigInt(Math.floor(platformFeePercent * 100)) / 100n;
    const netAmountRaw = amountRaw - platformFeeRaw;

    // Check balance
    const balance = await getWalletBalance(sender.wallets[0].address);
    const tokenBalance = balance.find(b => b.mint === token.mint);
    
    if (!tokenBalance || BigInt(tokenBalance.amount) < amountRaw) {
      return { success: false, error: "Insufficient balance" };
    }

    // Get connection
    const connection = new Connection(env.SOLANA_RPC_URL);

    // Get sender keypair
    const senderKeypair = await getWalletKeypair(sender.wallets[0]);
    if (!senderKeypair) {
      return { success: false, error: "Could not access sender wallet" };
    }

    // Create transaction
    const transaction = new Transaction();

    // Get platform wallet (treasury)
    const platformWallet = env.FEE_TREASURY_ADDRESS || env.FEE_TREASURY_SECRET ? 
      new PublicKey(env.FEE_TREASURY_ADDRESS || (await getWalletKeypair({ address: "", encPrivKey: Buffer.from(env.FEE_TREASURY_SECRET, 'base64') }))!.publicKey) :
      senderKeypair.publicKey; // Fallback to sender if no treasury configured

    if (token.mint === 'SOL') {
      // Native SOL transfers
      // Transfer to recipient
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: senderKeypair.publicKey,
          toPubkey: new PublicKey(recipient.wallets[0].address),
          lamports: Number(netAmountRaw)
        })
      );

      // Transfer platform fee
      if (platformFeeRaw > 0n && platformWallet.toString() !== senderKeypair.publicKey.toString()) {
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: senderKeypair.publicKey,
            toPubkey: platformWallet,
            lamports: Number(platformFeeRaw)
          })
        );
      }
    } else {
      // SPL token transfers
      const mintPubkey = new PublicKey(token.mint);
      
      // Get token accounts
      const senderTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        senderKeypair.publicKey
      );
      
      const recipientTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        new PublicKey(recipient.wallets[0].address)
      );
      
      const platformTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        platformWallet
      );

      // Transfer to recipient
      transaction.add(
        createTransferInstruction(
          senderTokenAccount,
          recipientTokenAccount,
          senderKeypair.publicKey,
          Number(netAmountRaw),
          [],
          TOKEN_PROGRAM_ID
        )
      );

      // Transfer platform fee
      if (platformFeeRaw > 0n && platformWallet.toString() !== senderKeypair.publicKey.toString()) {
        transaction.add(
          createTransferInstruction(
            senderTokenAccount,
            platformTokenAccount,
            senderKeypair.publicKey,
            Number(platformFeeRaw),
            [],
            TOKEN_PROGRAM_ID
          )
        );
      }
    }

    // Send transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [senderKeypair],
      { commitment: 'confirmed' }
    );

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        clientIntentId: `${paymentType}_${Date.now()}_${Math.random()}`,
        fromUserId: sender.id,
        toUserId: recipient.id,
        fromWallet: sender.wallets[0].address,
        toWallet: recipient.wallets[0].address,
        mint: token.mint,
        amountRaw: amountRaw.toString(),
        feeRaw: "0", // Network fee (separate from platform fee)
        platformFeeRaw: platformFeeRaw.toString(),
        paymentType,
        note,
        status: "confirmed",
        txSig: signature
      }
    });

    // Create transaction record for tracking
    await prisma.transaction.create({
      data: {
        signature,
        senderTelegramId: senderId,
        recipientTelegramId: recipientId,
        recipientAddress: recipient.wallets[0].address,
        amount: amount.toString(),
        tokenMint: token.mint,
        tokenTicker: token.ticker,
        serviceFee: platformFeeRaw.toString(),
        type: paymentType,
        status: "confirmed"
      }
    });

    const explorerLink = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;

    logger.info(`Payment with platform fee executed: ${signature}`);

    return {
      success: true,
      signature,
      paymentId: payment.id,
      explorerLink,
      recipientTelegramId: recipientId
    };

  } catch (error) {
    logger.error("Execute payment with platform fee error:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Payment failed"
    };
  }
}