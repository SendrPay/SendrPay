import { env } from "../infra/env";

export interface ReceiptParams {
  from: string;
  to: string;
  gross: number;
  fee: number;
  net: number;
  token: string;
  signature?: string;
  note?: string;
  type?: 'payment' | 'tip' | 'split' | 'giveaway' | 'withdrawal';
}

export function formatReceipt(params: ReceiptParams): string {
  const {
    from,
    to,
    gross,
    fee,
    net,
    token,
    signature,
    note,
    type = 'payment'
  } = params;

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

export function formatSimpleReceipt(
  amount: number,
  token: string,
  from: string,
  to: string,
  signature?: string
): string {
  let receipt = `✅ **Transfer Complete**\n\n`;
  receipt += `${formatAmount(amount)} ${token}\n`;
  receipt += `${from} → ${to}\n`;

  if (signature) {
    receipt += `\n[View Transaction](https://explorer.solana.com/tx/${signature}?cluster=devnet)`;
  }

  return receipt;
}

export function formatBalanceDisplay(
  balances: Array<{ mint: string; amount: number; token?: string }>,
  walletAddress: string
): string {
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

export function formatFeeBreakdown(
  grossAmount: number,
  feeAmount: number,
  netAmount: number,
  ticker: string,
  feeBps: number
): string {
  const feePercentage = (feeBps / 100).toFixed(2);

  return `💸 **Fee Breakdown**

Gross Amount: ${formatAmount(grossAmount)} ${ticker}
Fee (${feePercentage}%): ${formatAmount(feeAmount)} ${ticker}
Net Amount: ${formatAmount(netAmount)} ${ticker}`;
}

export function formatEscrowNotification(
  amount: number,
  token: string,
  payeeHandle: string,
  claimUrl: string,
  expiresAt: Date
): string {
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

export function formatGiveawayAnnouncement(
  amount: number,
  token: string,
  description: string,
  host: string,
  participantCount: number = 0
): string {
  return `🎁 **GIVEAWAY STARTED!**

Prize: ${formatAmount(amount)} ${token}
Description: ${description}
Host: ${host}

Participants: ${participantCount}

Click the button below to enter!`;
}

export function formatGiveawayResults(
  winners: Array<{ handle: string; amount: number }>,
  token: string,
  totalParticipants: number
): string {
  let results = `🎉 **GIVEAWAY RESULTS**\n\n`;
  
  if (winners.length > 0) {
    results += `🏆 **Winners:**\n`;
    for (const winner of winners) {
      results += `@${winner.handle}: ${formatAmount(winner.amount)} ${token}\n`;
    }
  }

  results += `\nTotal participants: ${totalParticipants}`;
  
  return results;
}

export function formatTransactionError(error: string, operation: string): string {
  return `❌ **${operation} Failed**

Error: ${error}

This usually happens due to:
• Insufficient balance
• Network congestion  
• Invalid recipient
• Rate limiting

Please check your balance and try again.`;
}

export function formatWalletInfo(
  address: string,
  label: string,
  isActive: boolean = true
): string {
  const status = isActive ? "✅ Active" : "⏸️ Inactive";
  
  return `🔐 **Wallet Info**

Address: \`${address}\`
Type: ${label}
Status: ${status}

[View on Explorer](https://explorer.solana.com/address/${address}?cluster=devnet)
[Generate QR Code](${env.APP_BASE_URL}/qr/${address})`;
}

export function formatSettingsDisplay(
  defaultToken: string,
  feeBps: number,
  tippingEnabled: boolean,
  chatType: string
): string {
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

function formatAmount(amount: number, maxDecimals: number = 6): string {
  if (amount === 0) return "0";
  
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

function getReceiptEmoji(type: string): string {
  switch (type) {
    case 'tip': return '🎉';
    case 'split': return '💰';
    case 'giveaway': return '🎁';
    case 'withdrawal': return '📤';
    default: return '✅';
  }
}

function getReceiptTitle(type: string): string {
  switch (type) {
    case 'tip': return 'Tip Sent';
    case 'split': return 'Split Payment';
    case 'giveaway': return 'Giveaway Payout';
    case 'withdrawal': return 'Withdrawal';
    default: return 'Payment';
  }
}

export function formatConfirmationPrompt(
  amount: number,
  token: string,
  recipient: string,
  fee: number
): string {
  return `🔍 **Confirm Transaction**

Send: ${formatAmount(amount)} ${token}
To: ${recipient}
Fee: ${formatAmount(fee)} ${token}
Net: ${formatAmount(amount - fee)} ${token}

React with ✅ to confirm or ❌ to cancel
(30 second timeout)`;
}

export function formatSystemStats(stats: {
  totalUsers: number;
  totalPayments: number;
  totalVolume: number;
  activeEscrows: number;
  whitelistedChats: number;
}): string {
  return `📊 **System Statistics**

👥 Total Users: ${stats.totalUsers.toLocaleString()}
💸 Total Payments: ${stats.totalPayments.toLocaleString()}
📈 Volume: ${formatAmount(stats.totalVolume)} SOL
🔒 Active Escrows: ${stats.activeEscrows}
✅ Whitelisted Chats: ${stats.whitelistedChats}`;
}
