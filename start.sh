#!/bin/bash
# Production start script for Solana Pay Bot

echo "🚀 Starting Solana Pay Bot production deployment..."

# Generate Prisma client
echo "📦 Generating Prisma client..."
npx prisma generate

# Push database schema (development - for production, use migrations)
if [ "$NODE_ENV" != "production" ]; then
  echo "🗄️  Pushing database schema..."
  npx prisma db push
fi

# Start the application
echo "⚡ Starting application..."
npx tsx src/index.ts