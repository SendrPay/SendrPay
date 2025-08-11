"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimiter = exports.RATE_LIMITS = void 0;
exports.checkRateLimit = checkRateLimit;
exports.checkGlobalRateLimit = checkGlobalRateLimit;
exports.checkChatRateLimit = checkChatRateLimit;
exports.getRemainingLimit = getRemainingLimit;
exports.resetUserLimits = resetUserLimits;
exports.resetChatLimits = resetChatLimits;
exports.checkNewUserLimit = checkNewUserLimit;
exports.checkPaymentBurst = checkPaymentBurst;
exports.checkSpamProtection = checkSpamProtection;
exports.createRateLimitMiddleware = createRateLimitMiddleware;
const logger_1 = require("../infra/logger");
class RateLimiter {
    buckets = new Map();
    cleanupInterval;
    constructor() {
        // Clean up old buckets every 5 minutes
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 5 * 60 * 1000);
    }
    checkRateLimit(key, cost = 1, config) {
        const capacity = config?.capacity || 10; // Default: 10 requests
        const refillRate = config?.refillRate || 0.1; // Default: 1 token per 10 seconds
        let bucket = this.buckets.get(key);
        const now = Date.now();
        if (!bucket) {
            bucket = {
                tokens: capacity,
                lastRefill: now,
                capacity,
                refillRate
            };
            this.buckets.set(key, bucket);
        }
        // Refill tokens based on time elapsed
        const timeSinceRefill = (now - bucket.lastRefill) / 1000; // Convert to seconds
        const tokensToAdd = Math.min(timeSinceRefill * bucket.refillRate, bucket.capacity - bucket.tokens);
        bucket.tokens = Math.min(bucket.tokens + tokensToAdd, bucket.capacity);
        bucket.lastRefill = now;
        // Check if we have enough tokens
        if (bucket.tokens >= cost) {
            bucket.tokens -= cost;
            return true; // Allow request
        }
        return false; // Rate limited
    }
    getRemainingTokens(key) {
        const bucket = this.buckets.get(key);
        return bucket ? Math.floor(bucket.tokens) : 0;
    }
    resetLimit(key) {
        this.buckets.delete(key);
    }
    cleanup() {
        const now = Date.now();
        const oneHourAgo = now - 60 * 60 * 1000;
        for (const [key, bucket] of this.buckets) {
            if (bucket.lastRefill < oneHourAgo) {
                this.buckets.delete(key);
            }
        }
        logger_1.logger.debug(`Rate limiter cleanup: ${this.buckets.size} buckets remaining`);
    }
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}
// Global rate limiter instance
const rateLimiter = new RateLimiter();
exports.rateLimiter = rateLimiter;
// Rate limit configurations for different operations
exports.RATE_LIMITS = {
    // General command rate limiting
    COMMAND: { capacity: 10, refillRate: 0.2 }, // 10 commands, 1 per 5 seconds
    // Payment operations (more restrictive)
    PAYMENT: { capacity: 5, refillRate: 0.05 }, // 5 payments, 1 per 20 seconds
    // Tip operations
    TIP: { capacity: 8, refillRate: 0.1 }, // 8 tips, 1 per 10 seconds
    // Wallet operations
    WALLET: { capacity: 3, refillRate: 0.02 }, // 3 operations, 1 per 50 seconds
    // Global per-user rate limit
    USER_GLOBAL: { capacity: 20, refillRate: 0.5 }, // 20 actions, 2 per second
};
function checkRateLimit(identifier, operation = 'COMMAND', cost = 1) {
    const config = exports.RATE_LIMITS[operation];
    const key = `${operation}:${identifier}`;
    const allowed = rateLimiter.checkRateLimit(key, cost, config);
    if (!allowed) {
        logger_1.logger.debug(`Rate limit exceeded: ${key} (operation: ${operation})`);
    }
    return allowed;
}
function checkGlobalRateLimit(userId, cost = 1) {
    const key = `GLOBAL:${userId}`;
    return rateLimiter.checkRateLimit(key, cost, exports.RATE_LIMITS.USER_GLOBAL);
}
function checkChatRateLimit(chatId, operation, cost = 1) {
    const key = `CHAT:${chatId}:${operation}`;
    const config = exports.RATE_LIMITS[operation];
    // Chat rate limits are more permissive (2x capacity)
    const chatConfig = {
        capacity: config.capacity * 2,
        refillRate: config.refillRate
    };
    return rateLimiter.checkRateLimit(key, cost, chatConfig);
}
function getRemainingLimit(identifier, operation) {
    const key = `${operation}:${identifier}`;
    return rateLimiter.getRemainingTokens(key);
}
function resetUserLimits(userId) {
    for (const operation of Object.keys(exports.RATE_LIMITS)) {
        rateLimiter.resetLimit(`${operation}:${userId}`);
    }
    rateLimiter.resetLimit(`GLOBAL:${userId}`);
    logger_1.logger.info(`Rate limits reset for user: ${userId}`);
}
function resetChatLimits(chatId) {
    for (const operation of Object.keys(exports.RATE_LIMITS)) {
        rateLimiter.resetLimit(`CHAT:${chatId}:${operation}`);
    }
    logger_1.logger.info(`Rate limits reset for chat: ${chatId}`);
}
// Advanced rate limiting for new users
function checkNewUserLimit(userId) {
    // New users have stricter limits for the first 24 hours
    const newUserConfig = { capacity: 3, refillRate: 0.01 }; // Very restrictive
    const key = `NEWUSER:${userId}`;
    return rateLimiter.checkRateLimit(key, 1, newUserConfig);
}
// Burst protection for payment operations
function checkPaymentBurst(userId, amount) {
    // Higher amounts have stricter limits
    const costMultiplier = Math.min(Math.floor(amount / 100), 5); // Max 5x cost
    const cost = Math.max(1, costMultiplier);
    return checkRateLimit(userId, 'PAYMENT', cost);
}
// Anti-spam protection for group operations
function checkSpamProtection(chatId, userId) {
    // Combine chat and user limits for spam protection
    const chatKey = `SPAM:CHAT:${chatId}`;
    const userKey = `SPAM:USER:${userId}`;
    const spamConfig = { capacity: 15, refillRate: 0.25 }; // 15 actions, 1 per 4 seconds
    const chatAllowed = rateLimiter.checkRateLimit(chatKey, 1, spamConfig);
    const userAllowed = rateLimiter.checkRateLimit(userKey, 1, spamConfig);
    return chatAllowed && userAllowed;
}
// Rate limiting middleware for bot commands
function createRateLimitMiddleware(operation) {
    return async (ctx, next) => {
        const userId = ctx.from?.id?.toString();
        const chatId = ctx.chat?.id?.toString();
        if (!userId) {
            return next();
        }
        // Check global user rate limit
        if (!checkGlobalRateLimit(userId)) {
            await ctx.reply("⏰ You're doing that too often. Please slow down.");
            return;
        }
        // Check operation-specific rate limit
        if (!checkRateLimit(userId, operation)) {
            const remaining = getRemainingLimit(userId, operation);
            await ctx.reply(`⏰ Rate limit exceeded for ${operation.toLowerCase()}. ` +
                `Wait before trying again. (${remaining} requests remaining)`);
            return;
        }
        // Check spam protection for group commands
        if (chatId && chatId !== userId && !checkSpamProtection(chatId, userId)) {
            await ctx.reply("⏰ Anti-spam protection activated. Please wait.");
            return;
        }
        await next();
    };
}
