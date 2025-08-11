"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptPrivateKey = encryptPrivateKey;
exports.decryptPrivateKey = decryptPrivateKey;
exports.generateWallet = generateWallet;
exports.importWallet = importWallet;
exports.getWalletBalance = getWalletBalance;
exports.getWalletKeypair = getWalletKeypair;
const web3_js_1 = require("@solana/web3.js");
const crypto_1 = require("crypto");
const prisma_1 = require("../infra/prisma");
const env_1 = require("../infra/env");
const logger_1 = require("../infra/logger");
const bs58_1 = require("bs58");
// AES-GCM encryption for wallet keys
function encryptPrivateKey(privateKeyBytes, masterKey) {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(masterKey, 'base64');
    const iv = (0, crypto_1.randomBytes)(12); // GCM recommends 96-bit IV
    const cipher = (0, crypto_1.createCipheriv)(algorithm, key, iv);
    cipher.setAAD(Buffer.from('solana-wallet'));
    let encrypted = cipher.update(Buffer.from(privateKeyBytes));
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Return: IV (12) + AuthTag (16) + Encrypted Data
    return Buffer.concat([iv, authTag, encrypted]);
}
function decryptPrivateKey(encryptedData, masterKey) {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(masterKey, 'base64');
    // Extract components
    const iv = encryptedData.slice(0, 12);
    const authTag = encryptedData.slice(12, 28);
    const encrypted = encryptedData.slice(28);
    const decipher = (0, crypto_1.createDecipheriv)(algorithm, key, iv);
    decipher.setAAD(Buffer.from('solana-wallet'));
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return new Uint8Array(decrypted);
}
async function generateWallet(ctx) {
    try {
        const userId = ctx.from?.id.toString();
        if (!userId) {
            return ctx.reply("❌ Could not identify user.");
        }
        // Create or get user - always update handle from Telegram account (normalized to lowercase)
        const user = await prisma_1.prisma.user.upsert({
            where: { telegramId: userId },
            update: {
                handle: ctx.from?.username?.toLowerCase() || null // Update with current Telegram username (lowercase)
            },
            create: {
                telegramId: userId,
                handle: ctx.from?.username?.toLowerCase() || null // Use Telegram username (lowercase), not custom
            }
        });
        // Generate new keypair
        const keypair = web3_js_1.Keypair.generate();
        const privateKeyBytes = keypair.secretKey;
        const publicKey = keypair.publicKey.toBase58();
        // Encrypt private key
        const encryptedKey = encryptPrivateKey(privateKeyBytes, env_1.env.MASTER_KMS_KEY);
        // Save wallet
        await prisma_1.prisma.wallet.create({
            data: {
                userId: user.id,
                label: "custodial",
                address: publicKey,
                encPrivKey: encryptedKey,
                isActive: true
            }
        });
        // Deactivate other wallets for this user
        await prisma_1.prisma.wallet.updateMany({
            where: {
                userId: user.id,
                address: { not: publicKey }
            },
            data: { isActive: false }
        });
        const warningText = `✨ **Wallet Created**

**Address:** \`${publicKey.slice(0, 8)}...${publicKey.slice(-4)}\`

🔑 **Private Key** (save this securely):
\`${bs58_1.default.encode(privateKeyBytes)}\`

**Important:**
• Save your private key - shown only once
• Keep it private and secure
• Anyone with this key controls your wallet

Ready for payments!`;
        await ctx.reply(warningText, { parse_mode: "Markdown" });
        // Show home page after wallet creation
        const { showHomePage } = await Promise.resolve().then(() => require("../commands/settings"));
        setTimeout(async () => {
            try {
                await showHomePage(ctx);
            }
            catch (error) {
                logger_1.logger.error("Error showing home page:", error);
            }
        }, 2000);
        logger_1.logger.info(`Wallet generated for user ${userId}: ${publicKey}`);
    }
    catch (error) {
        logger_1.logger.error("Error generating wallet:", error);
        await ctx.reply("❌ Failed to generate wallet. Please try again.");
    }
}
async function importWallet(ctx, privateKeyInput) {
    try {
        const userId = ctx.from?.id.toString();
        if (!userId) {
            return ctx.reply("❌ Could not identify user.");
        }
        let privateKeyBytes;
        // Try to parse as base58 or JSON
        try {
            if (privateKeyInput.startsWith('[') && privateKeyInput.endsWith(']')) {
                // JSON format [1,2,3,...]
                const keyArray = JSON.parse(privateKeyInput);
                privateKeyBytes = new Uint8Array(keyArray);
            }
            else {
                // Base58 format
                privateKeyBytes = bs58_1.default.decode(privateKeyInput);
            }
            if (privateKeyBytes.length !== 64) {
                throw new Error("Invalid key length");
            }
        }
        catch {
            return ctx.reply("❌ Invalid private key format. Use base58 string or JSON array.");
        }
        // Create keypair to validate and get public key
        const keypair = web3_js_1.Keypair.fromSecretKey(privateKeyBytes);
        const publicKey = keypair.publicKey.toBase58();
        // Create or get user - always update handle from Telegram account (normalized to lowercase)
        const user = await prisma_1.prisma.user.upsert({
            where: { telegramId: userId },
            update: {
                handle: ctx.from?.username?.toLowerCase() || null // Update with current Telegram username (lowercase)
            },
            create: {
                telegramId: userId,
                handle: ctx.from?.username?.toLowerCase() || null // Use Telegram username (lowercase), not custom
            }
        });
        // Check if wallet already exists
        const existing = await prisma_1.prisma.wallet.findUnique({
            where: { address: publicKey }
        });
        if (existing) {
            if (existing.userId === user.id) {
                // User re-importing their own wallet
                await prisma_1.prisma.wallet.update({
                    where: { address: publicKey },
                    data: { isActive: true }
                });
                await ctx.reply(`✅ **Wallet Reactivated**

**Address:** \`${publicKey.slice(0, 8)}...${publicKey.slice(-4)}\`

Ready for payments`, { parse_mode: "Markdown" });
            }
            else {
                return ctx.reply("❌ This wallet is already imported by another user.");
            }
        }
        else {
            // Encrypt and save new wallet
            const encryptedKey = encryptPrivateKey(privateKeyBytes, env_1.env.MASTER_KMS_KEY);
            await prisma_1.prisma.wallet.create({
                data: {
                    userId: user.id,
                    label: "imported",
                    address: publicKey,
                    encPrivKey: encryptedKey,
                    isActive: true
                }
            });
            await ctx.reply(`✅ **Wallet Imported**

**Address:** \`${publicKey.slice(0, 8)}...${publicKey.slice(-4)}\`

Ready for payments`, { parse_mode: "Markdown" });
        }
        // Deactivate other wallets
        await prisma_1.prisma.wallet.updateMany({
            where: {
                userId: user.id,
                address: { not: publicKey }
            },
            data: { isActive: false }
        });
        logger_1.logger.info(`Wallet imported for user ${userId}: ${publicKey}`);
    }
    catch (error) {
        logger_1.logger.error("Error importing wallet:", error);
        await ctx.reply("❌ Failed to import wallet. Please check the private key and try again.");
    }
}
async function getWalletBalance(address) {
    try {
        const response = await fetch(env_1.env.RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getTokenAccountsByOwner',
                params: [
                    address,
                    { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
                    { encoding: 'jsonParsed' }
                ]
            })
        });
        const data = await response.json();
        if (data.error) {
            logger_1.logger.error("RPC error getting token accounts:", data.error);
            return null;
        }
        const balances = [];
        // Add SOL balance
        const solResponse = await fetch(env_1.env.RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 2,
                method: 'getBalance',
                params: [address]
            })
        });
        const solData = await solResponse.json();
        if (!solData.error) {
            balances.push({
                mint: "SOL",
                amount: solData.result.value.toString(),
                uiAmount: solData.result.value / 1e9,
                decimals: 9
            });
        }
        // Add token balances
        if (data.result?.value) {
            for (const account of data.result.value) {
                const info = account.account.data.parsed.info;
                if (parseFloat(info.tokenAmount.uiAmountString) > 0) {
                    balances.push({
                        mint: info.mint,
                        amount: info.tokenAmount.amount,
                        uiAmount: parseFloat(info.tokenAmount.uiAmountString),
                        decimals: info.tokenAmount.decimals
                    });
                }
            }
        }
        return balances;
    }
    catch (error) {
        logger_1.logger.error("Error getting wallet balance:", error);
        return null;
    }
}
async function getWalletKeypair(address) {
    try {
        const wallet = await prisma_1.prisma.wallet.findUnique({
            where: { address, isActive: true }
        });
        if (!wallet || !wallet.encPrivKey) {
            return null;
        }
        const privateKeyBytes = decryptPrivateKey(wallet.encPrivKey, env_1.env.MASTER_KMS_KEY);
        return web3_js_1.Keypair.fromSecretKey(privateKeyBytes);
    }
    catch (error) {
        logger_1.logger.error("Error decrypting wallet:", error);
        return null;
    }
}
