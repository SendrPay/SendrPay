import { env } from "../infra/env";
import { resolveToken } from "./tokens";

export interface FeeCalculation {
  feeRaw: bigint;
  netRaw: bigint;
  feeAmount: number;
  netAmount: number;
}

export function calcFeeRaw(amountRaw: bigint, bps: number, minRaw: bigint): { feeRaw: bigint, netRaw: bigint } {
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

export async function calculateFee(
  amountRaw: bigint,
  mint: string,
  customFeeBps?: number
): Promise<FeeCalculation> {
  const token = await resolveToken(mint);
  if (!token) {
    throw new Error("Unknown token");
  }

  // Get fee rate (custom override or global default)
  const feeBps = customFeeBps ?? parseInt(env.FEE_BPS || "50");

  // Get minimum fee for this token (keep original 5000 lamports)
  let minRaw = BigInt(env.FEE_MIN_RAW_SOL || "5000"); // Default for SOL

  // Parse per-token minimums if configured
  if (env.FEE_MIN_RAW_BY_MINT) {
    try {
      const minsByMint = JSON.parse(env.FEE_MIN_RAW_BY_MINT);
      const tokenMin = minsByMint[token.ticker] || minsByMint[mint];
      if (tokenMin) {
        minRaw = BigInt(tokenMin);
      }
    } catch (error) {
      // Use default if parsing fails
    }
  }

  const { feeRaw, netRaw } = calcFeeRaw(amountRaw, feeBps, minRaw);

  return {
    feeRaw,
    netRaw,
    feeAmount: Number(feeRaw) / (10 ** token.decimals),
    netAmount: Number(netRaw) / (10 ** token.decimals)
  };
}

export function validateAmount(amountRaw: bigint, mint: string): boolean {
  if (amountRaw <= 0n) return false;

  // Basic sanity checks
  const maxAmount = BigInt("1000000000000000000"); // Very large number
  if (amountRaw > maxAmount) return false;

  return true;
}

export function formatFeeBreakdown(
  grossAmount: number,
  feeAmount: number,
  netAmount: number,
  ticker: string
): string {
  return `💰 **Payment Breakdown**

Gross: ${grossAmount.toFixed(6)} ${ticker}
Fee: ${feeAmount.toFixed(6)} ${ticker}
Net: ${netAmount.toFixed(6)} ${ticker}`;
}

export async function getFeeInfo(mint: string): Promise<{
  feeBps: number;
  minRaw: bigint;
  feePercentage: string;
}> {
  const token = await resolveToken(mint);
  if (!token) {
    throw new Error("Unknown token");
  }

  const feeBps = parseInt(env.FEE_BPS || "50");
  let minRaw = BigInt(env.FEE_MIN_RAW_SOL || "5000");

  // Get token-specific minimum
  if (env.FEE_MIN_RAW_BY_MINT) {
    try {
      const minsByMint = JSON.parse(env.FEE_MIN_RAW_BY_MINT);
      const tokenMin = minsByMint[token.ticker] || minsByMint[mint];
      if (tokenMin) {
        minRaw = BigInt(tokenMin);
      }
    } catch {
      // Use default
    }
  }

  return {
    feeBps,
    minRaw,
    feePercentage: (feeBps / 100).toFixed(2) + "%"
  };
}
