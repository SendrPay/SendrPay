"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commandWithdraw = commandWithdraw;
const prisma_1 = require("../infra/prisma");
const wallets_1 = require("../core/wallets");
const tokens_1 = require("../core/tokens");
const transfer_1 = require("../core/transfer");
const parse_1 = require("../core/parse");
const logger_1 = require("../infra/logger");
const web3_js_1 = require("@solana/web3.js");
async function commandWithdraw(ctx) {
    if (ctx.chat?.type !== "private") {
        return ctx.reply("❌ Withdrawals only work in DM for security.");
    }
    try {
        const parsed = (0, parse_1.parseWithdrawCommand)(ctx);
        if (!parsed) {
            return ctx.reply("❌ Usage: /withdraw amount TOKEN to_address");
        }
        const { amount, tokenTicker, toAddress } = parsed;
        // Validate destination address
        try {
            new web3_js_1.PublicKey(toAddress);
        }
        catch {
            return ctx.reply("❌ Invalid Solana address.");
        }
        // Get user wallet
        const userId = ctx.from?.id.toString();
        if (!userId) {
            return ctx.reply("❌ Could not identify user.");
        }
        const user = await prisma_1.prisma.user.findUnique({
            where: { telegramId: userId },
            include: { wallets: { where: { isActive: true } } }
        });
        if (!user || !user.wallets[0]) {
            return ctx.reply("❌ You need to create a wallet first. Use /start.");
        }
        const wallet = user.wallets[0];
        // Resolve token
        const token = await (0, tokens_1.resolveToken)(tokenTicker);
        if (!token) {
            return ctx.reply(`❌ Unknown token: ${tokenTicker}`);
        }
        // Convert amount to raw units
        const amountRaw = BigInt(Math.floor(amount * (10 ** token.decimals)));
        if (amountRaw <= 0n) {
            return ctx.reply("❌ Amount must be positive.");
        }
        // Check balance
        const balances = await (0, wallets_1.getWalletBalance)(wallet.address);
        const tokenBalance = balances?.find(b => b.mint === token.mint || (token.mint === "SOL" && b.mint === "So11111111111111111111111111111111111111112"));
        if (!tokenBalance || BigInt(tokenBalance.amount) < amountRaw) {
            return ctx.reply(`❌ Insufficient ${token.ticker} balance.`);
        }
        // No fees for withdrawals (user pays network fees only)
        const result = await (0, transfer_1.executeTransfer)({
            fromWallet: wallet,
            toAddress,
            mint: token.mint,
            amountRaw,
            feeRaw: 0n, // No protocol fees for withdrawals
            token,
            isWithdrawal: true
        });
        if (result.success) {
            const receipt = `✅ **Withdrawal Sent**

**Amount:** ${amount} ${token.ticker}
**To:** \`${toAddress.slice(0, 8)}...${toAddress.slice(-4)}\`

[View Transaction](https://explorer.solana.com/tx/${result.signature}?cluster=devnet)`;
            await ctx.reply(receipt, { parse_mode: "Markdown" });
            logger_1.logger.info(`Withdrawal completed: ${result.signature}`);
        }
        else {
            await ctx.reply(`❌ Withdrawal failed: ${result.error}`);
        }
    }
    catch (error) {
        logger_1.logger.error("Withdraw command error:", error);
        await ctx.reply("❌ Withdrawal failed. Please try again.");
    }
}
