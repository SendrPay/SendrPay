# SendrPay (@SendrPayBot)

A production-ready Telegram bot for Solana payments with real blockchain transactions via Helius API on devnet.

## Features

### 🚀 Core Functionality
- **Custodial & Non-Custodial Wallets**: Generate secure wallets or link Phantom
- **Multi-Token Support**: SOL, USDC, BONK, JUP with easy token addition
- **Real Blockchain Transactions**: Actual Solana devnet transfers via Helius
- **Fee System**: Configurable basis points + minimum fees, taken in-kind
- **Escrow System**: Hold funds for users who haven't linked wallets yet
- **Group-First Design**: Setup in DMs, usage in whitelisted groups

### 💸 Payment Commands
- `/pay @user amount TOKEN [note]` - Send tokens to another user
- `/tip amount [TOKEN]` - Tip by replying to a message  
- `/balance` - Check wallet balances with deposit/withdraw options
- `/withdraw amount TOKEN address` - Withdraw to external address


### ⚙️ Administration
- `/enable` - Group admins whitelist the bot
- `/settings` - Configure default token, fees, tipping
- `/admin` - Owner-only commands for token/fee management

### 🔒 Security Features
- **AES-GCM Encryption**: Private keys encrypted at rest
- **Rate Limiting**: Token bucket algorithm prevents abuse
- **Webhook Verification**: HMAC signature validation from Helius
- **Idempotency**: Prevent duplicate transactions
- **Input Validation**: Comprehensive checks on all user inputs

## Setup Instructions

### Prerequisites
- Node.js 18+ 
- Telegram Bot Token from [@BotFather](https://t.me/BotFather)
- Helius API Account (free tier works)
- Base64-encoded 32-byte master key for encryption

### Environment Variables

Create a `.env` file or set these environment variables:

```env
# Required
BOT_TOKEN=your_telegram_bot_token
TG_SECRET=your_telegram_secret
APP_BASE_URL=https://your-app.replit.dev
HELIUS_API_KEY=your_helius_api_key
MASTER_KMS_KEY=base64_encoded_32_byte_key

# Optional
DEBUG=1 # enable polling locally
FEE_TREASURY_SECRET=base58_fee_treasury_private_key
FEE_BPS=50
FEE_MIN_RAW_SOL=5000
OWNER_TELEGRAM_ID=your_telegram_id
SPONSOR_FEES=true
ESCROW_EXPIRY_HOURS=168

```

## Deploy (production)

Set these environment variables in your production environment:

- `BOT_TOKEN` – Telegram bot token
- `TG_SECRET` – secret suffix for webhook URL
- `APP_BASE_URL` – public base URL of your deployment
- `HELIUS_API_KEY` – Helius RPC API key
- `MASTER_KMS_KEY` – base64 encoded 32-byte encryption key
- `DATABASE_URL` – PostgreSQL connection string
- `OWNER_TELEGRAM_ID` – (optional) Telegram ID for admin commands
- `FEE_TREASURY_SECRET` – (optional) private key for fee treasury
- `DEBUG` – set to `1` to enable polling locally

### Build & Start

```bash
npm run build
npx prisma generate
npx prisma db push
npm start
```

### Configure Telegram Webhook

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
     -d "url=<APP_BASE_URL>/telegram/<TG_SECRET>"
```
