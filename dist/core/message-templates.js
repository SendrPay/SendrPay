"use strict";
// SendrPay Message Templates
// Standardized notification system for all bot interactions
Object.defineProperty(exports, "__esModule", { value: true });
exports.messages = void 0;
exports.formatTimestamp = formatTimestamp;
exports.formatExplorerLink = formatExplorerLink;
exports.formatBalanceList = formatBalanceList;
exports.formatTransactionList = formatTransactionList;
exports.messages = {
    group: {
        payment_sent: (data) => `✅ @${data.sender} sent ${data.amount} ${data.token} to @${data.recipient} — Transaction confirmed.`,
        payment_notification: (data) => `💸 @${data.recipient}, you just received ${data.amount} ${data.token} from @${data.sender} via SendrPay.`,
        tip_sent: (data) => `🎁 @${data.sender} tipped @${data.recipient} ${data.amount} ${data.token} via SendrPay!`,
        payment_failed_insufficient: (data) => `⚠️ @${data.sender}, your payment to @${data.recipient} failed — Insufficient funds.`,
        payment_failed_unsupported_token: (data) => `⚠️ @${data.sender}, token ${data.token} is not supported.`,
        payment_failed_no_wallet: (data) => `⚠️ @${data.recipient} hasn't set up a wallet yet. DM @SendrPayBot and run /start to begin.`
    },
    dm: {
        payment_sent: (data) => `💸 **Payment Sent**

**Amount:** ${data.amount} ${data.token}
**To:** @${data.recipient}
**Fee:** ${data.fee} ${data.token}
**Net Sent:** ${data.net} ${data.token}
**Time:** ${data.timestamp}
**Transaction:** ${data.explorer_link}
**Wallet Balance:** ${data.balance}`,
        payment_received: (data) => `🎉 **Payment Received**

**Amount:** ${data.amount} ${data.token}
**From:** @${data.sender}
**Time:** ${data.timestamp}
**Transaction:** ${data.explorer_link}
**Wallet Balance:** ${data.balance}`,
        tip_sent: (data) => `👍 **Tip Sent**

**Amount:** ${data.amount} ${data.token}
**To:** @${data.recipient}
**Fee:** ${data.fee} ${data.token}
**Net Sent:** ${data.net} ${data.token}
**Time:** ${data.timestamp}
**Transaction:** ${data.explorer_link}
**Wallet Balance:** ${data.balance}`,
        tip_received: (data) => `💰 **Tip Received**

**Amount:** ${data.amount} ${data.token}
**From:** @${data.sender}
**Time:** ${data.timestamp}
**Transaction:** ${data.explorer_link}
**Wallet Balance:** ${data.balance}`,
        deposit_address: (data) => `📥 **Deposit Address**

**Token:** ${data.token}
**Address:** ${data.address}`,
        withdrawal_sent: (data) => `✅ **Withdrawal Sent**

**Amount:** ${data.amount} ${data.token}
**To:** ${data.address}
**Fee:** ${data.fee} ${data.token}
**Net Sent:** ${data.net} ${data.token}
**Time:** ${data.timestamp}
**Transaction:** ${data.explorer_link}
**Wallet Balance:** ${data.balance}`,
        balance_display: (data) => `**Your Balances**

${data.balance}`,
        transaction_history: (data) => `**Recent Transactions**

${data.balance}`, // Reusing balance field for transaction list
        payment_failed_insufficient: (data) => `⚠️ **Payment Failed — Insufficient Funds**

**Amount:** ${data.amount} ${data.token}
**Wallet Balance:** ${data.balance}
Top up to complete this payment.`,
        payment_failed_unsupported_token: (data) => `⚠️ **Payment Failed — Unsupported token "${data.token}"**

**Supported tokens:** SOL, USDC, BONK, JUP`,
        recipient_no_wallet: (data) => `💬 You've been sent crypto with SendrPay — but you don't have a wallet yet. Run /start to generate one or connect your own.`,
        payment_confirmation: (data) => `💸 **SendrPay Payment Confirmation**

**To:** ${data.recipient}
**Amount:** ${data.amount} ${data.token}
${data.note ? `**Note:** ${data.note}\n` : ''}**Network Fee:** ${data.network_fee}
**Service Fee:** ${data.service_fee}

**Total:** ${data.total}

Ready to send this payment?`,
        payment_sent_confirmation: (data) => `✅ **Payment Sent**

**Amount:** ${data.amount} ${data.token}
**To:** ${data.recipient}
**Transaction:** ${data.explorer_link}

Payment completed successfully!`,
        tip_confirmation: (data) => `💰 **Confirm Tip**

**To:** ${data.recipient}
**Amount:** ${data.amount} ${data.token}
${data.note ? `**Note:** ${data.note}\n` : ''}**Network Fee:** ${data.network_fee}
**Service Fee:** ${data.service_fee}

**Total:** ${data.total}

Proceed with this tip?`,
        tip_sent_confirmation: (data) => `✨ **Tip Sent Successfully!**

**Amount:** ${data.amount} ${data.token}
**To:** ${data.recipient}
**Transaction:** ${data.explorer_link}

Tip completed successfully!`
    }
};
// Helper function to format timestamps
function formatTimestamp(date = new Date()) {
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}
// Helper function to format Solana Explorer links
function formatExplorerLink(signature) {
    return `[View Transaction](https://explorer.solana.com/tx/${signature}?cluster=devnet)`;
}
// Helper function to format token balances
function formatBalanceList(balances) {
    return balances.map(b => `**${b.token}:** ${b.amount}`).join('\n');
}
// Helper function to format transaction history
function formatTransactionList(transactions) {
    return transactions.map((tx, index) => `${index + 1}. ${tx.type} ${tx.amount} ${tx.token} ${tx.type === 'Sent' ? 'to' : 'from'} ${tx.counterpart} — ${tx.timestamp}`).join('\n');
}
