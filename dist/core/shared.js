"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrCreateUserByDiscordId = getOrCreateUserByDiscordId;
exports.getOrCreateUserByTelegramId = getOrCreateUserByTelegramId;
exports.lookupByHandle = lookupByHandle;
exports.lookupAllPlatformsByHandle = lookupAllPlatformsByHandle;
exports.lookupLocalMentionDiscord = lookupLocalMentionDiscord;
exports.sendPayment = sendPayment;
exports.createEscrowTagged = createEscrowTagged;
exports.getBalances = getBalances;
exports.getDepositAddress = getDepositAddress;
exports.withdraw = withdraw;
exports.getUserIdByPlatformId = getUserIdByPlatformId;
exports.createLinkCode = createLinkCode;
exports.consumeLinkCode = consumeLinkCode;
const wallets_js_1 = require("./wallets.js");
const prisma_js_1 = require("../infra/prisma.js");
const crypto_1 = require("crypto");
const web3_js_1 = require("@solana/web3.js");
const uuid_1 = require("uuid");
// Helper function to create a custodial wallet for a user
async function createWallet(userId, label) {
    const keypair = web3_js_1.Keypair.generate();
    const privateKeyBytes = keypair.secretKey;
    const publicKey = keypair.publicKey.toBase58();
    // For now, store without encryption (will implement proper encryption later)
    const wallet = await prisma_js_1.prisma.wallet.create({
        data: {
            userId,
            label,
            address: publicKey,
            encPrivKey: Buffer.from(privateKeyBytes),
            isActive: true
        }
    });
    // Set as active wallet
    await prisma_js_1.prisma.user.update({
        where: { id: userId },
        data: { activeWalletId: wallet.id }
    });
    return wallet;
}
async function getOrCreateUserByDiscordId(discordId) {
    let user = await prisma_js_1.prisma.user.findUnique({
        where: { discordId },
        include: { wallets: { where: { isActive: true } } }
    });
    if (!user) {
        // Create new user with custodial wallet
        user = await prisma_js_1.prisma.user.create({
            data: { discordId },
            include: { wallets: { where: { isActive: true } } }
        });
        // Create custodial wallet for new user
        await createWallet(user.id, "custodial");
    }
    return user;
}
async function getOrCreateUserByTelegramId(telegramId) {
    let user = await prisma_js_1.prisma.user.findUnique({
        where: { telegramId },
        include: { wallets: { where: { isActive: true } } }
    });
    if (!user) {
        user = await prisma_js_1.prisma.user.create({
            data: { telegramId },
            include: { wallets: { where: { isActive: true } } }
        });
        await createWallet(user.id, "custodial");
    }
    return user;
}
async function lookupByHandle(platform, handle) {
    let user;
    if (platform === "telegram") {
        user = await prisma_js_1.prisma.user.findFirst({
            where: {
                telegramId: { not: null },
                handle
            }
        });
    }
    else if (platform === "discord") {
        user = await prisma_js_1.prisma.user.findFirst({
            where: {
                discordId: { not: null },
                handle
            }
        });
    }
    else {
        return null;
    }
    return user ? {
        platformId: platform === "telegram" ? user.telegramId : user.discordId,
        handle: user.handle || handle
    } : null;
}
async function lookupAllPlatformsByHandle(handle) {
    const user = await prisma_js_1.prisma.user.findFirst({
        where: { handle }
    });
    if (!user)
        return [];
    const platforms = [];
    if (user.telegramId) {
        platforms.push({ platform: "telegram", platformId: user.telegramId, handle });
    }
    if (user.discordId) {
        platforms.push({ platform: "discord", platformId: user.discordId, handle });
    }
    return platforms;
}
async function lookupLocalMentionDiscord(raw, ctx) {
    // Accept <@123>, <@!123>, or @username in the same guild
    const m = raw.match(/^<@!?(\d+)>$/);
    if (m) {
        const user = await prisma_js_1.prisma.user.findUnique({
            where: { discordId: m[1] }
        });
        return user ? { platformId: m[1], handle: raw } : null;
    }
    return null;
}
// === PAYMENTS ===
async function sendPayment(opts) {
    const fromUser = await prisma_js_1.prisma.user.findUnique({
        where: { id: opts.fromUserId },
        include: { wallets: { where: { isActive: true } } }
    });
    if (!fromUser || !fromUser.wallets[0]) {
        throw new Error("Sender wallet not found");
    }
    if (opts.toUserId) {
        const toUser = await prisma_js_1.prisma.user.findUnique({
            where: { id: opts.toUserId },
            include: { wallets: { where: { isActive: true } } }
        });
        if (!toUser || !toUser.wallets[0]) {
            throw new Error("Recipient wallet not found");
        }
        // Create payment record in database
        const payment = await prisma_js_1.prisma.payment.create({
            data: {
                id: (0, uuid_1.v4)(),
                clientIntentId: (0, uuid_1.v4)(),
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
    }
    else if (opts.escrow) {
        // Create escrow - for now return a demo response
        return { tx: "https://solscan.io/tx/ESCROW_PLACEHOLDER" };
    }
    throw new Error("Invalid payment options");
}
async function createEscrowTagged(tag) {
    // TODO: Implement escrow creation
    return { escrowId: "escrow_demo" };
}
async function getBalances(userId) {
    const user = await prisma_js_1.prisma.user.findUnique({
        where: { id: userId },
        include: { wallets: { where: { isActive: true } } }
    });
    if (!user || !user.wallets[0]) {
        return { SOL: "0.00", USDC: "0.00" };
    }
    const balances = await (0, wallets_js_1.getWalletBalance)(user.wallets[0].address);
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
async function getDepositAddress(userId, token) {
    const user = await prisma_js_1.prisma.user.findUnique({
        where: { id: userId },
        include: { wallets: { where: { isActive: true } } }
    });
    if (!user || !user.wallets[0]) {
        throw new Error("User wallet not found");
    }
    return user.wallets[0].address;
}
async function withdraw(userId, amount, token, address) {
    // TODO: Implement withdrawal logic using existing core
    return { tx: "https://solscan.io/tx/WITHDRAW_TEST" };
}
async function getUserIdByPlatformId(platform, platformId) {
    let user;
    if (platform === "telegram") {
        user = await prisma_js_1.prisma.user.findUnique({
            where: { telegramId: platformId }
        });
    }
    else if (platform === "discord") {
        user = await prisma_js_1.prisma.user.findUnique({
            where: { discordId: platformId }
        });
    }
    else {
        return null;
    }
    return user?.id || null;
}
// === LINK CODE MANAGEMENT ===
function createLinkCode(userId, platform, ttlMin = 10) {
    const code = crypto_1.default.randomBytes(4).toString("hex").toUpperCase();
    // Store in database instead of memory
    prisma_js_1.prisma.linkCode.create({
        data: {
            code,
            userId,
            platform,
            expiresAt: new Date(Date.now() + ttlMin * 60 * 1000)
        }
    }).catch(console.error); // Fire and forget
    return code;
}
async function consumeLinkCode(code) {
    const linkCode = await prisma_js_1.prisma.linkCode.findUnique({
        where: { code }
    });
    if (!linkCode || linkCode.used || linkCode.expiresAt < new Date()) {
        return null;
    }
    // Mark as used
    await prisma_js_1.prisma.linkCode.update({
        where: { id: linkCode.id },
        data: { used: true }
    });
    return {
        userId: linkCode.userId,
        platform: linkCode.platform,
        exp: linkCode.expiresAt.getTime(),
        used: true
    };
}
