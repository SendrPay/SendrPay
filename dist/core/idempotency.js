"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.idempotencyManager = exports.WithdrawIdempotency = exports.TipIdempotency = exports.PaymentIdempotency = void 0;
exports.generateClientIntentId = generateClientIntentId;
exports.generateTipIntentId = generateTipIntentId;
exports.generateWithdrawIntentId = generateWithdrawIntentId;
exports.executeIdempotentPayment = executeIdempotentPayment;
exports.checkDuplicateIntent = checkDuplicateIntent;
exports.getIntentResult = getIntentResult;
exports.createIdempotencyMiddleware = createIdempotencyMiddleware;
const crypto_1 = require("crypto");
const logger_1 = require("../infra/logger");
class IdempotencyManager {
    records = new Map();
    cleanupInterval;
    constructor() {
        // Clean up old records every hour
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60 * 60 * 1000);
    }
    generateClientIntentId(userId, operation, data) {
        const timestamp = Date.now();
        const payload = JSON.stringify({
            userId,
            operation,
            data,
            timestamp: Math.floor(timestamp / 1000) // Round to seconds for short-term deduplication
        });
        return (0, crypto_1.createHash)('sha256').update(payload).digest('hex').slice(0, 16);
    }
    async executeIdempotent(clientIntentId, operation, timeoutMs = 5 * 60 * 1000 // 5 minutes default
    ) {
        const existing = this.records.get(clientIntentId);
        if (existing) {
            if (existing.status === 'completed') {
                logger_1.logger.debug(`Idempotency hit: ${clientIntentId}`);
                return existing.result;
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
                    return updated.result;
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
            logger_1.logger.debug(`Idempotent operation completed: ${clientIntentId}`);
            return result;
        }
        catch (error) {
            // Mark as failed
            this.records.set(clientIntentId, {
                clientIntentId,
                result: error,
                createdAt: Date.now(),
                status: 'failed'
            });
            logger_1.logger.error(`Idempotent operation failed: ${clientIntentId}`, error);
            throw error;
        }
    }
    hasRecord(clientIntentId) {
        return this.records.has(clientIntentId);
    }
    getRecord(clientIntentId) {
        return this.records.get(clientIntentId);
    }
    removeRecord(clientIntentId) {
        return this.records.delete(clientIntentId);
    }
    cleanup() {
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
            logger_1.logger.debug(`Idempotency cleanup: removed ${cleaned} old records`);
        }
    }
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}
// Global idempotency manager instance
const idempotencyManager = new IdempotencyManager();
exports.idempotencyManager = idempotencyManager;
function generateClientIntentId(userId, paymentId) {
    return idempotencyManager.generateClientIntentId(userId, 'payment', paymentId);
}
function generateTipIntentId(userId, messageId, amount) {
    return idempotencyManager.generateClientIntentId(userId, 'tip', { messageId, amount });
}
function generateWithdrawIntentId(userId, address, amount) {
    return idempotencyManager.generateClientIntentId(userId, 'withdraw', { address, amount });
}
async function executeIdempotentPayment(clientIntentId, operation) {
    return idempotencyManager.executeIdempotent(clientIntentId, operation);
}
function checkDuplicateIntent(clientIntentId) {
    const record = idempotencyManager.getRecord(clientIntentId);
    return record?.status === 'completed' || record?.status === 'pending';
}
function getIntentResult(clientIntentId) {
    const record = idempotencyManager.getRecord(clientIntentId);
    return record?.status === 'completed' ? record.result : null;
}
// Specialized functions for different operations
class PaymentIdempotency {
    static generateId(userId, toAddress, amount, mint) {
        const data = { toAddress, amount: amount.toString(), mint };
        return idempotencyManager.generateClientIntentId(userId, 'payment', data);
    }
    static async execute(userId, toAddress, amount, mint, operation) {
        const intentId = this.generateId(userId, toAddress, amount, mint);
        return idempotencyManager.executeIdempotent(intentId, operation);
    }
}
exports.PaymentIdempotency = PaymentIdempotency;
class TipIdempotency {
    static generateId(userId, replyMessageId, amount, mint) {
        const data = { replyMessageId, amount: amount.toString(), mint };
        return idempotencyManager.generateClientIntentId(userId, 'tip', data);
    }
    static async execute(userId, replyMessageId, amount, mint, operation) {
        const intentId = this.generateId(userId, replyMessageId, amount, mint);
        return idempotencyManager.executeIdempotent(intentId, operation);
    }
}
exports.TipIdempotency = TipIdempotency;
class WithdrawIdempotency {
    static generateId(userId, toAddress, amount, mint) {
        const data = { toAddress, amount: amount.toString(), mint, type: 'withdraw' };
        return idempotencyManager.generateClientIntentId(userId, 'withdraw', data);
    }
    static async execute(userId, toAddress, amount, mint, operation) {
        const intentId = this.generateId(userId, toAddress, amount, mint);
        return idempotencyManager.executeIdempotent(intentId, operation);
    }
}
exports.WithdrawIdempotency = WithdrawIdempotency;
// Middleware for automatic idempotency handling
function createIdempotencyMiddleware(operationType) {
    return async (ctx, next) => {
        const userId = ctx.from?.id?.toString();
        const messageText = ctx.message?.text;
        if (!userId || !messageText) {
            return next();
        }
        // Generate intent ID based on user, operation type, and message content
        const intentId = idempotencyManager.generateClientIntentId(userId, operationType, { text: messageText, chatId: ctx.chat?.id });
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
