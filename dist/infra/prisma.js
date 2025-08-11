"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.connectDatabase = connectDatabase;
exports.disconnectDatabase = disconnectDatabase;
exports.checkDatabaseHealth = checkDatabaseHealth;
exports.withTransaction = withTransaction;
exports.bulkInsertUsers = bulkInsertUsers;
exports.bulkInsertTokens = bulkInsertTokens;
exports.getDatabaseStats = getDatabaseStats;
exports.cleanupOldRecords = cleanupOldRecords;
const client_1 = require("@prisma/client");
const logger_1 = require("./logger");
// Create Prisma client with logging
const prisma = new client_1.PrismaClient({
    log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
    ],
});
exports.prisma = prisma;
// Log database queries in development
if (process.env.NODE_ENV === 'development') {
    prisma.$on('query', (e) => {
        logger_1.logger.debug(`Query: ${e.query}`);
        logger_1.logger.debug(`Params: ${e.params}`);
        logger_1.logger.debug(`Duration: ${e.duration}ms`);
    });
}
// Log database errors
prisma.$on('error', (e) => {
    logger_1.logger.error(`Database error: ${e.message}`);
});
// Log database info
prisma.$on('info', (e) => {
    logger_1.logger.info(`Database info: ${e.message}`);
});
// Log database warnings
prisma.$on('warn', (e) => {
    logger_1.logger.warn(`Database warning: ${e.message}`);
});
// Test connection and handle errors
async function connectDatabase() {
    try {
        await prisma.$connect();
        logger_1.logger.info('Database connected successfully');
        // Test with a simple query
        await prisma.$queryRaw `SELECT 1`;
        logger_1.logger.info('Database query test passed');
        return true;
    }
    catch (error) {
        logger_1.logger.error('Database connection failed:', error);
        return false;
    }
}
// Graceful shutdown
async function disconnectDatabase() {
    try {
        await prisma.$disconnect();
        logger_1.logger.info('Database disconnected successfully');
    }
    catch (error) {
        logger_1.logger.error('Error disconnecting from database:', error);
    }
}
// Health check function
async function checkDatabaseHealth() {
    try {
        const start = Date.now();
        await prisma.$queryRaw `SELECT 1`;
        const latency = Date.now() - start;
        return { connected: true, latency };
    }
    catch (error) {
        return {
            connected: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
// Transaction wrapper with retry logic
async function withTransaction(operation, maxRetries = 3) {
    let lastError = new Error('Transaction failed');
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await prisma.$transaction(operation, {
                maxWait: 5000, // 5 seconds max wait
                timeout: 10000, // 10 seconds timeout
            });
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error('Transaction failed');
            if (attempt < maxRetries) {
                logger_1.logger.warn(`Transaction attempt ${attempt} failed, retrying...`);
                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            }
        }
    }
    logger_1.logger.error(`Transaction failed after ${maxRetries} attempts:`);
    throw lastError;
}
// Bulk operations helpers
async function bulkInsertUsers(users) {
    try {
        const result = await prisma.user.createMany({
            data: users,
            skipDuplicates: true,
        });
        logger_1.logger.info(`Bulk inserted ${result.count} users`);
        return result.count;
    }
    catch (error) {
        logger_1.logger.error('Bulk user insert failed:', error);
        throw error;
    }
}
async function bulkInsertTokens(tokens) {
    try {
        const result = await prisma.token.createMany({
            data: tokens.map(token => ({
                ...token,
                enabled: token.enabled ?? true,
            })),
            skipDuplicates: true,
        });
        logger_1.logger.info(`Bulk inserted ${result.count} tokens`);
        return result.count;
    }
    catch (error) {
        logger_1.logger.error('Bulk token insert failed:', error);
        throw error;
    }
}
// Database statistics
async function getDatabaseStats() {
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
    }
    catch (error) {
        logger_1.logger.error('Error getting database stats:', error);
        throw error;
    }
}
// Cleanup old records
async function cleanupOldRecords() {
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
        logger_1.logger.info(`Cleanup completed: ${deletedPayments.count} payments, ${deletedEscrows.count} escrows deleted`);
    }
    catch (error) {
        logger_1.logger.error('Cleanup failed:', error);
        throw error;
    }
}
