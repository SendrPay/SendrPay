// SendrPay Message Templates
// Standardized notification system for all bot interactions

export interface MessageData {
  amount?: string;
  token?: string;
  sender?: string;
  recipient?: string;
  fee?: string;
  net?: string;
  timestamp?: string;
  explorer_link?: string;
  balance?: string;
  address?: string;
  error?: string;
}

export const messages = {
  group: {
    payment_sent: (data: MessageData) => 
      `✅ @${data.sender} sent ${data.amount} ${data.token} to @${data.recipient} — Transaction confirmed.`,
    
    payment_notification: (data: MessageData) => 
      `💸 @${data.recipient}, you just received ${data.amount} ${data.token} from @${data.sender} via SendrPay.`,
    
    tip_sent: (data: MessageData) => 
      `🎁 @${data.sender} tipped @${data.recipient} ${data.amount} ${data.token} via SendrPay!`,
    
    payment_failed_insufficient: (data: MessageData) => 
      `⚠️ @${data.sender}, your payment to @${data.recipient} failed — Insufficient funds.`,
    
    payment_failed_unsupported_token: (data: MessageData) => 
      `⚠️ @${data.sender}, token ${data.token} is not supported.`,
    
    payment_failed_no_wallet: (data: MessageData) => 
      `⚠️ @${data.recipient} hasn't set up a wallet yet. DM @SendrPayBot and run /start to begin.`
  },

  dm: {
    payment_sent: (data: MessageData) => 
      `💸 **Payment Sent**

**Amount:** ${data.amount} ${data.token}
**To:** @${data.recipient}
**Fee:** ${data.fee} ${data.token}
**Net Sent:** ${data.net} ${data.token}
**Time:** ${data.timestamp}
**Transaction:** ${data.explorer_link}
**Wallet Balance:** ${data.balance}`,

    payment_received: (data: MessageData) => 
      `🎉 **Payment Received**

**Amount:** ${data.amount} ${data.token}
**From:** @${data.sender}
**Time:** ${data.timestamp}
**Transaction:** ${data.explorer_link}
**Wallet Balance:** ${data.balance}`,

    tip_sent: (data: MessageData) => 
      `👍 **Tip Sent**

**Amount:** ${data.amount} ${data.token}
**To:** @${data.recipient}
**Fee:** ${data.fee} ${data.token}
**Net Sent:** ${data.net} ${data.token}
**Time:** ${data.timestamp}
**Transaction:** ${data.explorer_link}
**Wallet Balance:** ${data.balance}`,

    tip_received: (data: MessageData) => 
      `💰 **Tip Received**

**Amount:** ${data.amount} ${data.token}
**From:** @${data.sender}
**Time:** ${data.timestamp}
**Transaction:** ${data.explorer_link}
**Wallet Balance:** ${data.balance}`,

    deposit_address: (data: MessageData) => 
      `📥 **Deposit Address**

**Token:** ${data.token}
**Address:** ${data.address}`,

    withdrawal_sent: (data: MessageData) => 
      `✅ **Withdrawal Sent**

**Amount:** ${data.amount} ${data.token}
**To:** ${data.address}
**Fee:** ${data.fee} ${data.token}
**Net Sent:** ${data.net} ${data.token}
**Time:** ${data.timestamp}
**Transaction:** ${data.explorer_link}
**Wallet Balance:** ${data.balance}`,

    balance_display: (data: MessageData) => 
      `**Your Balances**

${data.balance}`,

    transaction_history: (data: MessageData) => 
      `**Recent Transactions**

${data.balance}`, // Reusing balance field for transaction list

    payment_failed_insufficient: (data: MessageData) => 
      `⚠️ **Payment Failed — Insufficient Funds**

**Amount:** ${data.amount} ${data.token}
**Wallet Balance:** ${data.balance}
Top up to complete this payment.`,

    payment_failed_unsupported_token: (data: MessageData) => 
      `⚠️ **Payment Failed — Unsupported token "${data.token}"**

**Supported tokens:** SOL, USDC, BONK, JUP`,

    recipient_no_wallet: (data: MessageData) => 
      `💬 You've been sent crypto with SendrPay — but you don't have a wallet yet. Run /start to generate one or connect your own.`
  }
};

// Helper function to format timestamps
export function formatTimestamp(date: Date = new Date()): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

// Helper function to format Solana Explorer links
export function formatExplorerLink(signature: string): string {
  return `[View Transaction](https://explorer.solana.com/tx/${signature}?cluster=devnet)`;
}

// Helper function to format token balances
export function formatBalanceList(balances: Array<{token: string, amount: string}>): string {
  return balances.map(b => `**${b.token}:** ${b.amount}`).join('\n');
}

// Helper function to format transaction history
export function formatTransactionList(transactions: Array<{type: string, amount: string, token: string, counterpart: string, timestamp: string}>): string {
  return transactions.map((tx, index) => 
    `${index + 1}. ${tx.type} ${tx.amount} ${tx.token} ${tx.type === 'Sent' ? 'to' : 'from'} ${tx.counterpart} — ${tx.timestamp}`
  ).join('\n');
}