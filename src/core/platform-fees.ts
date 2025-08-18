import { prisma } from "../infra/prisma";
import { logger } from "../infra/logger";
import { env } from "../infra/env";
import { resolveToken } from "./tokens";
import { getWalletKeypair, getWalletBalance } from "./wallets";
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

    // Get connection for balance checking and transaction execution
    const connection = new Connection(env.RPC_URL!);
    
    // Check balance using proper token identification and comprehensive cost calculation
    const balance = await getWalletBalance(sender.wallets[0].address);
    
    // For SOL transfers, check SOL balance including transaction costs and rent exemption
    if (token.mint === 'So11111111111111111111111111111111111111112') {
      const solBalance = balance?.find(b => b.mint === "SOL");
      
      if (!solBalance) {
        return { success: false, error: "No SOL balance found" };
      }
      
      // Calculate total cost: amount + platform fee + transaction fee + potential rent exemption
      const recipientPubkey = new PublicKey(recipient.wallets[0].address);
      const recipientBalance = await connection.getBalance(recipientPubkey);
      
      const rentExemptMinimum = 890880; // ~0.00089 SOL
      const estimatedTxFee = 10000; // ~0.00001 SOL for transaction fee
      const recipientFunding = recipientBalance === 0 ? BigInt(rentExemptMinimum) : 0n;
      
      const totalRequired = amountRaw + recipientFunding + BigInt(estimatedTxFee);
      
      if (BigInt(solBalance.amount) < totalRequired) {
        const requiredSol = Number(totalRequired) / 1e9;
        const availableSol = solBalance.uiAmount;
        return { 
          success: false, 
          error: `Insufficient SOL balance. Required: ${requiredSol.toFixed(6)} SOL (including fees and rent), Available: ${availableSol.toFixed(4)} SOL` 
        };
      }
    } else {
      // For SPL tokens, check token balance
      const tokenBalance = balance?.find(b => b.mint === token.mint);
      
      if (!tokenBalance || BigInt(tokenBalance.amount) < amountRaw) {
        const requiredTokens = Number(amountRaw) / (10 ** token.decimals);
        const availableTokens = tokenBalance ? Number(tokenBalance.amount) / (10 ** token.decimals) : 0;
        return { 
          success: false, 
          error: `Insufficient ${token.ticker} balance. Required: ${requiredTokens.toFixed(4)} ${token.ticker}, Available: ${availableTokens.toFixed(4)} ${token.ticker}` 
        };
      }
    }

    // Get sender keypair
    const senderKeypair = await getWalletKeypair(sender.wallets[0].address);
    if (!senderKeypair) {
      return { success: false, error: "Could not access sender wallet" };
    }

    // Create transaction
    const transaction = new Transaction();

    // Get platform wallet (treasury) - for now use admin wallet
    const adminWalletAddress = "YryMHU4nLRMjkAKtaVpo41tEScrRxwfNnXggoKwC8fS";
    const platformWallet = new PublicKey(adminWalletAddress);

    if (token.mint === 'So11111111111111111111111111111111111111112') {
      // Native SOL transfers
      const recipientPubkey = new PublicKey(recipient.wallets[0].address);
      const recipientBalance = await connection.getBalance(recipientPubkey);
      
      // If recipient has 0 balance, add rent exemption funding
      if (recipientBalance === 0) {
        const rentExemptMinimum = 890880; // ~0.00089 SOL
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: senderKeypair.publicKey,
            toPubkey: recipientPubkey,
            lamports: rentExemptMinimum + Number(netAmountRaw)
          })
        );
      } else {
        // Transfer to recipient (existing wallet)
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: senderKeypair.publicKey,
            toPubkey: recipientPubkey,
            lamports: Number(netAmountRaw)
          })
        );
      }

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

    // Send transaction with timeout
    logger.info(`Sending transaction for ${amount} ${tokenTicker} from ${senderId} to ${recipientId}`);
    
    const signature = await Promise.race([
      sendAndConfirmTransaction(
        connection,
        transaction,
        [senderKeypair],
        {
          commitment: 'confirmed',
          preflightCommitment: 'confirmed',
          maxRetries: 3
        }
      ),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Transaction timeout after 30 seconds')), 30000)
      )
    ]);
    
    logger.info(`Transaction confirmed with signature: ${signature}`);

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