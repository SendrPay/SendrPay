"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTest = exports.isProduction = exports.isDevelopment = exports.env = void 0;
exports.validateCriticalConfig = validateCriticalConfig;
exports.getRuntimeConfig = getRuntimeConfig;
exports.getFeeMinimums = getFeeMinimums;
exports.getConfigSummary = getConfigSummary;
const zod_1 = require("zod");
// Environment schema validation
const envSchema = zod_1.z.object({
    // Bot configuration
    BOT_TOKEN: zod_1.z.string().min(1, "Telegram bot token is required").optional(),
    DISCORD_TOKEN: zod_1.z.string().min(1, "Discord bot token is required").optional(),
    APP_BASE_URL: zod_1.z.string().url("Valid app base URL is required").optional(),
    // Helius configuration  
    HELIUS_API_KEY: zod_1.z.string().min(1, "Helius API key is required").optional(),
    RPC_URL: zod_1.z.string().url().optional(),
    HELIUS_WEBHOOK_SECRET: zod_1.z.string().optional(),
    // Crypto & Security
    MASTER_KMS_KEY: zod_1.z.string().min(1, "Master KMS key is required for wallet encryption"),
    FEE_TREASURY_SECRET: zod_1.z.string().optional(),
    // Fee configuration
    FEE_BPS: zod_1.z.string().regex(/^\d+$/, "Fee BPS must be a number").optional(),
    FEE_MIN_RAW_SOL: zod_1.z.string().regex(/^\d+$/, "Fee minimum must be a number").optional(),
    FEE_MIN_RAW_BY_MINT: zod_1.z.string().optional(), // JSON string
    // Feature flags
    SPONSOR_FEES: zod_1.z.enum(['true', 'false']).optional(),
    SPONSOR_DAILY_CAP_LAMPORTS: zod_1.z.string().regex(/^\d+$/).optional(),
    ESCROW_EXPIRY_HOURS: zod_1.z.string().regex(/^\d+$/).optional(),
    // Admin
    OWNER_TELEGRAM_ID: zod_1.z.string().optional(),
    ADMIN_USER_IDS: zod_1.z.string().optional(), // Comma-separated admin user IDs
    // System
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    PORT: zod_1.z.string().regex(/^\d+$/).optional(),
    DATABASE_URL: zod_1.z.string().optional(),
    // Bot username (for mentions)
    BOT_USERNAME: zod_1.z.string().optional(),
});
// Validate and parse environment variables
function parseEnv() {
    const rawEnv = {
        BOT_TOKEN: process.env.BOT_TOKEN,
        DISCORD_TOKEN: process.env.DISCORD_TOKEN,
        APP_BASE_URL: process.env.APP_BASE_URL,
        HELIUS_API_KEY: process.env.HELIUS_API_KEY,
        RPC_URL: process.env.RPC_URL || `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
        HELIUS_WEBHOOK_SECRET: process.env.HELIUS_WEBHOOK_SECRET,
        MASTER_KMS_KEY: process.env.MASTER_KMS_KEY,
        FEE_TREASURY_SECRET: process.env.FEE_TREASURY_SECRET,
        FEE_BPS: process.env.FEE_BPS || '50',
        FEE_MIN_RAW_SOL: process.env.FEE_MIN_RAW_SOL || '5000',
        FEE_MIN_RAW_BY_MINT: process.env.FEE_MIN_RAW_BY_MINT,
        SPONSOR_FEES: process.env.SPONSOR_FEES || 'false',
        SPONSOR_DAILY_CAP_LAMPORTS: process.env.SPONSOR_DAILY_CAP_LAMPORTS || '2000000',
        ESCROW_EXPIRY_HOURS: process.env.ESCROW_EXPIRY_HOURS || '168',
        OWNER_TELEGRAM_ID: process.env.OWNER_TELEGRAM_ID,
        ADMIN_USER_IDS: process.env.ADMIN_USER_IDS,
        NODE_ENV: process.env.NODE_ENV || 'development',
        PORT: process.env.PORT || '5000',
        DATABASE_URL: process.env.DATABASE_URL,
        BOT_USERNAME: process.env.BOT_USERNAME,
    };
    try {
        return envSchema.parse(rawEnv);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            console.error('❌ Environment validation failed:');
            error.issues.forEach((err) => {
                console.error(`  - ${err.path.join('.')}: ${err.message}`);
            });
            console.error('\n💡 Please check your environment variables and try again.');
            process.exit(1);
        }
        console.error('❌ Unexpected error during environment validation:', error);
        throw error;
    }
}
// Parse and export environment
exports.env = parseEnv();
// Derived environment values
exports.isDevelopment = exports.env.NODE_ENV === 'development';
exports.isProduction = exports.env.NODE_ENV === 'production';
exports.isTest = exports.env.NODE_ENV === 'test';
// Validate critical configurations
function validateCriticalConfig() {
    const errors = [];
    // Check bot token format (only if provided)
    if (exports.env.BOT_TOKEN && (!exports.env.BOT_TOKEN.includes(':') || exports.env.BOT_TOKEN.split(':').length !== 2)) {
        errors.push('BOT_TOKEN format appears invalid (should be number:string)');
    }
    // Check master key is base64 and correct length (only if provided)
    if (exports.env.MASTER_KMS_KEY) {
        try {
            const keyBuffer = Buffer.from(exports.env.MASTER_KMS_KEY, 'base64');
            if (keyBuffer.length !== 32) {
                errors.push('MASTER_KMS_KEY must be 32 bytes (256 bits) when base64 decoded');
            }
        }
        catch {
            errors.push('MASTER_KMS_KEY must be valid base64');
        }
    }
    // Check fee configuration
    const feeBps = parseInt(exports.env.FEE_BPS || '50');
    if (isNaN(feeBps) || feeBps < 0 || feeBps > 1000) {
        errors.push('FEE_BPS must be between 0 and 1000 (0% to 10%)');
    }
    // Validate fee minimums by mint if provided
    if (exports.env.FEE_MIN_RAW_BY_MINT) {
        try {
            JSON.parse(exports.env.FEE_MIN_RAW_BY_MINT);
        }
        catch {
            errors.push('FEE_MIN_RAW_BY_MINT must be valid JSON if provided');
        }
    }
    // Check Helius RPC URL
    if (exports.env.RPC_URL && !exports.env.RPC_URL.includes('helius')) {
        console.warn('⚠️ RPC_URL does not appear to be a Helius endpoint');
    }
    if (errors.length > 0) {
        console.error('❌ Configuration validation failed:');
        errors.forEach(error => console.error(`  - ${error}`));
        return false;
    }
    return true;
}
// Runtime configuration helpers
function getRuntimeConfig() {
    return {
        feeBps: parseInt(exports.env.FEE_BPS || '50'),
        feeMinRawSol: BigInt(exports.env.FEE_MIN_RAW_SOL || '5000'),
        sponsorFees: exports.env.SPONSOR_FEES === 'true',
        sponsorDailyCap: BigInt(exports.env.SPONSOR_DAILY_CAP_LAMPORTS || '2000000'),
        escrowExpiryHours: parseInt(exports.env.ESCROW_EXPIRY_HOURS || '168'),
        isDevelopment: exports.isDevelopment,
        isProduction: exports.isProduction,
    };
}
// Get fee minimums by mint
function getFeeMinimums() {
    if (!exports.env.FEE_MIN_RAW_BY_MINT) {
        return {};
    }
    try {
        const parsed = JSON.parse(exports.env.FEE_MIN_RAW_BY_MINT);
        const result = {};
        for (const [mint, value] of Object.entries(parsed)) {
            if (typeof value === 'string' || typeof value === 'number') {
                result[mint] = BigInt(value);
            }
        }
        return result;
    }
    catch {
        console.error('Failed to parse FEE_MIN_RAW_BY_MINT, using defaults');
        return {};
    }
}
// Export configuration summary for logging
function getConfigSummary() {
    return {
        nodeEnv: exports.env.NODE_ENV,
        port: exports.env.PORT,
        hasHeliusWebhookSecret: !!exports.env.HELIUS_WEBHOOK_SECRET,
        hasFeetreasury: !!exports.env.FEE_TREASURY_SECRET,
        hasOwner: !!exports.env.OWNER_TELEGRAM_ID,
        feeBps: exports.env.FEE_BPS,
        sponsorFees: exports.env.SPONSOR_FEES,
        escrowExpiryHours: exports.env.ESCROW_EXPIRY_HOURS,
        rpcEndpoint: exports.env.RPC_URL?.replace(/api-key=[^&]+/g, 'api-key=***') || 'not configured',
    };
}
// Validate environment on module load
if (!validateCriticalConfig()) {
    console.error('❌ Critical configuration errors detected. Exiting.');
    process.exit(1);
}
console.log('✅ Environment configuration validated successfully');
