import { Keypair, PublicKey } from "@solana/web3.js";
import { createCipher, createDecipher, randomBytes } from "crypto";
import { prisma } from "../infra/prisma";
import { env } from "../infra/env";
import { logger } from "../infra/logger";
import type { BotContext } from "../bot";
import bs58 from "bs58";
import { v4 as uuidv4 } from "uuid";

export interface WalletBalance {
  mint: string;
  amount: string;
  uiAmount: number;
  decimals: number;
}

// AES-GCM encryption for wallet keys
export function encryptPrivateKey(privateKeyBytes: Uint8Array, masterKey: string): Buffer {
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(masterKey, 'base64');
  const iv = randomBytes(12); // GCM recommends 96-bit IV
  
  const cipher = createCipher(algorithm, key);
  cipher.setAAD(Buffer.from('solana-wallet'));
  
  let encrypted = cipher.update(Buffer.from(privateKeyBytes));
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  // Return: IV (12) + AuthTag (16) + Encrypted Data
  return Buffer.concat([iv, authTag, encrypted]);
}

export function decryptPrivateKey(encryptedData: Buffer, masterKey: string): Uint8Array {
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(masterKey, 'base64');
  
  // Extract components
  const iv = encryptedData.slice(0, 12);
  const authTag = encryptedData.slice(12, 28);
  const encrypted = encryptedData.slice(28);
  
  const decipher = createDecipher(algorithm, key);
  decipher.setAAD(Buffer.from('solana-wallet'));
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return new Uint8Array(decrypted);
}

export async function generateWallet(ctx: BotContext): Promise<void> {
  try {
    const userId = ctx.from?.id.toString();
    if (!userId) {
      return ctx.reply("❌ Could not identify user.");
    }

    // Create or get user
    const user = await prisma.user.upsert({
      where: { telegramId: userId },
      update: { handle: ctx.from?.username },
      create: {
        telegramId: userId,
        handle: ctx.from?.username
      }
    });

    // Generate new keypair
    const keypair = Keypair.generate();
    const privateKeyBytes = keypair.secretKey;
    const publicKey = keypair.publicKey.toBase58();

    // Encrypt private key
    const encryptedKey = encryptPrivateKey(privateKeyBytes, env.MASTER_KMS_KEY);

    // Save wallet
    await prisma.wallet.create({
      data: {
        userId: user.id,
        label: "custodial",
        address: publicKey,
        encPrivKey: encryptedKey,
        isActive: true
      }
    });

    // Deactivate other wallets for this user
    await prisma.wallet.updateMany({
      where: { 
        userId: user.id,
        address: { not: publicKey }
      },
      data: { isActive: false }
    });

    const warningText = `🔐 **Wallet Generated Successfully!**

Address: \`${publicKey}\`

⚠️ **IMPORTANT - Save Your Private Key:**
\`${bs58.encode(privateKeyBytes)}\`

**This is shown ONLY ONCE. Save it securely!**
• Anyone with this key controls your wallet
• Keep it private and secure
• You can import it later with /import

Use this wallet for payments!`;

    await ctx.reply(warningText, { parse_mode: "Markdown" });

    logger.info(`Wallet generated for user ${userId}: ${publicKey}`);
  } catch (error) {
    logger.error("Error generating wallet:", error);
    await ctx.reply("❌ Failed to generate wallet. Please try again.");
  }
}

export async function importWallet(ctx: BotContext, privateKeyInput: string): Promise<void> {
  try {
    const userId = ctx.from?.id.toString();
    if (!userId) {
      return ctx.reply("❌ Could not identify user.");
    }

    let privateKeyBytes: Uint8Array;

    // Try to parse as base58 or JSON
    try {
      if (privateKeyInput.startsWith('[') && privateKeyInput.endsWith(']')) {
        // JSON format [1,2,3,...]
        const keyArray = JSON.parse(privateKeyInput);
        privateKeyBytes = new Uint8Array(keyArray);
      } else {
        // Base58 format
        privateKeyBytes = bs58.decode(privateKeyInput);
      }

      if (privateKeyBytes.length !== 64) {
        throw new Error("Invalid key length");
      }
    } catch {
      return ctx.reply("❌ Invalid private key format. Use base58 string or JSON array.");
    }

    // Create keypair to validate and get public key
    const keypair = Keypair.fromSecretKey(privateKeyBytes);
    const publicKey = keypair.publicKey.toBase58();

    // Create or get user
    const user = await prisma.user.upsert({
      where: { telegramId: userId },
      update: { handle: ctx.from?.username },
      create: {
        telegramId: userId,
        handle: ctx.from?.username
      }
    });

    // Check if wallet already exists
    const existing = await prisma.wallet.findUnique({
      where: { address: publicKey }
    });

    if (existing) {
      if (existing.userId === user.id) {
        // User re-importing their own wallet
        await prisma.wallet.update({
          where: { address: publicKey },
          data: { isActive: true }
        });

        await ctx.reply(`✅ Wallet re-activated: \`${publicKey}\``, { parse_mode: "Markdown" });
      } else {
        return ctx.reply("❌ This wallet is already imported by another user.");
      }
    } else {
      // Encrypt and save new wallet
      const encryptedKey = encryptPrivateKey(privateKeyBytes, env.MASTER_KMS_KEY);

      await prisma.wallet.create({
        data: {
          userId: user.id,
          label: "imported",
          address: publicKey,
          encPrivKey: encryptedKey,
          isActive: true
        }
      });

      await ctx.reply(`✅ **Wallet Imported Successfully!**

Address: \`${publicKey}\`

The wallet is now active for payments.`, { parse_mode: "Markdown" });
    }

    // Deactivate other wallets
    await prisma.wallet.updateMany({
      where: { 
        userId: user.id,
        address: { not: publicKey }
      },
      data: { isActive: false }
    });

    logger.info(`Wallet imported for user ${userId}: ${publicKey}`);
  } catch (error) {
    logger.error("Error importing wallet:", error);
    await ctx.reply("❌ Failed to import wallet. Please check the private key and try again.");
  }
}



export async function getWalletBalance(address: string): Promise<WalletBalance[] | null> {
  try {
    const response = await fetch(env.RPC_URL, {
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
      logger.error("RPC error getting token accounts:", data.error);
      return null;
    }

    const balances: WalletBalance[] = [];

    // Add SOL balance
    const solResponse = await fetch(env.RPC_URL, {
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
  } catch (error) {
    logger.error("Error getting wallet balance:", error);
    return null;
  }
}

export async function getWalletKeypair(address: string): Promise<Keypair | null> {
  try {
    const wallet = await prisma.wallet.findUnique({
      where: { address, isActive: true }
    });

    if (!wallet || !wallet.encPrivKey) {
      return null;
    }

    const privateKeyBytes = decryptPrivateKey(wallet.encPrivKey, env.MASTER_KMS_KEY);
    return Keypair.fromSecretKey(privateKeyBytes);
  } catch (error) {
    logger.error("Error decrypting wallet:", error);
    return null;
  }
}
