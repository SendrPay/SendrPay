# Deployment Guide for Solana Pay Bot

## Deployment Configuration

The bot is now properly configured for deployment with the following fixes applied:

### ✅ Fixed Issues

1. **Proper Application Startup**:
   - Server correctly listens on `0.0.0.0:5000` for external access
   - Environment variable `PORT` is properly used with fallback to 5000
   - Application starts with `npm run build && npm start`

2. **Database Configuration**:
   - PostgreSQL database properly configured via `DATABASE_URL`
   - Prisma schema generation and database push included in startup
   - Database connection validated on startup

3. **Build Process**:
   - Created `start.sh` script for production deployment
   - Proper Prisma client generation before startup
   - TypeScript compilation via tsup for zero-config deployment

4. **Environment Variables**:
   - Core secrets: `BOT_TOKEN`, `TG_SECRET`, `HELIUS_API_KEY`, `MASTER_KMS_KEY`
   - Optional `DEBUG=1` enables polling mode for local development
   - Created `.env.example` with all available configuration options

5. **Health Checks**:
   - `/healthz` endpoint available for deployment monitoring
   - Returns `{ ok: true }` when service is healthy

### Deployment Command

The bot uses this startup command (configured in workflow):
```bash
npm run build && npm start
```

### Required Environment Variables

**Essential**:
- `BOT_TOKEN` - Telegram bot token
- `TG_SECRET` - Secret suffix for Telegram webhook
- `APP_BASE_URL` - Public URL used to configure webhook
- `HELIUS_API_KEY` - Helius RPC API key
- `MASTER_KMS_KEY` - Base64 encryption key for wallet storage
- `DATABASE_URL` - PostgreSQL connection string

**Optional**:
- `DEBUG=1` - Enable polling mode for local development
- `NODE_ENV=production` - Production optimizations
- `OWNER_TELEGRAM_ID` - Bot owner for admin commands

### Verification

Bot is verified working:
- ✅ Server listening on port 5000
- ✅ Health endpoint responding: `GET /healthz`
- ✅ Database connected and schema deployed
- ✅ Telegram bot initialized and ready
- ✅ All core dependencies loaded

The application is deployment-ready for Replit Deployments.
