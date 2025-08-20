# SendrPay Deployment Guide

## Quick Deployment (Recommended)

1. **Use the Combined Deploy Workflow**
   - The `Combined Deploy` workflow runs both Discord and Telegram bots in a single process
   - This ensures both bots stay online when deployed on Replit

2. **Deploy on Replit**
   - Click the "Deploy" button in your Replit workspace
   - Select **Reserved VM Deployment** for best performance and reliability
   - The deployment will automatically use the Combined Deploy workflow

## Architecture

### Production Setup
- **Single Process**: Both bots run in `src/combined.ts` 
- **Keep-Alive**: Self-ping every 25 minutes prevents 30-minute timeout
- **Robust Connection**: Discord bot includes reconnection logic and error handling
- **Webhook Mode**: Telegram uses webhooks (not polling) in production

### Connection Monitoring
The Discord bot includes:
- Automatic reconnection on disconnects
- Status monitoring every minute
- Graceful error handling that doesn't crash the app
- Debug logging for connection issues

## Troubleshooting

### Discord Bot Goes Offline
If Discord bot still disconnects:
1. Check logs for "Discord bot error" messages
2. Verify `DISCORD_TOKEN` is valid
3. Ensure no rate limiting issues
4. Check Discord bot permissions in server

### Both Bots Offline
If entire app goes offline:
1. Check deployment logs for process crashes
2. Verify environment variables are set
3. Use Reserved VM Deployment for stability
4. Check database connectivity

## Monitoring

### Health Check
Access `/healthz` endpoint to verify both bots:
```json
{
  "ok": true
}
```

### Log Monitoring
Watch for these key messages:
- `✅ Discord bot started successfully`
- `✅ Telegram webhook set to: [URL]`
- `✅ Combined application started - both bots active`

## Environment Variables

Required for deployment:
- `DISCORD_TOKEN` - Discord bot token
- `BOT_TOKEN` - Telegram bot token
- `TG_SECRET` - Secret suffix for Telegram webhook
- `APP_BASE_URL` - Public base URL for webhook configuration
- `MASTER_KMS_KEY` - Wallet encryption key
- `HELIUS_API_KEY` - Solana RPC access
- `DATABASE_URL` - PostgreSQL connection

Optional:
- `DEBUG=1` - Enable polling mode for local development
- `PORT=5000` - Server port (defaults to 5000)
- `NODE_ENV=production` - Production optimizations

The deployment will automatically set `PUBLIC_URL` or use `REPL_URL` for webhooks.