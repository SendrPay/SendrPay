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

// Main user route with proper authentication
router.get('/user', authenticateWebApp, async (req: any, res) => {
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

// Test route for debugging (no auth required)
router.get('/debug', async (req, res) => {
  try {
    const initData = req.headers['x-telegram-init-data'];
    
    if (!initData) {
      return res.json({
        error: 'No Telegram authentication data provided',
        debug: {
          hasInitData: false,
          initDataLength: 0,
          userAgent: req.headers['user-agent'],
          isTelegramBrowser: req.headers['user-agent']?.includes('Telegram') || false
        },
        message: 'This app must be opened through Telegram.'
      });
    }

    const initDataStr = Array.isArray(initData) ? initData[0] : initData;
    logger.info(`Received initData: ${initDataStr.substring(0, 50)}...`);
    
    res.json({
      success: true,
      message: 'InitData received successfully',
      hasInitData: true,
      initDataLength: initDataStr.length
    });
    
  } catch (error) {
    logger.error('Debug route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
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

// Wallet information endpoint
router.get('/wallet-info', authenticateWebApp, async (req: any, res) => {
  try {
    const { user } = req;
    const wallet = user.dbUser.wallets[0];
    
    if (!wallet) {
      return res.status(404).json({ error: 'No wallet found' });
    }
    
    const balances = await getBalances(user.dbUser.id);
    
    // Get additional wallet details
    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { senderTelegramId: user.id.toString() },
          { recipientTelegramId: user.id.toString() }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 5 // Recent transactions
    });
    
    res.json({
      wallet: {
        address: wallet.address,
        label: wallet.label,
        isActive: wallet.isActive,
        createdAt: wallet.createdAt
      },
      balances,
      recentTransactions: transactions.length,
      totalTransactions: await prisma.transaction.count({
        where: {
          OR: [
            { senderTelegramId: user.id.toString() },
            { recipientTelegramId: user.id.toString() }
          ]
        }
      })
    });
  } catch (error) {
    logger.error('Wallet info API error:', error);
    res.status(500).json({ error: 'Failed to get wallet information' });
  }
});

// Export private key (security feature)
router.post('/export-key', authenticateWebApp, async (req: any, res) => {
  try {
    const { user } = req;
    const wallet = user.dbUser.wallets[0];
    
    if (!wallet || !wallet.encPrivKey) {
      return res.status(404).json({ error: 'No custodial wallet found' });
    }
    
    // Return the private key (stored as Buffer)
    const privateKeyArray = Array.from(wallet.encPrivKey);
    
    res.json({ 
      success: true, 
      privateKey: privateKeyArray,
      warning: 'Keep this private key secure. Never share it with anyone.'
    });
  } catch (error) {
    logger.error('Export key API error:', error);
    res.status(500).json({ error: 'Failed to export private key' });
  }
});

// Bot settings endpoint
router.get('/settings', authenticateWebApp, async (req: any, res) => {
  try {
    const { user } = req;
    
    // Get user preferences from database
    const userSettings = await prisma.user.findUnique({
      where: { telegramId: user.id.toString() },
      select: {
        id: true,
        telegramId: true,
        handle: true,
        discordId: true,

        createdAt: true,
        wallets: {
          where: { isActive: true },
          select: {
            address: true,
            label: true,
            createdAt: true
          }
        }
      }
    });
    
    res.json({
      user: userSettings,
      linkedAccounts: {
        telegram: !!userSettings?.telegramId,
        discord: !!userSettings?.discordId
      },
      notifications: {
        payments: true, // Default settings
        tips: true,
        mentions: true
      }
    });
  } catch (error) {
    logger.error('Settings API error:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// Generate link code for cross-platform account linking
router.post('/generate-linkcode', authenticateWebApp, async (req: any, res) => {
  try {
    const { user } = req;
    
    const { createLinkCode } = await import("../core/shared");
    const linkCode = await createLinkCode(user.dbUser.id, 'telegram');
    
    res.json({ 
      success: true, 
      linkCode,
      expiresIn: '10 minutes',
      instructions: 'Use this code in Discord with /link command to connect your accounts'
    });
  } catch (error) {
    logger.error('Generate linkcode API error:', error);
    res.status(500).json({ error: 'Failed to generate link code' });
  }
});

// Withdraw to external address
router.post('/withdraw', authenticateWebApp, async (req: any, res) => {
  try {
    const { user } = req;
    const { address, amount, token } = req.body;
    
    // Validate input
    if (!address || !amount || !token) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Validate Solana address format
    try {
      const { PublicKey } = await import("@solana/web3.js");
      new PublicKey(address);
    } catch {
      return res.status(400).json({ error: 'Invalid Solana address' });
    }
    
    // Execute withdrawal
    const { withdraw } = await import("../core/shared");
    const result = await withdraw(user.dbUser.id, amount.toString(), token, address);
    
    res.json({ success: true, transaction: result.tx });
  } catch (error) {
    logger.error('Withdraw API error:', error);
    res.status(500).json({ error: 'Failed to withdraw funds' });
  }
});

// Get supported tokens
router.get('/tokens', async (req, res) => {
  try {
    // Return hardcoded supported tokens for now
    const tokens = [
      { symbol: 'SOL', name: 'Solana', decimals: 9 },
      { symbol: 'USDC', name: 'USD Coin', decimals: 6 }
    ];
    
    res.json({ tokens });
  } catch (error) {
    logger.error('Get tokens API error:', error);
    res.status(500).json({ error: 'Failed to get supported tokens' });
  }
});

export default router;