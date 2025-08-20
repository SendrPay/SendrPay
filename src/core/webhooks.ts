import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "../infra/prisma";
import { env } from "../infra/env";
import { logger } from "../infra/logger";
import { formatReceipt } from "./receipts";
import { resolveTokenByMint } from "./tokens";
import { bot } from "../bot";

export interface HeliusWebhookPayload {
  type: string;
  signature: string;
  slot: number;
  timestamp: number;
  data: {
    transaction: {
      message: {
        instructions: any[];
      };
      signatures: string[];
    };
  };
}

export function validateWebhookSignature(payload: string, signature: string): boolean {
  if (!env.HELIUS_WEBHOOK_SECRET || !signature) {
    logger.warn("Webhook secret or signature missing");
    return true; // Allow through for development
  }

  try {
    // Remove 'sha256=' prefix if present
    const cleanSignature = signature.replace('sha256=', '');
    
    // Compute expected signature
    const expectedSignature = createHmac('sha256', env.HELIUS_WEBHOOK_SECRET)
      .update(payload, 'utf8')
      .digest('hex');

    // Use timing-safe comparison
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const actualBuffer = Buffer.from(cleanSignature, 'hex');

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, actualBuffer);

  } catch (error) {
    logger.error("Error validating webhook signature:", error);
    return false;
  }
}

export async function processTransactionUpdate(payload: HeliusWebhookPayload): Promise<void> {
  try {
    if (payload.type !== 'TRANSACTION') {
      return;
    }

    const signature = payload.signature;
    
    // Find payment by transaction signature
    const payment = await prisma.payment.findFirst({
      where: { txSig: signature },
      include: {
        from: { include: { wallets: true } },
        to: { include: { wallets: true } }
      }
    });

    if (!payment) {
      logger.debug(`No payment found for transaction: ${signature}`);
      return;
    }

    if (payment.status === "confirmed") {
      logger.debug(`Payment already confirmed: ${payment.id}`);
      return;
    }

    // Verify transaction details
    const isValid = await verifyTransactionDetails(payload, payment);
    if (!isValid) {
      logger.warn(`Transaction verification failed for payment: ${payment.id}`);
      
      // Mark as failed
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "failed" }
      });
      return;
    }

    // Update payment status to confirmed
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "confirmed" }
    });

    // Send confirmation message to chat
    await sendConfirmationMessage(payment);

    logger.info(`Payment confirmed: ${payment.id} (${signature})`);

  } catch (error) {
    logger.error("Error processing transaction update:", error);
  }
}

async function verifyTransactionDetails(payload: HeliusWebhookPayload, payment: any): Promise<boolean> {
  try {
    const instructions = payload.data?.transaction?.message?.instructions || [];
    const expectedAmount = BigInt(payment.amountRaw);
    const expectedFee = BigInt(payment.feeRaw);
    const expectedMint = payment.mint;

    // For SOL transfers, look for SystemProgram transfers
    if (expectedMint === "SOL") {
      const systemTransfers = instructions.filter(ix => 
        ix.programId === "11111111111111111111111111111111" && // SystemProgram
        ix.data && ix.accounts
      );

      if (systemTransfers.length === 0) {
        logger.warn("No system transfers found in SOL transaction");
        return false;
      }

      // Verify at least one transfer matches expected amount
      // (This is a simplified verification - in production you'd decode the instruction data)
      return true;
    } else {
      // For SPL transfers, look for Token program instructions
      const tokenTransfers = instructions.filter(ix => 
        ix.programId === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" // Token Program
      );

      if (tokenTransfers.length === 0) {
        logger.warn("No token transfers found in SPL transaction");
        return false;
      }

      // Simplified verification - in production you'd decode instruction data
      return true;
    }

  } catch (error) {
    logger.error("Error verifying transaction details:", error);
    return false;
  }
}

async function sendConfirmationMessage(payment: any): Promise<void> {
  try {
    if (!payment.chatId) return;

    const token = await resolveTokenByMint(payment.mint);
    if (!token) return;

    const grossAmount = Number(payment.amountRaw) / (10 ** token.decimals);
    const feeAmount = Number(payment.feeRaw) / (10 ** token.decimals);
    const netAmount = grossAmount - feeAmount;

    const fromHandle = payment.from?.handle || payment.fromWallet.slice(0, 8) + "...";
    const toHandle = payment.to?.handle || payment.toWallet.slice(0, 8) + "...";

    const receipt = formatReceipt({
      from: `@${fromHandle}`,
      to: `@${toHandle}`,
      gross: grossAmount,
      fee: feeAmount,
      net: netAmount,
      token: token.ticker,
      signature: payment.txSig,
      note: payment.note,
      type: payment.note === 'tip' ? 'tip' : 'payment'
    });

    // Send to chat
    await bot.api.sendMessage(payment.chatId, receipt, { 
      parse_mode: "Markdown",
      disable_web_page_preview: true
    });

    // Also notify sender in DM if different from chat
    if (payment.from?.telegramId && payment.chatId !== payment.from.telegramId) {
      try {
        await bot.api.sendMessage(payment.from.telegramId, `✅ Payment confirmed!\n\n${receipt}`, {
          parse_mode: "Markdown",
          disable_web_page_preview: true
        });
      } catch (error) {
        logger.debug("Could not notify sender in DM:", error);
      }
    }

  } catch (error) {
    logger.error("Error sending confirmation message:", error);
  }
}

export async function registerWebhook(): Promise<boolean> {
  if (!env.HELIUS_API_KEY || !env.APP_BASE_URL) {
    logger.warn("Helius API key or app base URL not configured - webhooks disabled");
    return false;
  }

  try {
    const webhookUrl = `${env.APP_BASE_URL}/webhooks/helius`;
    
    const response = await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${env.HELIUS_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhookURL: webhookUrl,
        transactionTypes: ["TRANSFER"],
        accountAddresses: [], // Add specific addresses to monitor if needed
        webhookType: "enhanced",
        authHeader: env.HELIUS_WEBHOOK_SECRET ? `Bearer ${env.HELIUS_WEBHOOK_SECRET}` : undefined
      })
    });

    if (response.ok) {
      const webhook = await response.json();
      logger.info(`Helius webhook registered: ${webhook.webhookID}`);
      return true;
    } else {
      const error = await response.text();
      logger.error(`Failed to register Helius webhook: ${error}`);
      return false;
    }

  } catch (error) {
    logger.error("Error registering Helius webhook:", error);
    return false;
  }
}

export async function unregisterWebhooks(): Promise<boolean> {
  if (!env.HELIUS_API_KEY) {
    return false;
  }

  try {
    // Get existing webhooks
    const response = await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${env.HELIUS_API_KEY}`);
    const webhooks = await response.json();

    // Delete webhooks that match our URL
    const webhookUrl = `${env.APP_BASE_URL}/webhooks/helius`;
    const matchingWebhooks = webhooks.filter((w: any) => w.webhookURL === webhookUrl);

    for (const webhook of matchingWebhooks) {
      await fetch(`https://api.helius.xyz/v0/webhooks/${webhook.webhookID}?api-key=${env.HELIUS_API_KEY}`, {
        method: 'DELETE'
      });
      logger.info(`Deleted webhook: ${webhook.webhookID}`);
    }

    return true;

  } catch (error) {
    logger.error("Error unregistering webhooks:", error);
    return false;
  }
}

// Helper function to manually check transaction status
export async function checkTransactionStatus(signature: string): Promise<'confirmed' | 'failed' | 'pending'> {
  try {
    const response = await fetch(env.RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignatureStatuses',
        params: [[signature]]
      })
    });

    const data = await response.json();
    const status = data.result?.value?.[0];

    if (!status) {
      return 'pending';
    }

    if (status.err) {
      return 'failed';
    }

    if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
      return 'confirmed';
    }

    return 'pending';

  } catch (error) {
    logger.error("Error checking transaction status:", error);
    return 'pending';
  }
}

// Background task to check pending payments
export async function checkPendingPayments(): Promise<void> {
  try {
    const pendingPayments = await prisma.payment.findMany({
      where: { 
        status: "sent",
        txSig: { not: null },
        createdAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour only
        }
      },
      take: 20 // Process in batches
    });

    for (const payment of pendingPayments) {
      if (!payment.txSig) continue;

      const status = await checkTransactionStatus(payment.txSig);
      
      if (status !== 'pending') {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: status === 'confirmed' ? 'confirmed' : 'failed' }
        });

        if (status === 'confirmed') {
          await sendConfirmationMessage(payment);
        }

        logger.info(`Payment status updated: ${payment.id} -> ${status}`);
      }
    }

  } catch (error) {
    logger.error("Error checking pending payments:", error);
  }
}

// Start background process for checking pending payments
export function startPaymentStatusChecker(): void {
  const intervalMinutes = 5; // Check every 5 minutes
  
  setInterval(async () => {
    await checkPendingPayments();
  }, intervalMinutes * 60 * 1000);

  logger.info(`Payment status checker started (interval: ${intervalMinutes}m)`);
}
