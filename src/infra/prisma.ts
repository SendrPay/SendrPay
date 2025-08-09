import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

// Create Prisma client with logging
const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'info' },
    { emit: 'event', level: 'warn' },
  ],
});

// Log database queries in development
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e) => {
    logger.debug(`Query: ${e.query}`);
    logger.debug(`Params: ${e.params}`);
    logger.debug(`Duration: ${e.duration}ms`);
  });
}

// Log database errors
prisma.$on('error', (e) => {
  logger.error(`Database error: ${e.message}`);
});

// Log database info
prisma.$on('info', (e) => {
  logger.info(`Database info: ${e.message}`);
});

// Log database warnings
prisma.$on('warn', (e) => {
  logger.warn(`Database warning: ${e.message}`);
});

// Test connection and handle errors
export async function connectDatabase(): Promise<boolean> {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
    
    // Test with a simple query
    await prisma.$queryRaw`SELECT 1`;
    logger.info('Database query test passed');
    
    return true;
  } catch (error) {
    logger.error('Database connection failed:', error);
    return false;
  }
}

// Graceful shutdown
export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info('Database disconnected successfully');
  } catch (error) {
    logger.error('Error disconnecting from database:', error);
  }
}

// Health check function
export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  latency?: number;
  error?: string;
}> {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;
    
    return { connected: true, latency };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Transaction wrapper with retry logic
export async function withTransaction<T>(
  operation: (tx: any) => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error = new Error('Transaction failed');
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await prisma.$transaction(operation, {
        maxWait: 5000, // 5 seconds max wait
        timeout: 10000, // 10 seconds timeout
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Transaction failed');
      
      if (attempt < maxRetries) {
        logger.warn(`Transaction attempt ${attempt} failed, retrying...`);
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
      }
    }
  }
  
  logger.error(`Transaction failed after ${maxRetries} attempts:`);
  throw lastError;
}

// Bulk operations helpers
export async function bulkInsertUsers(users: Array<{
  telegramId: string;
  handle?: string;
}>): Promise<number> {
  try {
    const result = await prisma.user.createMany({
      data: users,
      skipDuplicates: true,
    });
    
    logger.info(`Bulk inserted ${result.count} users`);
    return result.count;
  } catch (error) {
    logger.error('Bulk user insert failed:', error);
    throw error;
  }
}

export async function bulkInsertTokens(tokens: Array<{
  mint: string;
  ticker: string;
  name?: string;
  decimals: number;
  enabled?: boolean;
}>): Promise<number> {
  try {
    const result = await prisma.token.createMany({
      data: tokens.map(token => ({
        ...token,
        enabled: token.enabled ?? true,
      })),
      skipDuplicates: true,
    });
    
    logger.info(`Bulk inserted ${result.count} tokens`);
    return result.count;
  } catch (error) {
    logger.error('Bulk token insert failed:', error);
    throw error;
  }
}

// Database statistics
export async function getDatabaseStats(): Promise<{
  users: number;
  wallets: number;
  payments: number;
  escrows: number;
  tokens: number;
  chats: number;
}> {
  try {
    const [users, wallets, payments, escrows, tokens, chats] = await Promise.all([
      prisma.user.count(),
      prisma.wallet.count(),
      prisma.payment.count(),
      prisma.escrow.count(),
      prisma.token.count(),
      prisma.chat.count(),
    ]);

    return { users, wallets, payments, escrows, tokens, chats };
  } catch (error) {
    logger.error('Error getting database stats:', error);
    throw error;
  }
}

// Cleanup old records
export async function cleanupOldRecords(): Promise<void> {
  try {
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // Clean up old failed payments
    const deletedPayments = await prisma.payment.deleteMany({
      where: {
        status: 'failed',
        createdAt: { lt: oneMonthAgo },
      },
    });

    // Clean up old expired escrows
    const deletedEscrows = await prisma.escrow.deleteMany({
      where: {
        status: 'expired',
        createdAt: { lt: oneMonthAgo },
      },
    });

    logger.info(`Cleanup completed: ${deletedPayments.count} payments, ${deletedEscrows.count} escrows deleted`);
  } catch (error) {
    logger.error('Cleanup failed:', error);
    throw error;
  }
}

// Export the Prisma client
export { prisma };
