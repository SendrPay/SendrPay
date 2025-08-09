# Telegram Bot Deployment Instructions

## Post-Deployment Setup

After successfully deploying your bot, you need to configure the webhook with Telegram:

### 1. Get Your Deployed URL
Your deployed application will have a URL like: `https://your-app-name.replit.app`

### 2. Set the Webhook
Run this command in your terminal (replace `YOUR_BOT_TOKEN` and `YOUR_DEPLOYED_URL`):

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
     -d "url=<YOUR_DEPLOYED_URL>/telegram"
```

Example:
```bash
curl -X POST "https://api.telegram.org/bot7071118647:AAG5uWU1O3CcUqlGc6PleJYsY5p6dU9KSu0/setWebhook" \
     -d "url=https://my-solana-bot.replit.app/telegram"
```

### 3. Verify Webhook
Check if webhook is set correctly:
```bash
curl -s "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

### 4. Test the Bot
- Send `/start` to your bot on Telegram
- The bot should respond with the welcome message

## Environment Variables Required for Deployment
- `BOT_TOKEN`: Your Telegram bot token
- `MASTER_KMS_KEY`: 32-byte encryption key (base64)
- `HELIUS_API_KEY`: Your Helius API key
- `OWNER_TELEGRAM_ID`: Your Telegram user ID
- `NODE_ENV`: Should be `production` in deployment

## Troubleshooting
- If bot doesn't respond, check webhook URL is correct and HTTPS
- Verify all environment variables are set in production
- Check deployment logs for errors