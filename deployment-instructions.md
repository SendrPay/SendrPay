# Telegram Bot Deployment Instructions

## Post-Deployment Setup

After successfully deploying your bot, you need to configure the webhook with Telegram:

### 1. Get Your Deployed URL
Your deployed application will have a URL like: `https://your-app-name.replit.app`

### 2. Set the Webhook
Run this command in your terminal (replace `YOUR_BOT_TOKEN`, `TG_SECRET` and `YOUR_DEPLOYED_URL`):

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
     -d "url=<YOUR_DEPLOYED_URL>/telegram/<TG_SECRET>"
```

Example:
```bash
curl -X POST "https://api.telegram.org/bot7071118647:AAG5uWU1O3CcUqlGc6PleJYsY5p6dU9KSu0/setWebhook" \
     -d "url=https://my-solana-bot.replit.app/telegram/<TG_SECRET>"
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
- `TG_SECRET`: Secret suffix for webhook URL
- `APP_BASE_URL`: Public URL of your deployment
- `HELIUS_API_KEY`: Your Helius API key
- `MASTER_KMS_KEY`: 32-byte encryption key (base64)
- `DEBUG` (optional): Set to `1` to enable polling locally
- `PORT=5000` (optional): Server port
- `NODE_ENV=production` (optional): Production optimizations

## Troubleshooting
- If bot doesn't respond, check webhook URL is correct and HTTPS
- Verify all environment variables are set in production
- Check deployment logs for errors