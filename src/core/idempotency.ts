import { createHash } from "crypto";
import { logger } from "../infra/logger";

interface IdempotencyRecord {
  clientIntentId: string;
  result: any;
  createdAt: number;
  status: 'pending' | 'completed' | 'failed';
}

class IdempotencyManager {
  private records = new Map<string, IdempotencyRecord>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up old records every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1000);
  }

  public generateClientIntentId(userId: string, operation: string, data?: any): string {
    const timestamp = Date.now();
    const payload = JSON.stringify({
      userId,
      operation,
      data,
      timestamp: Math.floor(timestamp / 1000) // Round to seconds for short-term deduplication
    });

    return createHash('sha256').update(payload).digest('hex').slice(0, 16);
  }

  public async executeIdempotent<T>(
    clientIntentId: string,
    operation: () => Promise<T>,
    timeoutMs: number = 5 * 60 * 1000 // 5 minutes default
  ): Promise<T> {
    const existing = this.records.get(clientIntentId);
    
    if (existing) {
      if (existing.status === 'completed') {
        logger.debug(`Idempotency hit: ${clientIntentId}`);
        return existing.result as T;
      }
      
      if (existing.status === 'failed') {
        throw new Error('Previous attempt failed');
      }
      
      if (existing.status === 'pending') {
        // Wait for ongoing operation (simplified - in production use proper async coordination)
        const waitStart = Date.now();
        while (this.records.get(clientIntentId)?.status === 'pending') {
          if (Date.now() - waitStart > timeoutMs) {
            throw new Error('Idempotent operation timeout');
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const updated = this.records.get(clientIntentId);
        if (updated?.status === 'completed') {
          return updated.result as T;
        }
        
        throw new Error('Idempotent operation failed after waiting');
      }
    }

    // Mark as pending
    this.records.set(clientIntentId, {
      clientIntentId,
      result: null,
      createdAt: Date.now(),
      status: 'pending'
    });

    try {
      const result = await operation();
      
      // Mark as completed
      this.records.set(clientIntentId, {
        clientIntentId,
        result,
        createdAt: Date.now(),
        status: 'completed'
      });

      logger.debug(`Idempotent operation completed: ${clientIntentId}`);
      return result;

    } catch (error) {
      // Mark as failed
      this.records.set(clientIntentId, {
        clientIntentId,
        result: error,
        createdAt: Date.now(),
        status: 'failed'
      });

      logger.error(`Idempotent operation failed: ${clientIntentId}`, error);
      throw error;
    }
  }

  public hasRecord(clientIntentId: string): boolean {
    return this.records.has(clientIntentId);
  }

  public getRecord(clientIntentId: string): IdempotencyRecord | undefined {
    return this.records.get(clientIntentId);
  }

  public removeRecord(clientIntentId: string): boolean {
    return this.records.delete(clientIntentId);
  }

  private cleanup(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    let cleaned = 0;
    for (const [id, record] of this.records) {
      if (now - record.createdAt > maxAge) {
        this.records.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Idempotency cleanup: removed ${cleaned} old records`);
    }
  }

  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Global idempotency manager instance
const idempotencyManager = new IdempotencyManager();

export function generateClientIntentId(userId: string, paymentId: string): string {
  return idempotencyManager.generateClientIntentId(userId, 'payment', paymentId);
}

export function generateTipIntentId(userId: string, messageId: number, amount: number): string {
  return idempotencyManager.generateClientIntentId(userId, 'tip', { messageId, amount });
}





export function generateWithdrawIntentId(userId: string, address: string, amount: number): string {
  return idempotencyManager.generateClientIntentId(userId, 'withdraw', { address, amount });
}

export async function executeIdempotentPayment<T>(
  clientIntentId: string,
  operation: () => Promise<T>
): Promise<T> {
  return idempotencyManager.executeIdempotent(clientIntentId, operation);
}

export function checkDuplicateIntent(clientIntentId: string): boolean {
  const record = idempotencyManager.getRecord(clientIntentId);
  return record?.status === 'completed' || record?.status === 'pending';
}

export function getIntentResult(clientIntentId: string): any {
  const record = idempotencyManager.getRecord(clientIntentId);
  return record?.status === 'completed' ? record.result : null;
}

// Specialized functions for different operations
export class PaymentIdempotency {
  static generateId(userId: string, toAddress: string, amount: bigint, mint: string): string {
    const data = { toAddress, amount: amount.toString(), mint };
    return idempotencyManager.generateClientIntentId(userId, 'payment', data);
  }

  static async execute<T>(
    userId: string,
    toAddress: string,
    amount: bigint,
    mint: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const intentId = this.generateId(userId, toAddress, amount, mint);
    return idempotencyManager.executeIdempotent(intentId, operation);
  }
}

export class TipIdempotency {
  static generateId(userId: string, replyMessageId: number, amount: bigint, mint: string): string {
    const data = { replyMessageId, amount: amount.toString(), mint };
    return idempotencyManager.generateClientIntentId(userId, 'tip', data);
  }

  static async execute<T>(
    userId: string,
    replyMessageId: number,
    amount: bigint,
    mint: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const intentId = this.generateId(userId, replyMessageId, amount, mint);
    return idempotencyManager.executeIdempotent(intentId, operation);
  }
}

export class WithdrawIdempotency {
  static generateId(userId: string, toAddress: string, amount: bigint, mint: string): string {
    const data = { toAddress, amount: amount.toString(), mint, type: 'withdraw' };
    return idempotencyManager.generateClientIntentId(userId, 'withdraw', data);
  }

  static async execute<T>(
    userId: string,
    toAddress: string,
    amount: bigint,
    mint: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const intentId = this.generateId(userId, toAddress, amount, mint);
    return idempotencyManager.executeIdempotent(intentId, operation);
  }
}

// Middleware for automatic idempotency handling
export function createIdempotencyMiddleware(operationType: string) {
  return async (ctx: any, next: () => Promise<void>) => {
    const userId = ctx.from?.id?.toString();
    const messageText = ctx.message?.text;
    
    if (!userId || !messageText) {
      return next();
    }

    // Generate intent ID based on user, operation type, and message content
    const intentId = idempotencyManager.generateClientIntentId(
      userId,
      operationType,
      { text: messageText, chatId: ctx.chat?.id }
    );

    // Check if this exact command was recently executed
    const existing = idempotencyManager.getRecord(intentId);
    if (existing?.status === 'completed') {
      await ctx.reply("🔄 This command was already executed recently.");
      return;
    }

    if (existing?.status === 'pending') {
      await ctx.reply("⏳ This command is already being processed.");
      return;
    }

    // Add intent ID to context for command handlers to use
    ctx.idempotencyKey = intentId;
    
    await next();
  };
}

export { idempotencyManager };
