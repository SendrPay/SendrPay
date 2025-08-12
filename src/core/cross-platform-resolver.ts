import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface ResolvedUser {
  id: number;
  handle: string | null;
  platform: "telegram" | "discord";
  platformId: string;
}

/**
 * Resolve a user across platforms
 * @param handle - The username to search for
 * @param targetPlatform - Specific platform to search (null = current platform)
 * @param currentPlatform - The platform where the command was issued
 * @returns ResolvedUser or null if not found
 */
export async function resolveUserCrossPlatform(
  handle: string,
  targetPlatform: "telegram" | "discord" | null,
  currentPlatform: "telegram" | "discord"
): Promise<ResolvedUser | null> {
  
  // If target platform is specified, search only that platform
  if (targetPlatform) {
    if (targetPlatform === "discord") {
      const user = await prisma.user.findFirst({
        where: { 
          handle: { equals: handle, mode: 'insensitive' },
          discordId: { not: null }
        }
      });
      
      if (user && user.discordId) {
        return {
          id: user.id,
          handle: user.handle,
          platform: "discord",
          platformId: user.discordId
        };
      }
    } else if (targetPlatform === "telegram") {
      const user = await prisma.user.findFirst({
        where: { 
          handle: { equals: handle, mode: 'insensitive' },
          telegramId: { not: null }
        }
      });
      
      if (user && user.telegramId) {
        return {
          id: user.id,
          handle: user.handle,
          platform: "telegram",
          platformId: user.telegramId
        };
      }
    }
    return null;
  }
  
  // No specific platform, default to current platform first
  if (currentPlatform === "telegram") {
    // Search Telegram first, then Discord
    let user = await prisma.user.findFirst({
      where: { 
        handle: { equals: handle, mode: 'insensitive' },
        telegramId: { not: null }
      }
    });
    
    if (user && user.telegramId) {
      return {
        id: user.id,
        handle: user.handle,
        platform: "telegram",
        platformId: user.telegramId
      };
    }
    
    // Fallback to Discord if linked account
    user = await prisma.user.findFirst({
      where: { 
        handle: { equals: handle, mode: 'insensitive' },
        AND: [
          { discordId: { not: null } },
          { telegramId: { not: null } } // Only linked accounts
        ]
      }
    });
    
    if (user && user.discordId) {
      return {
        id: user.id,
        handle: user.handle,
        platform: "discord",
        platformId: user.discordId
      };
    }
    
  } else if (currentPlatform === "discord") {
    // Search Discord first, then Telegram
    let user = await prisma.user.findFirst({
      where: { 
        handle: { equals: handle, mode: 'insensitive' },
        discordId: { not: null }
      }
    });
    
    if (user && user.discordId) {
      return {
        id: user.id,
        handle: user.handle,
        platform: "discord",
        platformId: user.discordId
      };
    }
    
    // Fallback to Telegram if linked account
    user = await prisma.user.findFirst({
      where: { 
        handle: { equals: handle, mode: 'insensitive' },
        AND: [
          { telegramId: { not: null } },
          { discordId: { not: null } } // Only linked accounts
        ]
      }
    });
    
    if (user && user.telegramId) {
      return {
        id: user.id,
        handle: user.handle,
        platform: "telegram",
        platformId: user.telegramId
      };
    }
  }
  
  return null;
}

/**
 * Find user by database ID (for linked accounts)
 */
export async function findUserById(userId: number): Promise<ResolvedUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });
  
  if (!user) return null;
  
  // Prefer the platform that has an active account
  if (user.telegramId) {
    return {
      id: user.id,
      handle: user.handle,
      platform: "telegram",
      platformId: user.telegramId
    };
  } else if (user.discordId) {
    return {
      id: user.id,
      handle: user.handle,
      platform: "discord",
      platformId: user.discordId
    };
  }
  
  return null;
}