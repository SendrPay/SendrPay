import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '../infra/prisma';
import { generateSecureCode, generateSessionId } from './crypto';

/**
 * Verify Telegram WebApp initData
 */
export function verifyTelegramInitData(initData: string, botToken: string): any | null {
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    
    if (!hash) {
      return null;
    }
    
    // Remove hash from params
    urlParams.delete('hash');
    
    // Sort params and create data check string
    const sortedParams = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    // Create secret key
    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
    
    // Calculate expected hash
    const expectedHash = createHmac('sha256', secretKey).update(sortedParams).digest('hex');
    
    // Compare hashes
    if (!timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'))) {
      return null;
    }
    
    // Parse user data
    const userParam = urlParams.get('user');
    if (!userParam) {
      return null;
    }
    
    return JSON.parse(userParam);
  } catch (error) {
    console.error('Telegram initData verification failed:', error);
    return null;
  }
}

/**
 * Create or get user from Telegram data
 */
export async function createOrGetTelegramUser(telegramUser: any) {
  const telegramId = telegramUser.id.toString();
  
  // Try to find existing user
  let user = await prisma.user.findUnique({
    where: { telegramId },
    include: { 
      wallets: { where: { isActive: true } },
      socialLinks: true
    }
  });
  
  if (!user) {
    // Create new user
    user = await prisma.user.create({
      data: {
        telegramId,
        handle: telegramUser.username || `${telegramUser.first_name}${telegramUser.last_name || ''}`,
        socialLinks: {
          create: {
            platform: 'telegram',
            platformId: telegramId,
            handle: telegramUser.username
          }
        }
      },
      include: { 
        wallets: { where: { isActive: true } },
        socialLinks: true
      }
    });
  }
  
  return user;
}

/**
 * Create session for user
 */
export async function createSession(userId: number): Promise<string> {
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  
  await prisma.session.create({
    data: {
      id: sessionId,
      userId,
      expiresAt
    }
  });
  
  return sessionId;
}

/**
 * Get user from session
 */
export async function getUserFromSession(sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      user: {
        include: {
          wallets: { where: { isActive: true } },
          socialLinks: true,
          oauthAccounts: true
        }
      }
    }
  });
  
  if (!session || session.expiresAt < new Date()) {
    return null;
  }
  
  return session.user;
}

/**
 * Create magic code for email login
 */
export async function createMagicCode(email: string): Promise<string> {
  const code = generateSecureCode(6);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  
  await prisma.magicCode.create({
    data: {
      email,
      code,
      expiresAt
    }
  });
  
  return code;
}

/**
 * Verify magic code and get/create user
 */
export async function verifyMagicCode(email: string, code: string) {
  const magicCode = await prisma.magicCode.findFirst({
    where: {
      email,
      code,
      used: false,
      expiresAt: { gt: new Date() }
    }
  });
  
  if (!magicCode) {
    return null;
  }
  
  // Mark code as used
  await prisma.magicCode.update({
    where: { id: magicCode.id },
    data: { used: true }
  });
  
  // Get or create user
  let user = await prisma.user.findUnique({
    where: { email },
    include: {
      wallets: { where: { isActive: true } },
      socialLinks: true,
      oauthAccounts: true
    }
  });
  
  if (!user) {
    user = await prisma.user.create({
      data: { email },
      include: {
        wallets: { where: { isActive: true } },
        socialLinks: true,
        oauthAccounts: true
      }
    });
  }
  
  return user;
}

/**
 * Clean up expired sessions and magic codes
 */
export async function cleanupExpired() {
  const now = new Date();
  
  await Promise.all([
    prisma.session.deleteMany({
      where: { expiresAt: { lt: now } }
    }),
    prisma.magicCode.deleteMany({
      where: { expiresAt: { lt: now } }
    })
  ]);
}