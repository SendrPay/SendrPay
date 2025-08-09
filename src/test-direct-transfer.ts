import { executeTransfer } from "./core/transfer";
import { resolveToken } from "./core/tokens";
import { PrismaClient } from "@prisma/client";
import { logger } from "./infra/logger";

const prisma = new PrismaClient();

// Direct test using the bot's internal transfer logic
async function testDirectTransfer() {
  try {
    logger.info("Starting direct transfer test between active accounts");
    
    // Get active wallets
    const senderWallet = await prisma.wallet.findFirst({
      where: { 
        address: "DuLsX4hPzBnM6RzrA6aZ8C26jmBnCmdYQ2ZVWicK8e2e",
        isActive: true 
      }
    });
    
    const recipientAddress = "BrWdDCTUhvM33Y4syCYf4ZBhE4xNAeGVoWe8bCPBetLA";
    
    if (!senderWallet) {
      logger.error("Sender wallet not found");
      return;
    }
    
    // Get SOL token info
    const token = await resolveToken("SOL");
    if (!token) {
      logger.error("SOL token not found");
      return;
    }
    
    // Test amounts (exactly same as failing transaction)
    const amountRaw = BigInt(100_000_000); // 0.1 SOL
    const feeRaw = BigInt(500_000); // 0.0005 SOL
    const serviceFeeRaw = BigInt(250_000); // 0.000250 SOL
    
    logger.info(`Test parameters:`, {
      amount: Number(amountRaw) / 1e9,
      fee: Number(feeRaw) / 1e9,
      serviceFee: Number(serviceFeeRaw) / 1e9,
      total: Number(amountRaw + feeRaw + serviceFeeRaw) / 1e9
    });
    
    // Execute transfer using exact same logic
    const result = await executeTransfer({
      fromWallet: senderWallet,
      toAddress: recipientAddress,
      mint: token.mint,
      amountRaw,
      feeRaw,
      serviceFeeRaw,
      serviceFeeToken: token.mint,
      token
    });
    
    if (result.success) {
      logger.info(`✅ Direct transfer SUCCESS! Signature: ${result.signature}`);
    } else {
      logger.error(`❌ Direct transfer FAILED: ${result.error}`);
    }
    
  } catch (error) {
    logger.error("Direct transfer test error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testDirectTransfer();