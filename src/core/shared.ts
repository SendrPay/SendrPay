import { generateWallet, getWalletBalance, getWalletKeypair } from "./wallets.js";
import { executeTransfer } from "./transfer.js";
import { prisma } from "../infra/prisma.js";
import crypto from "crypto";
import { Keypair } from "@solana/web3.js";
import { v4 as uuidv4 } from "uuid";

// Helper function to create a custodial wallet for a user
async function createWallet(userId: number, label: string) {
  const keypair = Keypair.generate();
  const privateKeyBytes = keypair.secretKey;
  const publicKey = keypair.publicKey.toBase58();
  
  // For now, store without encryption (will implement proper encryption later)
  const wallet = await prisma.wallet.create({
    data: {
      userId,
      label,
      address: publicKey,
      encPrivKey: Buffer.from(privateKeyBytes),
      isActive: true
    }
  });

  // Set as active wallet
  await prisma.user.update({
    where: { id: userId },
    data: { activeWalletId: wallet.id }
  });

  return wallet;
}

export async function getOrCreateUserByDiscordId(discordId: string, discordUsername?: string) {
  let user = await prisma.user.findUnique({
    where: { discordId },
    include: { wallets: { where: { isActive: true } } }
  });

  if (!user) {
    // Create new user with custodial wallet
    user = await prisma.user.create({
      data: { 
        discordId,
        handle: discordUsername || null
      },
      include: { wallets: { where: { isActive: true } } }
    });
    
    // Create custodial wallet for new user
    await createWallet(user.id, "custodial");
    
    // Re-fetch user with their wallets after creating wallet
    user = await prisma.user.findUnique({
      where: { discordId },
      include: { wallets: { where: { isActive: true } } }
    });
  } else if (discordUsername && user.handle !== discordUsername) {
    // Update username if changed
    user = await prisma.user.update({
      where: { discordId },
      data: { handle: discordUsername },
      include: { wallets: { where: { isActive: true } } }
    });
  }

  return user;
}

export async function getOrCreateUserByTelegramId(telegramId: string) {
  let user = await prisma.user.findUnique({
    where: { telegramId },
    include: { wallets: { where: { isActive: true } } }
  });

  if (!user) {
    user = await prisma.user.create({
      data: { telegramId },
      include: { wallets: { where: { isActive: true } } }
    });
    
    await createWallet(user.id, "custodial");
    
    // Re-fetch user with their wallets after creating wallet
    user = await prisma.user.findUnique({
      where: { telegramId },
      include: { wallets: { where: { isActive: true } } }
    });
  }

  return user;
}

export async function lookupByHandle(platform: "telegram" | "discord" | "twitter", handle: string) {
  let user;
  
  if (platform === "telegram") {
    user = await prisma.user.findFirst({
      where: { 
        telegramId: { not: null },
        handle 
      }
    });
  } else if (platform === "discord") {
    user = await prisma.user.findFirst({
      where: { 
        discordId: { not: null },
        handle 
      }
    });
  } else {
    return null;
  }

  return user ? {
    platformId: platform === "telegram" ? user.telegramId! : user.discordId!,
    handle: user.handle || handle
  } : null;
}

// Function removed - Discord functionality stripped

export async function lookupLocalMentionDiscord(raw: string, ctx: any) {
  // Accept <@123>, <@!123>, or @username in the same guild
  const m = raw.match(/^<@!?(\d+)>$/);
  if (m) {
    const user = await prisma.user.findUnique({
      where: { discordId: m[1] }
    });
    return user ? { platformId: m[1], handle: raw } : null;
  }
  return null;
}

// === PAYMENTS ===
export async function sendPayment(opts: { 
  fromUserId: number; 
  toUserId?: number; 
  escrow?: { platform: string; handle: string }; 
  amount: string; 
  token: string; 
  note?: string 
}) {
  const fromUser = await prisma.user.findUnique({
    where: { id: opts.fromUserId },
    include: { wallets: { where: { isActive: true } } }
  });

  if (!fromUser || !fromUser.wallets[0]) {
    throw new Error("Sender wallet not found");
  }

  if (opts.toUserId) {
    const toUser = await prisma.user.findUnique({
      where: { id: opts.toUserId },
      include: { wallets: { where: { isActive: true } } }
    });

    if (!toUser || !toUser.wallets[0]) {
      throw new Error("Recipient wallet not found");
    }

    // Create payment record in database
    const payment = await prisma.payment.create({
      data: {
        id: uuidv4(),
        clientIntentId: uuidv4(),
        fromUserId: opts.fromUserId,
        toUserId: opts.toUserId,
        fromWallet: fromUser.wallets[0].address,
        toWallet: toUser.wallets[0].address,
        mint: opts.token === "SOL" ? "SOL" : opts.token,
        amountRaw: opts.amount,
        feeRaw: "0", // Simplified for now
        note: opts.note,
        status: "pending"
      }
    });

    // For now, return a demo transaction signature
    return { tx: `https://solscan.io/tx/DEMO_${payment.id}` };
  } else if (opts.escrow) {
    // Create escrow - for now return a demo response
    return { tx: "https://solscan.io/tx/ESCROW_PLACEHOLDER" };
  }

  throw new Error("Invalid payment options");
}

export async function createEscrowTagged(tag: { platform: string; handle: string; amount: string; token: string }) {
  // TODO: Implement escrow creation
  return { escrowId: "escrow_demo" };
}

export async function getBalances(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { wallets: { where: { isActive: true } } }
  });

  if (!user || !user.wallets[0]) {
    return { SOL: "0.00", USDC: "0.00" };
  }

  const balances = await getWalletBalance(user.wallets[0].address);
  
  if (!balances) {
    return { SOL: "0.00", USDC: "0.00" };
  }

  const sol = balances.find(b => b.mint === "SOL");
  const usdc = balances.find(b => b.mint === "USDC");
  
  return {
    SOL: sol ? sol.uiAmount.toFixed(2) : "0.00",
    USDC: usdc ? usdc.uiAmount.toFixed(2) : "0.00"
  };
}

export async function getDepositAddress(userId: number, token?: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { wallets: { where: { isActive: true } } }
  });

  if (!user || !user.wallets[0]) {
    throw new Error("User wallet not found");
  }

  return user.wallets[0].address;
}

export async function withdraw(userId: number, amount: string, token: string, address: string) {
  // TODO: Implement withdrawal logic using existing core
  return { tx: "https://solscan.io/tx/WITHDRAW_TEST" };
}

export async function getUserIdByPlatformId(platform: "discord" | "telegram" | "twitter", platformId: string) {
  let user;
  
  if (platform === "telegram") {
    user = await prisma.user.findUnique({
      where: { telegramId: platformId }
    });
  } else if (platform === "discord") {
    user = await prisma.user.findUnique({
      where: { discordId: platformId }
    });
  } else {
    return null;
  }

  return user?.id || null;
}

// === LINK CODE MANAGEMENT ===
export function createLinkCode(userId: number, platform: "discord" | "telegram", ttlMin: number = 10) {
  const code = crypto.randomBytes(4).toString("hex").toUpperCase();
  
  // Store in database instead of memory
  prisma.linkCode.create({
    data: {
      code,
      userId,
      platform,
      expiresAt: new Date(Date.now() + ttlMin * 60 * 1000)
    }
  }).catch(console.error); // Fire and forget

  return code;
}

export async function consumeLinkCode(code: string) {
  const linkCode = await prisma.linkCode.findUnique({
    where: { code }
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