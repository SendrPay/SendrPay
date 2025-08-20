#!/bin/bash

# Set production environment
export NODE_ENV=production

# Generate Prisma client and push schema
npx prisma generate
npx prisma db push --skip-generate

# Start the application (both Discord and Telegram bots)
npm run build && npm start

