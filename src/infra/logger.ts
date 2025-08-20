import pino from 'pino';
import { env, isDevelopment, isProduction } from './env';

// Create logger with appropriate configuration for environment
const logger = pino({
  level: isDevelopment ? 'debug' : 'info',
  
  // Pretty print in development for better readability
  transport: isDevelopment ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
    }
  } : undefined,
  
  // Production logging configuration
  ...(isProduction && {
    formatters: {
      level: (label) => ({ level: label.toUpperCase() }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
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
    env: env.NODE_ENV,
  },
});

// Enhanced logging methods with context
export const createLogger = (context: string) => {
  return logger.child({ context });
};

// Specialized loggers for different components
export const botLogger = createLogger('bot');
export const dbLogger = createLogger('database');
export const webhookLogger = createLogger('webhook'); 
export const paymentLogger = createLogger('payment');
export const escrowLogger = createLogger('escrow');
export const securityLogger = createLogger('security');

// Performance logging helpers
export const perfLogger = {
  start: (operation: string) => {
    const startTime = Date.now();
    return {
      end: (additionalData?: any) => {
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
export const logError = (error: Error | any, context?: string, additional?: any) => {
  const errorData = {
    error: {
      name: error?.name,
      message: error?.message,
      stack: isDevelopment ? error?.stack : undefined,
    },
    context,
    ...additional
  };

  logger.error(errorData, `Error in ${context || 'unknown context'}: ${error?.message || 'Unknown error'}`);
};

// Security event logging
export const logSecurityEvent = (event: string, details: any, severity: 'low' | 'medium' | 'high' = 'medium') => {
  securityLogger.warn({
    event,
    severity,
    timestamp: new Date().toISOString(),
    ...details
  }, `Security event: ${event}`);
};

// Payment transaction logging
export const logPayment = (
  type: 'sent' | 'received' | 'failed',
  amount: string,
  token: string,
  from: string,
  to: string,
  signature?: string,
  error?: string
) => {
  paymentLogger.info({
    type,
    amount,
    token,
    from: from.slice(0, 8) + '...',
    to: to.slice(0, 8) + '...',
    signature,
    error
  }, `Payment ${type}: ${amount} ${token} from ${from.slice(0, 8)}... to ${to.slice(0, 8)}...`);
};

// Webhook logging
export const logWebhook = (event: string, signature: string, valid: boolean, details?: any) => {
  webhookLogger.info({
    event,
    signature: signature.slice(0, 16) + '...',
    valid,
    ...details
  }, `Webhook ${event}: signature ${valid ? 'valid' : 'invalid'}`);
};

// Bot command logging
export const logCommand = (
  command: string,
  userId: string,
  chatId: string,
  success: boolean,
  duration?: number,
  error?: string
) => {
  botLogger.info({
    command,
    userId: userId.slice(0, 8) + '...',
    chatId: chatId.slice(0, 8) + '...',
    success,
    duration,
    error
  }, `Command ${command}: ${success ? 'success' : 'failed'} (${duration || 0}ms)`);
};

// Database query logging (when enabled)
export const logQuery = (query: string, params?: any[], duration?: number) => {
  if (isDevelopment) {
    dbLogger.debug({
      query: query.slice(0, 100) + (query.length > 100 ? '...' : ''),
      paramCount: params?.length || 0,
      duration
    }, `Database query executed (${duration || 0}ms)`);
  }
};

// Rate limiting logging
export const logRateLimit = (identifier: string, operation: string, remaining: number) => {
  logger.debug({
    identifier: identifier.slice(0, 16) + '...',
    operation,
    remaining
  }, `Rate limit check: ${operation} (${remaining} remaining)`);
};

// Startup logging
export const logStartup = (component: string, config?: any) => {
  logger.info({
    component,
    config: config ? Object.keys(config) : undefined
  }, `${component} initialized`);
};

// Health check logging
export const logHealthCheck = (service: string, healthy: boolean, details?: any) => {
  const level = healthy ? 'info' : 'warn';
  logger[level]({
    service,
    healthy,
    ...details
  }, `Health check: ${service} is ${healthy ? 'healthy' : 'unhealthy'}`);
};

// Graceful shutdown logging
export const logShutdown = (signal: string, component?: string) => {
  logger.info({
    signal,
    component,
    timestamp: new Date().toISOString()
  }, `Graceful shutdown initiated: ${signal} ${component ? `(${component})` : ''}`);
};

// Export main logger
export { logger };

// Log environment info on startup (redacted)
logger.info({
  nodeVersion: process.version,
  platform: process.platform,
  arch: process.arch,
  env: env.NODE_ENV,
  port: env.PORT,
  hasHeliusWebhookSecret: !!env.HELIUS_WEBHOOK_SECRET,
  hasOwner: !!env.OWNER_TELEGRAM_ID,
}, 'Application starting up');
