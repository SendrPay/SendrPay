import { prisma } from "../infra/prisma";

export interface ResolvedUser {
  id: number;
  handle: string | null;
  telegramId: string;
}

/**
 * Resolve a Telegram user by handle
 * @param handle - The username to search for
 * @returns ResolvedUser or null if not found
 */
export async function resolveUserByHandle(handle: string): Promise<ResolvedUser | null> {
  console.log(`🔍 Searching for Telegram user: ${handle}`);
  
  // Search for user by handle (case-insensitive)
  let user = await prisma.user.findFirst({
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
      telegramId: user.telegramId
    };
  }
  
  return null;
}

/**
 * Find user by Telegram ID
 */
export async function findUserByTelegramId(telegramId: string): Promise<ResolvedUser | null> {
  const user = await prisma.user.findUnique({
    where: { telegramId }
  });
  
  if (!user || !user.telegramId) return null;
  
  return {
    id: user.id,
    handle: user.handle,
    telegramId: user.telegramId
  };
}

/**
 * Find user by database ID
 */
export async function findUserById(userId: number): Promise<ResolvedUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });
  
  if (!user || !user.telegramId) return null;
  
  return {
    id: user.id,
    handle: user.handle,
    telegramId: user.telegramId
  };
}