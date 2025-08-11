"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeTransfer = executeTransfer;
exports.estimateTransactionFee = estimateTransactionFee;
exports.checkSufficientBalance = checkSufficientBalance;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const wallets_1 = require("./wallets");
const env_1 = require("../infra/env");
const logger_1 = require("../infra/logger");
const connection = new web3_js_1.Connection(env_1.env.RPC_URL, 'confirmed');
async function executeTransfer(params) {
    try {
        const { fromWallet, toAddress, mint, amountRaw, feeRaw, serviceFeeRaw = 0n, serviceFeeToken, token, isWithdrawal = false, senderTelegramId, recipientTelegramId, note, type = "payment" } = params;
        // Get sender keypair
        const senderKeypair = await (0, wallets_1.getWalletKeypair)(fromWallet.address);
        if (!senderKeypair) {
            return { success: false, error: "Sender wallet not found or inaccessible" };
        }
        const senderPubkey = new web3_js_1.PublicKey(fromWallet.address);
        const recipientPubkey = new web3_js_1.PublicKey(toAddress);
        // Admin service fee wallet address
        const adminWalletAddress = "YryMHU4nLRMjkAKtaVpo41tEScrRxwfNnXggoKwC8fS";
        const adminPubkey = new web3_js_1.PublicKey(adminWalletAddress);
        // Get fee treasury keypair for transaction fees (optional)
        let feeKeypair = null;
        if (!isWithdrawal && feeRaw > 0n) {
            try {
                feeKeypair = env_1.env.FEE_TREASURY_SECRET ?
                    JSON.parse(env_1.env.FEE_TREASURY_SECRET) : null;
            }
            catch (error) {
                logger_1.logger.warn("Fee treasury keypair not configured");
            }
        }
        // CRITICAL: Check if sender has sufficient balance for amount + all fees + potential admin/recipient funding
        const adminBalance = await connection.getBalance(adminPubkey);
        const recipientBalance = await connection.getBalance(recipientPubkey);
        const rentExemptMinimum = 890880; // ~0.00089 SOL
        const adminFunding = adminBalance < rentExemptMinimum ? BigInt(rentExemptMinimum - adminBalance) : 0n;
        const recipientFunding = recipientBalance === 0 ? BigInt(rentExemptMinimum) : 0n; // New wallets need rent exemption
        const totalRequired = amountRaw + feeRaw + (serviceFeeRaw || 0n) + adminFunding + recipientFunding;
        if (mint === "So11111111111111111111111111111111111111112") {
            // For SOL transfers, check SOL balance
            const senderBalance = await connection.getBalance(senderPubkey);
            const rentExemptMinimum = 890880; // Minimum SOL for rent exemption (~0.00089 SOL)
            const estimatedTxFee = 10000; // ~0.00001 SOL for transaction fee
            if (BigInt(senderBalance) < totalRequired + BigInt(rentExemptMinimum + estimatedTxFee)) {
                const requiredSol = Number(totalRequired + BigInt(rentExemptMinimum + estimatedTxFee)) / web3_js_1.LAMPORTS_PER_SOL;
                const availableSol = senderBalance / web3_js_1.LAMPORTS_PER_SOL;
                return {
                    success: false,
                    error: `Insufficient SOL balance. Required: ${requiredSol.toFixed(6)} SOL, Available: ${availableSol.toFixed(6)} SOL`
                };
            }
            // Log balance check details for debugging
            logger_1.logger.info(`Balance check passed - Available: ${senderBalance / web3_js_1.LAMPORTS_PER_SOL} SOL, Required: ${Number(totalRequired + BigInt(rentExemptMinimum + estimatedTxFee)) / web3_js_1.LAMPORTS_PER_SOL} SOL`);
        }
        else {
            // For SPL token transfers, check token balance + SOL for fees
            try {
                const mintPubkey = new web3_js_1.PublicKey(mint);
                const senderTokenAccount = await (0, spl_token_1.getAssociatedTokenAddress)(mintPubkey, senderPubkey, false, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
                const tokenAccountInfo = await (0, spl_token_1.getAccount)(connection, senderTokenAccount);
                if (tokenAccountInfo.amount < totalRequired) {
                    const requiredTokens = Number(totalRequired) / (10 ** token.decimals);
                    const availableTokens = Number(tokenAccountInfo.amount) / (10 ** token.decimals);
                    return {
                        success: false,
                        error: `Insufficient ${token.ticker} balance. Required: ${requiredTokens} ${token.ticker}, Available: ${availableTokens} ${token.ticker}`
                    };
                }
                // Also check SOL balance for transaction fees and potential service fees in SOL
                const senderSolBalance = await connection.getBalance(senderPubkey);
                const solFeesRequired = (serviceFeeToken === "So11111111111111111111111111111111111111112" ? serviceFeeRaw : 0n) + 15000n; // tx fee estimate
                if (BigInt(senderSolBalance) < solFeesRequired + 890880n) { // Include rent exemption
                    const requiredSol = Number(solFeesRequired + 890880n) / web3_js_1.LAMPORTS_PER_SOL;
                    const availableSol = senderSolBalance / web3_js_1.LAMPORTS_PER_SOL;
                    return {
                        success: false,
                        error: `Insufficient SOL for fees. Required: ${requiredSol.toFixed(6)} SOL, Available: ${availableSol.toFixed(6)} SOL`
                    };
                }
            }
            catch (error) {
                return { success: false, error: `Token account error: ${error instanceof Error ? error.message : "Unknown error"}` };
            }
        }
        const transaction = new web3_js_1.Transaction();
        if (mint === "So11111111111111111111111111111111111111112") {
            // Native SOL transfer
            // IMPORTANT: Check if recipient needs funding for rent exemption (new wallets have 0 balance)
            const recipientBalance = await connection.getBalance(recipientPubkey);
            const rentExemptMinimum = 890880; // ~0.00089 SOL
            let totalToRecipient = Number(amountRaw);
            // If recipient has 0 balance (new wallet), they need rent exemption funding on top of transfer amount
            if (recipientBalance === 0) {
                totalToRecipient = Number(amountRaw) + rentExemptMinimum;
                logger_1.logger.info(`New wallet detected - adding rent exemption funding: ${rentExemptMinimum / web3_js_1.LAMPORTS_PER_SOL} SOL`);
            }
            // IMPORTANT: Recipient gets the FULL amount + rent exemption if needed, sender pays all costs
            transaction.add(web3_js_1.SystemProgram.transfer({
                fromPubkey: senderPubkey,
                toPubkey: recipientPubkey,
                lamports: totalToRecipient // Full amount + rent exemption for new wallets
            }));
            // Send transaction fee to treasury (if not a withdrawal)
            if (!isWithdrawal && feeRaw > 0n && feeKeypair) {
                const feeTreasuryPubkey = new web3_js_1.PublicKey(feeKeypair.publicKey);
                transaction.add(web3_js_1.SystemProgram.transfer({
                    fromPubkey: senderPubkey,
                    toPubkey: feeTreasuryPubkey,
                    lamports: Number(feeRaw)
                }));
            }
            // Handle flexible service fee - could be in SOL or same token
            if (!isWithdrawal && serviceFeeRaw > 0n) {
                const serviceFeeTokenMint = serviceFeeToken || mint; // Default to transfer token if not specified
                if (serviceFeeTokenMint === "So11111111111111111111111111111111111111112") {
                    // Service fee in SOL
                    // CRITICAL FIX: Check if admin wallet has minimum balance for rent exemption
                    const adminBalance = await connection.getBalance(adminPubkey);
                    const rentExemptMinimum = 890880; // ~0.00089 SOL
                    // If admin wallet needs funding for rent exemption, include it
                    const serviceFeeAmount = Number(serviceFeeRaw);
                    const totalToAdmin = adminBalance < rentExemptMinimum
                        ? serviceFeeAmount + (rentExemptMinimum - adminBalance)
                        : serviceFeeAmount;
                    transaction.add(web3_js_1.SystemProgram.transfer({
                        fromPubkey: senderPubkey,
                        toPubkey: adminPubkey,
                        lamports: totalToAdmin
                    }));
                }
                else {
                    // Service fee in different SPL token - for now, default to SOL since we need to handle cross-token transfers carefully
                    // In a full implementation, you'd need to handle token-to-token conversions or separate transfers
                    transaction.add(web3_js_1.SystemProgram.transfer({
                        fromPubkey: senderPubkey,
                        toPubkey: adminPubkey,
                        lamports: Number(serviceFeeRaw) // This assumes serviceFeeRaw is already converted to lamports for SOL fallback
                    }));
                }
            }
        }
        else {
            // SPL Token transfer
            const mintPubkey = new web3_js_1.PublicKey(mint);
            // Get sender's token account
            const senderTokenAccount = await (0, spl_token_1.getAssociatedTokenAddress)(mintPubkey, senderPubkey, false, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
            // Get or create recipient's token account
            const recipientTokenAccount = await (0, spl_token_1.getAssociatedTokenAddress)(mintPubkey, recipientPubkey, false, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
            // Check if recipient account exists, create if needed
            try {
                await (0, spl_token_1.getAccount)(connection, recipientTokenAccount);
            }
            catch (error) {
                if (error instanceof spl_token_1.TokenAccountNotFoundError) {
                    transaction.add((0, spl_token_1.createAssociatedTokenAccountInstruction)(senderPubkey, // payer
                    recipientTokenAccount, recipientPubkey, // owner
                    mintPubkey, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID));
                }
            }
            // IMPORTANT: Recipient gets the FULL amount, sender pays amount + fees
            transaction.add((0, spl_token_1.createTransferInstruction)(senderTokenAccount, recipientTokenAccount, senderPubkey, Number(amountRaw), // Recipient receives full amount
            [], spl_token_1.TOKEN_PROGRAM_ID));
            // Transfer fee to treasury (if not a withdrawal)
            if (!isWithdrawal && feeRaw > 0n && feeKeypair) {
                const feeTreasuryPubkey = new web3_js_1.PublicKey(feeKeypair.publicKey);
                const feeTokenAccount = await (0, spl_token_1.getAssociatedTokenAddress)(mintPubkey, feeTreasuryPubkey, false, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
                // Create fee treasury token account if needed
                try {
                    await (0, spl_token_1.getAccount)(connection, feeTokenAccount);
                }
                catch (error) {
                    if (error instanceof spl_token_1.TokenAccountNotFoundError) {
                        transaction.add((0, spl_token_1.createAssociatedTokenAccountInstruction)(senderPubkey, // payer
                        feeTokenAccount, feeTreasuryPubkey, // owner
                        mintPubkey, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID));
                    }
                }
                transaction.add((0, spl_token_1.createTransferInstruction)(senderTokenAccount, feeTokenAccount, senderPubkey, Number(feeRaw), [], spl_token_1.TOKEN_PROGRAM_ID));
            }
            // Handle flexible service fee for SPL tokens
            if (!isWithdrawal && serviceFeeRaw > 0n) {
                const serviceFeeTokenMint = serviceFeeToken || mint; // Default to transfer token if not specified
                if (serviceFeeTokenMint === mint) {
                    // Service fee in same SPL token as transfer
                    const adminTokenAccount = await (0, spl_token_1.getAssociatedTokenAddress)(mintPubkey, adminPubkey, false, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
                    // Create admin token account if needed
                    try {
                        await (0, spl_token_1.getAccount)(connection, adminTokenAccount);
                    }
                    catch (error) {
                        if (error instanceof spl_token_1.TokenAccountNotFoundError) {
                            transaction.add((0, spl_token_1.createAssociatedTokenAccountInstruction)(senderPubkey, // payer
                            adminTokenAccount, adminPubkey, // owner
                            mintPubkey, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID));
                        }
                    }
                    transaction.add((0, spl_token_1.createTransferInstruction)(senderTokenAccount, adminTokenAccount, senderPubkey, Number(serviceFeeRaw), [], spl_token_1.TOKEN_PROGRAM_ID));
                }
                else if (serviceFeeTokenMint === "So11111111111111111111111111111111111111112") {
                    // Service fee in SOL (fallback case for SPL token transfers)
                    transaction.add(web3_js_1.SystemProgram.transfer({
                        fromPubkey: senderPubkey,
                        toPubkey: adminPubkey,
                        lamports: Number(serviceFeeRaw)
                    }));
                }
            }
        }
        // Get recent blockhash
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = senderPubkey;
        // Sign transaction
        transaction.sign(senderKeypair);
        // Log transaction details for debugging
        const senderBal = await connection.getBalance(senderPubkey);
        const recipientBal = await connection.getBalance(recipientPubkey);
        logger_1.logger.info(`Transaction details - Sender: ${senderBal / web3_js_1.LAMPORTS_PER_SOL} SOL, Recipient: ${recipientBal / web3_js_1.LAMPORTS_PER_SOL} SOL, Amount: ${Number(amountRaw) / web3_js_1.LAMPORTS_PER_SOL} SOL, Fee: ${Number(feeRaw) / web3_js_1.LAMPORTS_PER_SOL} SOL, ServiceFee: ${Number(serviceFeeRaw) / web3_js_1.LAMPORTS_PER_SOL} SOL`);
        // Send transaction with enhanced error handling
        try {
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
            logger_1.logger.info(`Transfer completed: ${signature}`);
            // Record transaction in database for notifications and tracking
            try {
                const { PrismaClient } = await Promise.resolve().then(() => require("@prisma/client"));
                const prisma = new PrismaClient();
                await prisma.transaction.create({
                    data: {
                        signature,
                        senderTelegramId: senderTelegramId || "",
                        recipientTelegramId: recipientTelegramId || null,
                        recipientAddress: toAddress,
                        amount: amountRaw.toString(),
                        tokenMint: mint,
                        tokenTicker: token.ticker,
                        fee: feeRaw?.toString(),
                        serviceFee: serviceFeeRaw?.toString(),
                        note: note || null,
                        type: type,
                        status: "confirmed"
                    }
                });
                await prisma.$disconnect();
            }
            catch (dbError) {
                logger_1.logger.warn("Failed to record transaction in database", dbError);
            }
            return { success: true, signature };
        }
        catch (sendError) {
            logger_1.logger.error("Transaction send error:", sendError);
            return {
                success: false,
                error: sendError instanceof Error ? sendError.message : "Transaction send failed"
            };
        }
    }
    catch (error) {
        logger_1.logger.error("Transfer execution error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error"
        };
    }
}
async function estimateTransactionFee(fromAddress, toAddress, mint, amountRaw) {
    try {
        const senderPubkey = new web3_js_1.PublicKey(fromAddress);
        const recipientPubkey = new web3_js_1.PublicKey(toAddress);
        const transaction = new web3_js_1.Transaction();
        if (mint === "So11111111111111111111111111111111111111112") {
            transaction.add(web3_js_1.SystemProgram.transfer({
                fromPubkey: senderPubkey,
                toPubkey: recipientPubkey,
                lamports: Number(amountRaw)
            }));
        }
        else {
            const mintPubkey = new web3_js_1.PublicKey(mint);
            const senderTokenAccount = await (0, spl_token_1.getAssociatedTokenAddress)(mintPubkey, senderPubkey, false, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
            const recipientTokenAccount = await (0, spl_token_1.getAssociatedTokenAddress)(mintPubkey, recipientPubkey, false, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
            transaction.add((0, spl_token_1.createTransferInstruction)(senderTokenAccount, recipientTokenAccount, senderPubkey, Number(amountRaw), [], spl_token_1.TOKEN_PROGRAM_ID));
        }
        const feeEstimate = await connection.getFeeForMessage(transaction.compileMessage(), 'confirmed');
        return feeEstimate.value;
    }
    catch (error) {
        logger_1.logger.error("Fee estimation error:", error);
        return null;
    }
}
async function checkSufficientBalance(address, mint, requiredAmount) {
    try {
        if (mint === "So11111111111111111111111111111111111111112") {
            const balance = await connection.getBalance(new web3_js_1.PublicKey(address));
            return BigInt(balance) >= requiredAmount;
        }
        else {
            const mintPubkey = new web3_js_1.PublicKey(mint);
            const tokenAccount = await (0, spl_token_1.getAssociatedTokenAddress)(mintPubkey, new web3_js_1.PublicKey(address), false, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
            try {
                const account = await (0, spl_token_1.getAccount)(connection, tokenAccount);
                return account.amount >= requiredAmount;
            }
            catch (error) {
                if (error instanceof spl_token_1.TokenAccountNotFoundError) {
                    return false; // No token account = no balance
                }
                throw error;
            }
        }
    }
    catch (error) {
        logger_1.logger.error("Balance check error:", error);
        return false;
    }
}
