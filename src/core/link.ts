import crypto from "crypto";
import { prisma } from "../infra/prisma.js";

export function createLinkCode(userId: number, platform: "discord" | "telegram", ttlMin = 10) {
  const code = crypto.randomBytes(4).toString("hex").toUpperCase();
  
  // Store in database
  prisma.linkCode.create({
    data: {
      code,
      userId,
      platform,
      expiresAt: new Date(Date.now() + ttlMin * 60 * 1000)
    }
  }).catch(console.error);

  return code;
}

export async function consumeLinkCode(code: string) {
  const linkCode = await prisma.linkCode.findUnique({
    where: { code },
    include: { user: true }
  });

  if (!linkCode || linkCode.used || linkCode.expiresAt < new Date()) {
    return null;
  }

  // Mark as used
  await prisma.linkCode.update({
    where: { id: linkCode.id },
    data: { used: true }
  });

  return {
    userId: linkCode.userId,
    platform: linkCode.platform as "discord" | "telegram",
    exp: linkCode.expiresAt.getTime(),
    used: true
  };
}

export async function linkPlatformAccounts(userId: number, discordId: string) {
  // Link Discord ID to existing user account
  await prisma.user.update({
    where: { id: userId },
    data: { discordId }
  });
}