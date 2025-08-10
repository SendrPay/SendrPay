import { BotContext } from "../bot";
import { prisma } from "../infra/prisma";
import { logger } from "../infra/logger";

export async function commandDeposit(ctx: BotContext) {
  const chat = ctx.chat;
  if (!chat) {
    return ctx.reply("❌ Could not identify chat.");
  }

  const userId = ctx.from?.id.toString();
  if (!userId) {
    return ctx.reply("❌ Could not identify user.");
  }

  logger.info("Deposit command received");

  try {
    // Get user wallet
    const user = await prisma.user.findUnique({
      where: { telegramId: userId },
      include: { wallets: { where: { isActive: true } } }
    });

    if (!user || !user.wallets[0]) {
      return ctx.reply("❌ You need to create a wallet first. Use /start to set up your wallet.");
    }

    const wallet = user.wallets[0];
    
    // Format wallet address for easy copying
    const walletAddress = wallet.address;
    const shortAddress = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-6)}`;
    
    const depositMessage = `💰 **Your SendrPay Wallet**

**Wallet Address:**
\`${walletAddress}\`

**Send any supported token to this address:**
• SOL (Solana)
• USDC (USD Coin)
• BONK (Bonk)  
• JUP (Jupiter)

**Important Notes:**
⚠️ Only send tokens on Solana devnet
⚠️ Do not send mainnet tokens - they will be lost
⚠️ Ensure you're using the correct network

**How to Send:**
1. Copy the address above
2. Use any Solana wallet (Phantom, Solflare, etc.)
3. Send tokens to this address
4. Check /balance to see your funds

**Need Test Tokens?**
Visit Solana Faucet for free devnet SOL:
https://faucet.solana.com

*Your wallet: ${shortAddress}*`;

    await ctx.reply(depositMessage, { parse_mode: "Markdown" });
    
  } catch (error) {
    logger.error("Deposit command error:", error);
    await ctx.reply("❌ Failed to get deposit information. Please try again.");
  }
}