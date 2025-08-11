"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.determineServiceFeeToken = determineServiceFeeToken;
exports.calculateServiceFee = calculateServiceFee;
exports.calcFeeRaw = calcFeeRaw;
exports.calculateFee = calculateFee;
exports.validateAmount = validateAmount;
exports.formatFeeBreakdown = formatFeeBreakdown;
exports.generateFeeConfirmationMessage = generateFeeConfirmationMessage;
exports.isBlueChipToken = isBlueChipToken;
exports.getFeeInfo = getFeeInfo;
const env_1 = require("../infra/env");
const tokens_1 = require("./tokens");
// Blue-chip tokens that can be used for service fees
const BLUE_CHIP_TOKENS = new Set([
    "So11111111111111111111111111111111111111112", // SOL
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // BONK
    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", // JUP
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
    "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs", // ETH (wrapped)
    "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E" // BTC (wrapped)
]);
// Get display names for blue-chip tokens
const BLUE_CHIP_TOKEN_NAMES = {
    "So11111111111111111111111111111111111111112": "SOL",
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
    "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": "BONK",
    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": "JUP",
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "USDT",
    "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": "ETH",
    "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E": "BTC"
};
/**
 * Determine which token to use for the 0.25% service fee
 * Priority: Same token as transfer (if blue-chip) > SOL fallback
 */
async function determineServiceFeeToken(transferMint) {
    const SOL_MINT = "So11111111111111111111111111111111111111112";
    // If transferring a blue-chip token, take fee in same token
    if (BLUE_CHIP_TOKENS.has(transferMint)) {
        const token = await (0, tokens_1.resolveToken)(transferMint);
        const tickerName = token?.ticker || BLUE_CHIP_TOKEN_NAMES[transferMint] || "UNKNOWN";
        return {
            serviceFeeRaw: 0n, // Will be calculated later
            serviceFeeToken: transferMint,
            serviceFeeTokenTicker: tickerName,
            fallbackToSol: false
        };
    }
    // Fallback to SOL for non-blue-chip tokens
    return {
        serviceFeeRaw: 0n, // Will be calculated later
        serviceFeeToken: SOL_MINT,
        serviceFeeTokenTicker: "SOL",
        fallbackToSol: true
    };
}
/**
 * Calculate 0.25% service fee in the appropriate token
 */
async function calculateServiceFee(transferAmountRaw, transferMint, transferToken) {
    const feeResult = await determineServiceFeeToken(transferMint);
    if (feeResult.fallbackToSol) {
        // For SOL fallback, convert transfer amount to SOL equivalent and take 0.25%
        // For simplicity, we'll use a fixed SOL fee amount as fallback
        // In production, you might want to use price oracles for conversion
        feeResult.serviceFeeRaw = BigInt(1250); // ~0.000001250 SOL (very small fixed fee)
    }
    else {
        // Take 0.25% in the same token as transfer
        feeResult.serviceFeeRaw = (transferAmountRaw * 25n) / 10000n; // 0.25%
    }
    return feeResult;
}
function calcFeeRaw(amountRaw, bps, minRaw) {
    if (amountRaw <= 0n) {
        throw new Error("Amount must be positive");
    }
    // Calculate percentage fee
    const pctFee = (amountRaw * BigInt(bps)) / BigInt(10_000);
    // Use minimum fee if percentage is lower
    const feeRaw = pctFee < minRaw ? minRaw : pctFee;
    // Check if fee would consume entire amount
    if (feeRaw >= amountRaw) {
        throw new Error("Amount too small after fees");
    }
    const netRaw = amountRaw - feeRaw;
    return { feeRaw, netRaw };
}
async function calculateFee(amountRaw, mint, customFeeBps) {
    const token = await (0, tokens_1.resolveToken)(mint);
    if (!token) {
        throw new Error("Unknown token");
    }
    // Get fee rate (custom override or global default)
    const feeBps = customFeeBps ?? parseInt(env_1.env.FEE_BPS || "50");
    // Get minimum fee for this token (keep original 5000 lamports)
    let minRaw = BigInt(env_1.env.FEE_MIN_RAW_SOL || "5000"); // Default for SOL
    // Parse per-token minimums if configured
    if (env_1.env.FEE_MIN_RAW_BY_MINT) {
        try {
            const minsByMint = JSON.parse(env_1.env.FEE_MIN_RAW_BY_MINT);
            const tokenMin = minsByMint[token.ticker] || minsByMint[mint];
            if (tokenMin) {
                minRaw = BigInt(tokenMin);
            }
        }
        catch (error) {
            // Use default if parsing fails
        }
    }
    // Calculate transaction fee (percentage of amount or minimum)
    const pctFee = (amountRaw * BigInt(feeBps)) / BigInt(10_000);
    const feeRaw = pctFee < minRaw ? minRaw : pctFee;
    // Calculate flexible 0.25% service fee using blue-chip token or SOL fallback
    const serviceFeeResult = await calculateServiceFee(amountRaw, mint, token);
    // IMPORTANT: Receiver gets the FULL amount sent
    // The sender pays: amount + transaction fee + service fee
    const netRaw = amountRaw; // Receiver gets full amount
    return {
        feeRaw,
        serviceFeeRaw: serviceFeeResult.serviceFeeRaw,
        serviceFeeToken: serviceFeeResult.serviceFeeToken,
        netRaw, // This is what the receiver gets (full amount)
        feeAmount: Number(feeRaw) / (10 ** token.decimals),
        serviceFeeAmount: Number(serviceFeeResult.serviceFeeRaw) / (10 ** (serviceFeeResult.fallbackToSol ? 9 : token.decimals)),
        netAmount: Number(netRaw) / (10 ** token.decimals)
    };
}
function validateAmount(amountRaw, mint) {
    if (amountRaw <= 0n)
        return false;
    // Basic sanity checks
    const maxAmount = BigInt("1000000000000000000"); // Very large number
    if (amountRaw > maxAmount)
        return false;
    return true;
}
function formatFeeBreakdown(grossAmount, feeAmount, netAmount, ticker) {
    return `💰 **Payment Breakdown**

Gross: ${grossAmount.toFixed(6)} ${ticker}
Fee: ${feeAmount.toFixed(6)} ${ticker}
Net: ${netAmount.toFixed(6)} ${ticker}`;
}
/**
 * Generate user confirmation message showing which token will be used for service fee
 */
async function generateFeeConfirmationMessage(transferAmountRaw, transferMint, transferToken) {
    const serviceFeeResult = await calculateServiceFee(transferAmountRaw, transferMint, transferToken);
    const serviceFeeAmountFormatted = (Number(serviceFeeResult.serviceFeeRaw) /
        (10 ** (serviceFeeResult.fallbackToSol ? 9 : transferToken.decimals))).toFixed(6);
    if (serviceFeeResult.fallbackToSol) {
        return `We will take a 0.25% fee (${serviceFeeAmountFormatted} ${serviceFeeResult.serviceFeeTokenTicker}) in SOL as a fallback.`;
    }
    else {
        return `We will take a 0.25% fee (${serviceFeeAmountFormatted} ${serviceFeeResult.serviceFeeTokenTicker}) in ${serviceFeeResult.serviceFeeTokenTicker}.`;
    }
}
/**
 * Check if a token is a blue-chip token eligible for service fees
 */
function isBlueChipToken(mint) {
    return BLUE_CHIP_TOKENS.has(mint);
}
async function getFeeInfo(mint) {
    const token = await (0, tokens_1.resolveToken)(mint);
    if (!token) {
        throw new Error("Unknown token");
    }
    const feeBps = parseInt(env_1.env.FEE_BPS || "50");
    let minRaw = BigInt(env_1.env.FEE_MIN_RAW_SOL || "5000");
    // Get token-specific minimum
    if (env_1.env.FEE_MIN_RAW_BY_MINT) {
        try {
            const minsByMint = JSON.parse(env_1.env.FEE_MIN_RAW_BY_MINT);
            const tokenMin = minsByMint[token.ticker] || minsByMint[mint];
            if (tokenMin) {
                minRaw = BigInt(tokenMin);
            }
        }
        catch {
            // Use default
        }
    }
    return {
        feeBps,
        minRaw,
        feePercentage: (feeBps / 100).toFixed(2) + "%"
    };
}
