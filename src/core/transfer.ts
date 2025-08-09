import {
  Connection,
  Transaction,
  SystemProgram,
  PublicKey,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TokenAccountNotFoundError
} from "@solana/spl-token";
import { getWalletKeypair } from "./wallets";
import { env } from "../infra/env";
import { logger } from "../infra/logger";
import type { Token } from "./tokens";

export interface TransferParams {
  fromWallet: { address: string };
  toAddress: string;
  mint: string;
  amountRaw: bigint;
  feeRaw: bigint;
  serviceFeeRaw?: bigint;
  serviceFeeToken?: string; // Mint address for service fee token
  token: Token;
  isWithdrawal?: boolean;
  isGiveaway?: boolean;
}

export interface TransferResult {
  success: boolean;
  signature?: string;
  error?: string;
}

const connection = new Connection(env.RPC_URL!, 'confirmed');

export async function executeTransfer(params: TransferParams): Promise<TransferResult> {
  try {
    const {
      fromWallet,
      toAddress,
      mint,
      amountRaw,
      feeRaw,
      serviceFeeRaw = 0n,
      serviceFeeToken,
      token,
      isWithdrawal = false,
      isGiveaway = false
    } = params;

    // Get sender keypair
    const senderKeypair = await getWalletKeypair(fromWallet.address);
    if (!senderKeypair) {
      return { success: false, error: "Sender wallet not found or inaccessible" };
    }

    const senderPubkey = new PublicKey(fromWallet.address);
    const recipientPubkey = new PublicKey(toAddress);
    
    // Admin service fee wallet address
    const adminWalletAddress = "YryMHU4nLRMjkAKtaVpo41tEScrRxwfNnXggoKwC8fS";
    const adminPubkey = new PublicKey(adminWalletAddress);
    
    // Get fee treasury keypair for transaction fees (optional)
    let feeKeypair = null;
    if (!isWithdrawal && feeRaw > 0n) {
      try {
        feeKeypair = env.FEE_TREASURY_SECRET ? 
          JSON.parse(env.FEE_TREASURY_SECRET) : null;
      } catch (error) {
        logger.warn("Fee treasury keypair not configured");
      }
    }

    const transaction = new Transaction();

    if (mint === "So11111111111111111111111111111111111111112") {
      // Native SOL transfer
      // Send net amount to recipient (not full amount)
      const netAmount = amountRaw - feeRaw - (serviceFeeRaw || 0n);
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: senderPubkey,
          toPubkey: recipientPubkey,
          lamports: Number(netAmount)
        })
      );

      // Send transaction fee to treasury (if not a withdrawal)
      if (!isWithdrawal && feeRaw > 0n && feeKeypair) {
        const feeTreasuryPubkey = new PublicKey((feeKeypair as any).publicKey);
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: senderPubkey,
            toPubkey: feeTreasuryPubkey,
            lamports: Number(feeRaw)
          })
        );
      }

      // Handle flexible service fee - could be in SOL or same token
      if (!isWithdrawal && serviceFeeRaw > 0n) {
        const serviceFeeTokenMint = serviceFeeToken || mint; // Default to transfer token if not specified
        
        if (serviceFeeTokenMint === "So11111111111111111111111111111111111111112") {
          // Service fee in SOL
          transaction.add(
            SystemProgram.transfer({
              fromPubkey: senderPubkey,
              toPubkey: adminPubkey,
              lamports: Number(serviceFeeRaw)
            })
          );
        } else {
          // Service fee in different SPL token - for now, default to SOL since we need to handle cross-token transfers carefully
          // In a full implementation, you'd need to handle token-to-token conversions or separate transfers
          transaction.add(
            SystemProgram.transfer({
              fromPubkey: senderPubkey,
              toPubkey: adminPubkey,
              lamports: Number(serviceFeeRaw) // This assumes serviceFeeRaw is already converted to lamports for SOL fallback
            })
          );
        }
      }
    } else {
      // SPL Token transfer
      const mintPubkey = new PublicKey(mint);
      
      // Get sender's token account
      const senderTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        senderPubkey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      // Get or create recipient's token account
      const recipientTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        recipientPubkey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      // Check if recipient account exists, create if needed
      try {
        await getAccount(connection, recipientTokenAccount);
      } catch (error) {
        if (error instanceof TokenAccountNotFoundError) {
          transaction.add(
            createAssociatedTokenAccountInstruction(
              senderPubkey, // payer
              recipientTokenAccount,
              recipientPubkey, // owner
              mintPubkey,
              TOKEN_PROGRAM_ID,
              ASSOCIATED_TOKEN_PROGRAM_ID
            )
          );
        }
      }

      // Transfer net amount to recipient (not full amount)
      const netAmount = amountRaw - feeRaw - (serviceFeeRaw || 0n);
      transaction.add(
        createTransferInstruction(
          senderTokenAccount,
          recipientTokenAccount,
          senderPubkey,
          Number(netAmount),
          [],
          TOKEN_PROGRAM_ID
        )
      );

      // Transfer fee to treasury (if not a withdrawal)
      if (!isWithdrawal && feeRaw > 0n && feeKeypair) {
        const feeTreasuryPubkey = new PublicKey((feeKeypair as any).publicKey);
        const feeTokenAccount = await getAssociatedTokenAddress(
          mintPubkey,
          feeTreasuryPubkey,
          false,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );

        // Create fee treasury token account if needed
        try {
          await getAccount(connection, feeTokenAccount);
        } catch (error) {
          if (error instanceof TokenAccountNotFoundError) {
            transaction.add(
              createAssociatedTokenAccountInstruction(
                senderPubkey, // payer
                feeTokenAccount,
                feeTreasuryPubkey, // owner
                mintPubkey,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
              )
            );
          }
        }

        transaction.add(
          createTransferInstruction(
            senderTokenAccount,
            feeTokenAccount,
            senderPubkey,
            Number(feeRaw),
            [],
            TOKEN_PROGRAM_ID
          )
        );
      }

      // Handle flexible service fee for SPL tokens
      if (!isWithdrawal && serviceFeeRaw > 0n) {
        const serviceFeeTokenMint = serviceFeeToken || mint; // Default to transfer token if not specified
        
        if (serviceFeeTokenMint === mint) {
          // Service fee in same SPL token as transfer
          const adminTokenAccount = await getAssociatedTokenAddress(
            mintPubkey,
            adminPubkey,
            false,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          );

          // Create admin token account if needed
          try {
            await getAccount(connection, adminTokenAccount);
          } catch (error) {
            if (error instanceof TokenAccountNotFoundError) {
              transaction.add(
                createAssociatedTokenAccountInstruction(
                  senderPubkey, // payer
                  adminTokenAccount,
                  adminPubkey, // owner
                  mintPubkey,
                  TOKEN_PROGRAM_ID,
                  ASSOCIATED_TOKEN_PROGRAM_ID
                )
              );
            }
          }

          transaction.add(
            createTransferInstruction(
              senderTokenAccount,
              adminTokenAccount,
              senderPubkey,
              Number(serviceFeeRaw),
              [],
              TOKEN_PROGRAM_ID
            )
          );
        } else if (serviceFeeTokenMint === "So11111111111111111111111111111111111111112") {
          // Service fee in SOL (fallback case for SPL token transfers)
          transaction.add(
            SystemProgram.transfer({
              fromPubkey: senderPubkey,
              toPubkey: adminPubkey,
              lamports: Number(serviceFeeRaw)
            })
          );
        }
      }
    }

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = senderPubkey;

    // Sign transaction
    transaction.sign(senderKeypair);

    // Send transaction
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed'
    });

    // Confirm transaction
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight
    }, 'confirmed');

    if (confirmation.value.err) {
      return {
        success: false,
        error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`
      };
    }

    logger.info(`Transfer completed: ${signature}`);
    return { success: true, signature };

  } catch (error) {
    logger.error("Transfer execution error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

export async function estimateTransactionFee(
  fromAddress: string,
  toAddress: string,
  mint: string,
  amountRaw: bigint
): Promise<number | null> {
  try {
    const senderPubkey = new PublicKey(fromAddress);
    const recipientPubkey = new PublicKey(toAddress);
    
    const transaction = new Transaction();

    if (mint === "So11111111111111111111111111111111111111112") {
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: senderPubkey,
          toPubkey: recipientPubkey,
          lamports: Number(amountRaw)
        })
      );
    } else {
      const mintPubkey = new PublicKey(mint);
      const senderTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        senderPubkey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const recipientTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        recipientPubkey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      transaction.add(
        createTransferInstruction(
          senderTokenAccount,
          recipientTokenAccount,
          senderPubkey,
          Number(amountRaw),
          [],
          TOKEN_PROGRAM_ID
        )
      );
    }

    const feeEstimate = await connection.getFeeForMessage(
      transaction.compileMessage(),
      'confirmed'
    );

    return feeEstimate.value;
  } catch (error) {
    logger.error("Fee estimation error:", error);
    return null;
  }
}

export async function checkSufficientBalance(
  address: string,
  mint: string,
  requiredAmount: bigint
): Promise<boolean> {
  try {
    if (mint === "So11111111111111111111111111111111111111112") {
      const balance = await connection.getBalance(new PublicKey(address));
      return BigInt(balance) >= requiredAmount;
    } else {
      const mintPubkey = new PublicKey(mint);
      const tokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        new PublicKey(address),
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      try {
        const account = await getAccount(connection, tokenAccount);
        return account.amount >= requiredAmount;
      } catch (error) {
        if (error instanceof TokenAccountNotFoundError) {
          return false; // No token account = no balance
        }
        throw error;
      }
    }
  } catch (error) {
    logger.error("Balance check error:", error);
    return false;
  }
}
