import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../infra/prisma";
import { getBalances } from "../core/shared";
import { logger } from "../infra/logger";
import { env } from "../infra/env";

const router = Router();

// Telegram WebApp data validation
function validateTelegramWebAppData(initData: string): any {
  try {
    logger.info(`Validating Telegram WebApp data, length: ${initData.length}`);
    
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    
    logger.info(`InitData params - hasHash: ${!!hash}, params: ${Array.from(urlParams.keys()).join(',')}, hasUser: ${!!urlParams.get('user')}`);
    
    urlParams.delete('hash');
    
    // Create data check string
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    // Create secret key
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(env.BOT_TOKEN!)
      .digest();
    
    // Calculate hash
    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
    
    logger.info(`Hash validation - received: ${hash}, expected: ${expectedHash}`);
    
    if (hash !== expectedHash) {
      throw new Error('Invalid hash');
    }
    
    // Parse user data
    const userParam = urlParams.get('user');
    if (!userParam) {
      throw new Error('No user data');
    }
    
    const user = JSON.parse(userParam);
    logger.info(`User data parsed successfully - ID: ${user.id}, username: ${user.username}`);
    return user;
  } catch (error) {
    logger.error('WebApp data validation failed:', error);
    return null;
  }
}

// Authentication middleware
async function authenticateWebApp(req: any, res: any, next: any) {
  try {
    const initData = req.headers['x-telegram-init-data'];
    
    // Log for debugging
    logger.info(`Authentication attempt - hasInitData: ${!!initData}, length: ${initData?.length || 0}`);
    
    if (!initData) {
      return res.status(401).json({ 
        error: 'No Telegram init data',
        debug: {
          hasHeader: !!req.headers['x-telegram-init-data'],
          headers: Object.keys(req.headers)
        }
      });
    }
    
    const user = validateTelegramWebAppData(initData);
    if (!user) {
      return res.status(401).json({ error: 'Invalid Telegram data' });
    }
    
    // Find or create user in database
    let dbUser = await prisma.user.findUnique({
      where: { telegramId: user.id.toString() },
      include: { wallets: { where: { isActive: true } } }
    });
    
    if (!dbUser) {
      // Create new user with custodial wallet
      const { getOrCreateUserByTelegramId } = await import("../core/shared");
      dbUser = await getOrCreateUserByTelegramId(user.id.toString());
    }
    
    req.user = {
      ...user,
      dbUser
    };
    
    next();
  } catch (error) {
    logger.error('WebApp authentication error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
}

// Test route (no authentication required)
router.get('/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'API is working',
    timestamp: new Date().toISOString(),
    userAgent: req.headers['user-agent'],
    initDataHeader: !!req.headers['x-telegram-init-data'],
    initDataLength: req.headers['x-telegram-init-data']?.length || 0
  });
});

// Simple user route for testing
router.get('/user', (req, res) => {
  res.json({
    error: 'Authentication temporarily disabled for testing',
    hasInitData: !!req.headers['x-telegram-init-data'],
    initDataLength: req.headers['x-telegram-init-data']?.length || 0
  });
});

// API Routes with authentication (temporarily disabled)
router.get('/user-auth', authenticateWebApp, async (req: any, res) => {
  try {
    const { user } = req;
    const balances = await getBalances(user.dbUser.id);
    
    res.json({
      user: {
        id: user.id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name
      },
      wallet: {
        address: user.dbUser.wallets[0]?.address,
        balances
      }
    });
  } catch (error) {
    logger.error('Get user API error:', error);
    res.status(500).json({ error: 'Failed to get user data' });
  }
});

router.get('/balance', authenticateWebApp, async (req: any, res) => {
  try {
    const { user } = req;
    const balances = await getBalances(user.dbUser.id);
    res.json({ balances });
  } catch (error) {
    logger.error('Get balance API error:', error);
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

router.get('/history', authenticateWebApp, async (req: any, res) => {
  try {
    const { user } = req;
    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { senderTelegramId: user.id.toString() },
          { recipientTelegramId: user.id.toString() }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    
    res.json({ transactions });
  } catch (error) {
    logger.error('Get history API error:', error);
    res.status(500).json({ error: 'Failed to get transaction history' });
  }
});

router.post('/send', authenticateWebApp, async (req: any, res) => {
  try {
    const { user } = req;
    const { recipient, amount, token, note } = req.body;
    
    // Validate input
    if (!recipient || !amount || !token) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Find recipient user
    const { resolveUserByHandle } = await import("../core/user-resolver");
    const recipientUser = await resolveUserByHandle(recipient);
    
    if (!recipientUser) {
      return res.status(404).json({ error: 'Recipient not found' });
    }
    
    // Execute payment
    const { sendPayment } = await import("../core/shared");
    const result = await sendPayment({
      fromUserId: user.dbUser.id,
      toUserId: recipientUser.id,
      amount: amount.toString(),
      token,
      note
    });
    
    res.json({ success: true, transaction: result.tx });
  } catch (error) {
    logger.error('Send payment API error:', error);
    res.status(500).json({ error: 'Failed to send payment' });
  }
});

export default router;