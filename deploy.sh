#!/bin/bash
# Deployment script for Replit Deployments
# This script handles the proper startup sequence for production deployment

echo "🚀 Starting Solana Pay Bot deployment..."

# Set production environment
export NODE_ENV=production

# Generate Prisma client
echo "📦 Generating Prisma client..."
npx prisma generate

# For production, we should use migrations instead of db push
# But since we're on devnet, we can use db push for now
echo "🗄️ Pushing database schema..."
npx prisma db push --skip-generate

# Validate environment
echo "🔧 Validating environment configuration..."
node -e "
const required = ['DATABASE_URL', 'BOT_TOKEN', 'HELIUS_API_KEY', 'MASTER_KMS_KEY'];
const missing = required.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error('❌ Missing required environment variables:', missing.join(', '));
  process.exit(1);
}
console.log('✅ All required environment variables are set');
"

# Start the application
echo "⚡ Building and starting application on port ${PORT:-5000}..."
npm run build && npm start
