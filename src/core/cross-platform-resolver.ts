import { prisma } from "../infra/prisma";

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
    console.log(`🔍 Searching for ${handle} on ${targetPlatform}`);
    
    if (targetPlatform === "discord") {
      const user = await prisma.user.findFirst({
        where: { 
          handle: { equals: handle, mode: 'insensitive' },
          discordId: { not: null }
        }
      });
      
      console.log(`Discord search result:`, user ? `Found user ${user.id}` : "Not found");
      
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
      
      console.log(`Telegram search result:`, user ? `Found user ${user.id}` : "Not found");
      
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
  console.log(`🔍 Searching for ${handle} from ${currentPlatform} (no platform specified)`);
  
  if (currentPlatform === "telegram") {
    // Search Telegram first
    let user = await prisma.user.findFirst({
      where: { 
        handle: { equals: handle, mode: 'insensitive' },
        telegramId: { not: null }
      }
    });
    
    console.log(`Telegram-first search result:`, user ? `Found user ${user.id}` : "Not found");
    
    if (user && user.telegramId) {
      return {
        id: user.id,
        handle: user.handle,
        platform: "telegram",
        platformId: user.telegramId
      };
    }
    
    // Fallback to ANY user with that handle (including Discord-only users if they're linked)
    user = await prisma.user.findFirst({
      where: { 
        handle: { equals: handle, mode: 'insensitive' },
        OR: [
          { discordId: { not: null } },
          { telegramId: { not: null } }
        ]
      }
    });
    
    console.log(`Fallback search result:`, user ? `Found user ${user.id} (Discord: ${!!user.discordId}, Telegram: ${!!user.telegramId})` : "Not found");
    
    if (user) {
      // Return the user with their primary platform
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
    }
    
  } else if (currentPlatform === "discord") {
    // Search Discord first
    let user = await prisma.user.findFirst({
      where: { 
        handle: { equals: handle, mode: 'insensitive' },
        discordId: { not: null }
      }
    });
    
    console.log(`Discord-first search result:`, user ? `Found user ${user.id}` : "Not found");
    
    if (user && user.discordId) {
      return {
        id: user.id,
        handle: user.handle,
        platform: "discord",
        platformId: user.discordId
      };
    }
    
    // Fallback to ANY user with that handle
    user = await prisma.user.findFirst({
      where: { 
        handle: { equals: handle, mode: 'insensitive' },
        OR: [
          { discordId: { not: null } },
          { telegramId: { not: null } }
        ]
      }
    });
    
    console.log(`Fallback search result:`, user ? `Found user ${user.id} (Discord: ${!!user.discordId}, Telegram: ${!!user.telegramId})` : "Not found");
    
    if (user) {
      // Return the user with their primary platform
      if (user.discordId) {
        return {
          id: user.id,
          handle: user.handle,
          platform: "discord",
          platformId: user.discordId
        };
      } else if (user.telegramId) {
        return {
          id: user.id,
          handle: user.handle,
          platform: "telegram",
          platformId: user.telegramId
        };
      }
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