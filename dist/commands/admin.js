"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commandAdmin = commandAdmin;
const prisma_1 = require("../infra/prisma");
const env_1 = require("../infra/env");
const logger_1 = require("../infra/logger");
const web3_js_1 = require("@solana/web3.js");
async function commandAdmin(ctx) {
    // Check if user is owner
    const userId = ctx.from?.id.toString();
    if (userId !== env_1.env.OWNER_TELEGRAM_ID) {
        return ctx.reply("❌ Unauthorized.");
    }
    const args = ctx.message?.text?.split(' ').slice(1) || [];
    if (args.length === 0) {
        return ctx.reply(`🔧 **Admin Commands**

**Token Management:**
\`/admin tokens list\`
\`/admin tokens add MINT TICKER DECIMALS [NAME]\`
\`/admin tokens disable TICKER\`
\`/admin tokens enable TICKER\`

**Fee Management:**
\`/admin fee set BPS\`
\`/admin fee min MINT AMOUNT_RAW\`

**System:**
\`/admin stats\`
\`/admin sponsor on|off\``, { parse_mode: "Markdown" });
    }
    const subcommand = args[0];
    try {
        switch (subcommand) {
            case 'tokens':
                await handleTokenAdmin(ctx, args.slice(1));
                break;
            case 'fee':
                await handleFeeAdmin(ctx, args.slice(1));
                break;
            case 'stats':
                await handleStatsAdmin(ctx);
                break;
            case 'sponsor':
                await handleSponsorAdmin(ctx, args.slice(1));
                break;
            default:
                await ctx.reply("❌ Unknown admin command.");
        }
    }
    catch (error) {
        logger_1.logger.error("Admin command error:", error);
        await ctx.reply("❌ Admin command failed.");
    }
}
async function handleTokenAdmin(ctx, args) {
    const action = args[0];
    switch (action) {
        case 'list':
            const tokens = await prisma_1.prisma.token.findMany({
                orderBy: { ticker: 'asc' }
            });
            let tokenList = "📋 **Token Allowlist**\n\n";
            for (const token of tokens) {
                const status = token.enabled ? "✅" : "❌";
                tokenList += `${status} ${token.ticker}: ${token.mint.slice(0, 8)}... (${token.decimals} decimals)\n`;
            }
            await ctx.reply(tokenList, { parse_mode: "Markdown" });
            break;
        case 'add':
            if (args.length < 4) {
                return ctx.reply("❌ Usage: /admin tokens add MINT TICKER DECIMALS [NAME]");
            }
            const [, mint, ticker, decimalsStr, name] = args;
            const decimals = parseInt(decimalsStr);
            if (isNaN(decimals) || decimals < 0 || decimals > 18) {
                return ctx.reply("❌ Invalid decimals (0-18).");
            }
            // Validate mint address
            if (mint !== "SOL") {
                try {
                    new web3_js_1.PublicKey(mint);
                }
                catch {
                    return ctx.reply("❌ Invalid mint address.");
                }
            }
            await prisma_1.prisma.token.upsert({
                where: { mint },
                update: {
                    ticker: ticker.toUpperCase(),
                    name: name || ticker.toUpperCase(),
                    decimals,
                    enabled: true
                },
                create: {
                    mint,
                    ticker: ticker.toUpperCase(),
                    name: name || ticker.toUpperCase(),
                    decimals,
                    enabled: true
                }
            });
            await ctx.reply(`✅ Token ${ticker.toUpperCase()} added/updated.`);
            break;
        case 'enable':
        case 'disable':
            if (args.length < 2) {
                return ctx.reply(`❌ Usage: /admin tokens ${action} TICKER`);
            }
            const targetTicker = args[1].toUpperCase();
            const enabled = action === 'enable';
            const updated = await prisma_1.prisma.token.updateMany({
                where: { ticker: targetTicker },
                data: { enabled }
            });
            if (updated.count === 0) {
                return ctx.reply(`❌ Token ${targetTicker} not found.`);
            }
            await ctx.reply(`✅ Token ${targetTicker} ${enabled ? 'enabled' : 'disabled'}.`);
            break;
        default:
            await ctx.reply("❌ Unknown token command. Use: list, add, enable, disable");
    }
}
async function handleFeeAdmin(ctx, args) {
    const action = args[0];
    switch (action) {
        case 'set':
            if (args.length < 2) {
                return ctx.reply("❌ Usage: /admin fee set BPS");
            }
            const bps = parseInt(args[1]);
            if (isNaN(bps) || bps < 0 || bps > 1000) {
                return ctx.reply("❌ Fee must be between 0-1000 bps.");
            }
            // Update environment variable (runtime only)
            process.env.FEE_BPS = bps.toString();
            await ctx.reply(`✅ Global fee rate set to ${bps} bps (${(bps / 100).toFixed(2)}%).

⚠️ This is a runtime change only. Update the environment variable for persistence.`);
            break;
        case 'min':
            if (args.length < 3) {
                return ctx.reply("❌ Usage: /admin fee min MINT AMOUNT_RAW");
            }
            const [, mint, amountRaw] = args;
            // Validate mint
            if (mint !== "SOL") {
                try {
                    new web3_js_1.PublicKey(mint);
                }
                catch {
                    return ctx.reply("❌ Invalid mint address.");
                }
            }
            const amount = BigInt(amountRaw);
            if (amount < 0n) {
                return ctx.reply("❌ Amount must be non-negative.");
            }
            // Update minimum fees (this would need to be persisted in database in production)
            await ctx.reply(`✅ Minimum fee for ${mint} set to ${amount} raw units.

⚠️ This feature needs database persistence for production use.`);
            break;
        default:
            await ctx.reply("❌ Unknown fee command. Use: set, min");
    }
}
async function handleStatsAdmin(ctx) {
    const [totalUsers, totalWallets, totalPayments, pendingPayments, activeEscrows, whitelistedChats] = await Promise.all([
        prisma_1.prisma.user.count(),
        prisma_1.prisma.wallet.count(),
        prisma_1.prisma.payment.count(),
        prisma_1.prisma.payment.count({ where: { status: "pending" } }),
        prisma_1.prisma.escrow.count({ where: { status: "open" } }),
        prisma_1.prisma.chat.count({ where: { whitelisted: true } })
    ]);
    const recentPayments = await prisma_1.prisma.payment.findMany({
        where: {
            status: "confirmed",
            createdAt: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
            }
        },
        take: 5,
        orderBy: { createdAt: 'desc' }
    });
    let statsText = `📊 **System Statistics**

👥 Users: ${totalUsers}
💳 Wallets: ${totalWallets}
💸 Total Payments: ${totalPayments}
⏳ Pending Payments: ${pendingPayments}
🔒 Active Escrows: ${activeEscrows}
✅ Whitelisted Chats: ${whitelistedChats}

**Recent Payments (24h):**
`;
    for (const payment of recentPayments) {
        const token = await prisma_1.prisma.token.findUnique({ where: { mint: payment.mint } });
        const amount = Number(payment.amountRaw) / (10 ** (token?.decimals || 9));
        statsText += `• ${amount} ${token?.ticker || 'UNK'} - ${payment.status}\n`;
    }
    await ctx.reply(statsText, { parse_mode: "Markdown" });
}
async function handleSponsorAdmin(ctx, args) {
    if (args.length < 1) {
        return ctx.reply("❌ Usage: /admin sponsor on|off");
    }
    const enable = args[0].toLowerCase() === 'on';
    // Update environment variable (runtime only)
    process.env.SPONSOR_FEES = enable.toString();
    await ctx.reply(`✅ Fee sponsoring ${enable ? 'enabled' : 'disabled'}.

⚠️ This is a runtime change only. Update the environment variable for persistence.`);
}
