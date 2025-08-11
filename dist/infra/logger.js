"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.logShutdown = exports.logHealthCheck = exports.logStartup = exports.logRateLimit = exports.logQuery = exports.logCommand = exports.logWebhook = exports.logPayment = exports.logSecurityEvent = exports.logError = exports.perfLogger = exports.securityLogger = exports.escrowLogger = exports.paymentLogger = exports.webhookLogger = exports.dbLogger = exports.botLogger = exports.createLogger = void 0;
const pino_1 = require("pino");
const env_1 = require("./env");
// Create logger with appropriate configuration for environment
const logger = (0, pino_1.default)({
    level: env_1.isDevelopment ? 'debug' : 'info',
    // Pretty print in development for better readability
    transport: env_1.isDevelopment ? {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
        }
    } : undefined,
    // Production logging configuration
    ...(env_1.isProduction && {
        formatters: {
            level: (label) => ({ level: label.toUpperCase() }),
        },
        timestamp: pino_1.default.stdTimeFunctions.isoTime,
    }),
    // Redact sensitive information
    redact: {
        paths: [
            'privateKey',
            'secretKey',
            'encPrivKey',
            'MASTER_KMS_KEY',
            'BOT_TOKEN',
            'HELIUS_API_KEY',
            'FEE_TREASURY_SECRET',
            'password',
            'authorization',
            'cookie',
            'headers["x-api-key"]'
        ],
        censor: '[REDACTED]'
    },
    // Base fields
    base: {
        name: 'solana-pay-bot',
        version: '1.0.0',
        env: env_1.env.NODE_ENV,
    },
});
exports.logger = logger;
// Enhanced logging methods with context
const createLogger = (context) => {
    return logger.child({ context });
};
exports.createLogger = createLogger;
// Specialized loggers for different components
exports.botLogger = (0, exports.createLogger)('bot');
exports.dbLogger = (0, exports.createLogger)('database');
exports.webhookLogger = (0, exports.createLogger)('webhook');
exports.paymentLogger = (0, exports.createLogger)('payment');
exports.escrowLogger = (0, exports.createLogger)('escrow');
exports.securityLogger = (0, exports.createLogger)('security');
// Performance logging helpers
exports.perfLogger = {
    start: (operation) => {
        const startTime = Date.now();
        return {
            end: (additionalData) => {
                const duration = Date.now() - startTime;
                logger.info({
                    operation,
                    duration,
                    ...additionalData
                }, `Operation completed: ${operation} (${duration}ms)`);
            }
        };
    }
};
// Error logging with stack trace in development
const logError = (error, context, additional) => {
    const errorData = {
        error: {
            name: error?.name,
            message: error?.message,
            stack: env_1.isDevelopment ? error?.stack : undefined,
        },
        context,
        ...additional
    };
    logger.error(errorData, `Error in ${context || 'unknown context'}: ${error?.message || 'Unknown error'}`);
};
exports.logError = logError;
// Security event logging
const logSecurityEvent = (event, details, severity = 'medium') => {
    exports.securityLogger.warn({
        event,
        severity,
        timestamp: new Date().toISOString(),
        ...details
    }, `Security event: ${event}`);
};
exports.logSecurityEvent = logSecurityEvent;
// Payment transaction logging
const logPayment = (type, amount, token, from, to, signature, error) => {
    exports.paymentLogger.info({
        type,
        amount,
        token,
        from: from.slice(0, 8) + '...',
        to: to.slice(0, 8) + '...',
        signature,
        error
    }, `Payment ${type}: ${amount} ${token} from ${from.slice(0, 8)}... to ${to.slice(0, 8)}...`);
};
exports.logPayment = logPayment;
// Webhook logging
const logWebhook = (event, signature, valid, details) => {
    exports.webhookLogger.info({
        event,
        signature: signature.slice(0, 16) + '...',
        valid,
        ...details
    }, `Webhook ${event}: signature ${valid ? 'valid' : 'invalid'}`);
};
exports.logWebhook = logWebhook;
// Bot command logging
const logCommand = (command, userId, chatId, success, duration, error) => {
    exports.botLogger.info({
        command,
        userId: userId.slice(0, 8) + '...',
        chatId: chatId.slice(0, 8) + '...',
        success,
        duration,
        error
    }, `Command ${command}: ${success ? 'success' : 'failed'} (${duration || 0}ms)`);
};
exports.logCommand = logCommand;
// Database query logging (when enabled)
const logQuery = (query, params, duration) => {
    if (env_1.isDevelopment) {
        exports.dbLogger.debug({
            query: query.slice(0, 100) + (query.length > 100 ? '...' : ''),
            paramCount: params?.length || 0,
            duration
        }, `Database query executed (${duration || 0}ms)`);
    }
};
exports.logQuery = logQuery;
// Rate limiting logging
const logRateLimit = (identifier, operation, remaining) => {
    logger.debug({
        identifier: identifier.slice(0, 16) + '...',
        operation,
        remaining
    }, `Rate limit check: ${operation} (${remaining} remaining)`);
};
exports.logRateLimit = logRateLimit;
// Startup logging
const logStartup = (component, config) => {
    logger.info({
        component,
        config: config ? Object.keys(config) : undefined
    }, `${component} initialized`);
};
exports.logStartup = logStartup;
// Health check logging
const logHealthCheck = (service, healthy, details) => {
    const level = healthy ? 'info' : 'warn';
    logger[level]({
        service,
        healthy,
        ...details
    }, `Health check: ${service} is ${healthy ? 'healthy' : 'unhealthy'}`);
};
exports.logHealthCheck = logHealthCheck;
// Graceful shutdown logging
const logShutdown = (signal, component) => {
    logger.info({
        signal,
        component,
        timestamp: new Date().toISOString()
    }, `Graceful shutdown initiated: ${signal} ${component ? `(${component})` : ''}`);
};
exports.logShutdown = logShutdown;
// Log environment info on startup (redacted)
logger.info({
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    env: env_1.env.NODE_ENV,
    port: env_1.env.PORT,
    hasWebhookSecret: !!env_1.env.WEBHOOK_SECRET,
    hasOwner: !!env_1.env.OWNER_TELEGRAM_ID,
}, 'Application starting up');
