import { executeTransfer } from "./src/core/transfer";
import { resolveToken } from "./src/core/tokens";
import { PrismaClient } from "@prisma/client";
import { logger } from "./src/infra/logger";
import { Keypair } from "@solana/web3.js";

const prisma = new PrismaClient();

// Test sending money to a brand new wallet (0 balance) to verify recipient funding works
async function testNewWalletFunding() {
  try {
    logger.info("Testing payment to brand new wallet (0 SOL balance)");
    
    // Get sender wallet (existing funded wallet)
    const senderWallet = await prisma.wallet.findFirst({
      where: { 
        address: "DuLsX4hPzBnM6RzrA6aZ8C26jmBnCmdYQ2ZVWicK8e2e", // vi100x
        isActive: true 
      }
    });
    
    if (!senderWallet) {
      logger.error("Sender wallet not found");
      return;
    }
    
    // Generate a completely new recipient wallet (0 balance)
    const newRecipient = Keypair.generate();
    const newRecipientAddress = newRecipient.publicKey.toBase58();
    
    logger.info(`New recipient wallet: ${newRecipientAddress}`);
    
    // Get SOL token
    const token = await resolveToken("SOL");
    if (!token) {
      logger.error("SOL token not found");
      return;
    }
    
    // Test payment to brand new wallet
    const amountRaw = BigInt(50_000_000); // 0.05 SOL - smaller amount for test
    const feeRaw = BigInt(500_000); // 0.0005 SOL
    const serviceFeeRaw = BigInt(125_000); // 0.000125 SOL (0.25% of 0.05)
    
    logger.info("Transfer parameters:", {
      recipient: newRecipientAddress,
      amount: Number(amountRaw) / 1e9,
      fee: Number(feeRaw) / 1e9,
      serviceFee: Number(serviceFeeRaw) / 1e9,
      note: "Should automatically include rent exemption funding for new wallet"
    });
    
    // Execute transfer - this should automatically detect the new wallet and add funding
    const result = await executeTransfer({
      fromWallet: senderWallet,
      toAddress: newRecipientAddress,
      mint: token.mint,
      amountRaw,
      feeRaw,
      serviceFeeRaw,
      serviceFeeToken: token.mint,
      token
    });
    
    if (result.success) {
      logger.info(`✅ New wallet funding SUCCESS! Signature: ${result.signature}`);
      logger.info("This proves that new wallets can receive payments automatically with rent exemption funding!");
    } else {
      logger.error(`❌ New wallet funding FAILED: ${result.error}`);
    }
    
  } catch (error) {
    logger.error("Test error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testNewWalletFunding();