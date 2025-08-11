"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatReceipt = formatReceipt;
exports.formatSimpleReceipt = formatSimpleReceipt;
exports.formatBalanceDisplay = formatBalanceDisplay;
exports.formatFeeBreakdown = formatFeeBreakdown;
exports.formatEscrowNotification = formatEscrowNotification;
exports.formatTransactionError = formatTransactionError;
exports.formatWalletInfo = formatWalletInfo;
exports.formatSettingsDisplay = formatSettingsDisplay;
exports.formatConfirmationPrompt = formatConfirmationPrompt;
exports.formatSystemStats = formatSystemStats;
const env_1 = require("../infra/env");
function formatReceipt(params) {
    const { from, to, gross, fee, net, token, signature, note, type = 'payment' } = params;
    const emoji = getReceiptEmoji(type);
    const title = getReceiptTitle(type);
    let receipt = `**From:** ${from}\n`;
    receipt += `**To:** ${to}\n`;
    receipt += `**Amount:** ${formatAmount(net)} ${token}\n`;
    if (fee > 0) {
        receipt += `**Network Fee:** ${formatAmount(fee)} ${token}\n`;
    }
    if (note) {
        receipt += `**Note:** ${note}\n`;
    }
    if (signature) {
        receipt += `\n[View Transaction](https://explorer.solana.com/tx/${signature}?cluster=devnet)`;
    }
    return receipt;
}
function formatSimpleReceipt(amount, token, from, to, signature) {
    let receipt = `✅ **Transfer Complete**\n\n`;
    receipt += `${formatAmount(amount)} ${token}\n`;
    receipt += `${from} → ${to}\n`;
    if (signature) {
        receipt += `\n[View Transaction](https://explorer.solana.com/tx/${signature}?cluster=devnet)`;
    }
    return receipt;
}
function formatBalanceDisplay(balances, walletAddress) {
    let display = `💰 **Your Balance**\n\n`;
    display += `Wallet: \`${walletAddress.slice(0, 8)}...\`\n\n`;
    if (balances.length === 0) {
        display += `No tokens found.\n\nDeposit tokens to get started!`;
        return display;
    }
    balances.sort((a, b) => b.amount - a.amount); // Sort by amount desc
    for (const balance of balances.slice(0, 10)) { // Show top 10
        const token = balance.token || balance.mint.slice(0, 4);
        display += `${token}: ${formatAmount(balance.amount)}\n`;
    }
    if (balances.length > 10) {
        display += `\n... and ${balances.length - 10} more tokens`;
    }
    return display;
}
function formatFeeBreakdown(grossAmount, feeAmount, netAmount, ticker, feeBps) {
    const feePercentage = (feeBps / 100).toFixed(2);
    return `💸 **Fee Breakdown**

Gross Amount: ${formatAmount(grossAmount)} ${ticker}
Fee (${feePercentage}%): ${formatAmount(feeAmount)} ${ticker}
Net Amount: ${formatAmount(netAmount)} ${ticker}`;
}
function formatEscrowNotification(amount, token, payeeHandle, claimUrl, expiresAt) {
    const expiryDate = expiresAt.toLocaleDateString();
    return `💰 **Payment Escrowed**

Amount: ${formatAmount(amount)} ${token}
For: @${payeeHandle}

The recipient needs to:
1. Start @${process.env.BOT_USERNAME || 'SolanaPayBot'}
2. Create or link a wallet
3. Claim the payment

Expires: ${expiryDate}
[Claim Link](${claimUrl})`;
}
function formatTransactionError(error, operation) {
    return `❌ **${operation} Failed**

Error: ${error}

This usually happens due to:
• Insufficient balance
• Network congestion  
• Invalid recipient
• Rate limiting

Please check your balance and try again.`;
}
function formatWalletInfo(address, label, isActive = true) {
    const status = isActive ? "✅ Active" : "⏸️ Inactive";
    return `🔐 **Wallet Info**

Address: \`${address}\`
Type: ${label}
Status: ${status}

[View on Explorer](https://explorer.solana.com/address/${address}?cluster=devnet)
[Generate QR Code](${env_1.env.APP_BASE_URL}/qr/${address})`;
}
function formatSettingsDisplay(defaultToken, feeBps, tippingEnabled, chatType) {
    return `⚙️ **Chat Settings**

Default Token: ${defaultToken}
Fee Rate: ${feeBps} bps (${(feeBps / 100).toFixed(2)}%)
Tipping: ${tippingEnabled ? "Enabled" : "Disabled"}
Chat Type: ${chatType}

**Available Commands:**
\`/settings defaulttoken TOKEN\`
\`/settings fee RATE_BPS\`
\`/settings tipping on|off\``;
}
function formatAmount(amount, maxDecimals = 6) {
    if (amount === 0)
        return "0";
    // For very small amounts, show more decimals
    if (amount < 0.001) {
        return amount.toFixed(8).replace(/\.?0+$/, '');
    }
    // For normal amounts, use standard formatting
    return amount.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: Math.min(maxDecimals, 6)
    });
}
function getReceiptEmoji(type) {
    switch (type) {
        case 'tip': return '🎉';
        case 'withdrawal': return '📤';
        default: return '✅';
    }
}
function getReceiptTitle(type) {
    switch (type) {
        case 'tip': return 'Tip Sent';
        case 'withdrawal': return 'Withdrawal';
        default: return 'Payment';
    }
}
function formatConfirmationPrompt(amount, token, recipient, fee) {
    return `🔍 **Confirm Transaction**

Send: ${formatAmount(amount)} ${token}
To: ${recipient}
Fee: ${formatAmount(fee)} ${token}
Net: ${formatAmount(amount - fee)} ${token}

React with ✅ to confirm or ❌ to cancel
(30 second timeout)`;
}
function formatSystemStats(stats) {
    return `📊 **System Statistics**

👥 Total Users: ${stats.totalUsers.toLocaleString()}
💸 Total Payments: ${stats.totalPayments.toLocaleString()}
📈 Volume: ${formatAmount(stats.totalVolume)} SOL
🔒 Active Escrows: ${stats.activeEscrows}
✅ Whitelisted Chats: ${stats.whitelistedChats}`;
}
