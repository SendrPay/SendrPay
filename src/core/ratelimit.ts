import { logger } from "../infra/logger";

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number; // tokens per second
}

class RateLimiter {
  private buckets = new Map<string, TokenBucket>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up old buckets every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  public checkRateLimit(key: string, cost: number = 1, config?: {
    capacity?: number;
    refillRate?: number;
  }): boolean {
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
    const tokensToAdd = Math.min(
      timeSinceRefill * bucket.refillRate,
      bucket.capacity - bucket.tokens
    );

    bucket.tokens = Math.min(bucket.tokens + tokensToAdd, bucket.capacity);
    bucket.lastRefill = now;

    // Check if we have enough tokens
    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return true; // Allow request
    }

    return false; // Rate limited
  }

  public getRemainingTokens(key: string): number {
    const bucket = this.buckets.get(key);
    return bucket ? Math.floor(bucket.tokens) : 0;
  }

  public resetLimit(key: string): void {
    this.buckets.delete(key);
  }

  private cleanup(): void {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    for (const [key, bucket] of this.buckets) {
      if (bucket.lastRefill < oneHourAgo) {
        this.buckets.delete(key);
      }
    }

    logger.debug(`Rate limiter cleanup: ${this.buckets.size} buckets remaining`);
  }

  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Global rate limiter instance
const rateLimiter = new RateLimiter();

// Rate limit configurations for different operations
export const RATE_LIMITS = {
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

export function checkRateLimit(
  identifier: string,
  operation: keyof typeof RATE_LIMITS = 'COMMAND',
  cost: number = 1
): boolean {
  const config = RATE_LIMITS[operation];
  const key = `${operation}:${identifier}`;

  const allowed = rateLimiter.checkRateLimit(key, cost, config);

  if (!allowed) {
    logger.debug(`Rate limit exceeded: ${key} (operation: ${operation})`);
  }

  return allowed;
}

export function checkGlobalRateLimit(userId: string, cost: number = 1): boolean {
  const key = `GLOBAL:${userId}`;
  return rateLimiter.checkRateLimit(key, cost, RATE_LIMITS.USER_GLOBAL);
}

export function checkChatRateLimit(chatId: string, operation: keyof typeof RATE_LIMITS, cost: number = 1): boolean {
  const key = `CHAT:${chatId}:${operation}`;
  const config = RATE_LIMITS[operation];
  
  // Chat rate limits are more permissive (2x capacity)
  const chatConfig = {
    capacity: config.capacity * 2,
    refillRate: config.refillRate
  };

  return rateLimiter.checkRateLimit(key, cost, chatConfig);
}

export function getRemainingLimit(identifier: string, operation: keyof typeof RATE_LIMITS): number {
  const key = `${operation}:${identifier}`;
  return rateLimiter.getRemainingTokens(key);
}

export function resetUserLimits(userId: string): void {
  for (const operation of Object.keys(RATE_LIMITS)) {
    rateLimiter.resetLimit(`${operation}:${userId}`);
  }
  rateLimiter.resetLimit(`GLOBAL:${userId}`);
  
  logger.info(`Rate limits reset for user: ${userId}`);
}

export function resetChatLimits(chatId: string): void {
  for (const operation of Object.keys(RATE_LIMITS)) {
    rateLimiter.resetLimit(`CHAT:${chatId}:${operation}`);
  }
  
  logger.info(`Rate limits reset for chat: ${chatId}`);
}

// Advanced rate limiting for new users
export function checkNewUserLimit(userId: string): boolean {
  // New users have stricter limits for the first 24 hours
  const newUserConfig = { capacity: 3, refillRate: 0.01 }; // Very restrictive
  const key = `NEWUSER:${userId}`;

  return rateLimiter.checkRateLimit(key, 1, newUserConfig);
}

// Burst protection for payment operations
export function checkPaymentBurst(userId: string, amount: number): boolean {
  // Higher amounts have stricter limits
  const costMultiplier = Math.min(Math.floor(amount / 100), 5); // Max 5x cost
  const cost = Math.max(1, costMultiplier);

  return checkRateLimit(userId, 'PAYMENT', cost);
}

// Anti-spam protection for group operations
export function checkSpamProtection(chatId: string, userId: string): boolean {
  // Combine chat and user limits for spam protection
  const chatKey = `SPAM:CHAT:${chatId}`;
  const userKey = `SPAM:USER:${userId}`;
  
  const spamConfig = { capacity: 15, refillRate: 0.25 }; // 15 actions, 1 per 4 seconds

  const chatAllowed = rateLimiter.checkRateLimit(chatKey, 1, spamConfig);
  const userAllowed = rateLimiter.checkRateLimit(userKey, 1, spamConfig);

  return chatAllowed && userAllowed;
}

// Rate limiting middleware for bot commands
export function createRateLimitMiddleware(operation: keyof typeof RATE_LIMITS) {
  return async (ctx: any, next: () => Promise<void>) => {
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
      await ctx.reply(
        `⏰ Rate limit exceeded for ${operation.toLowerCase()}. ` +
        `Wait before trying again. (${remaining} requests remaining)`
      );
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

export { rateLimiter };
