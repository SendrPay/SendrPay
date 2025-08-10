#!/bin/bash

echo "=== DEBUGGING BOT CONFLICT ==="
echo "1. Checking bot info..."
curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getMe" | head -c 300
echo ""

echo "2. Checking webhook status..."
curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"
echo ""

echo "3. Force clearing webhook with all options..."
curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook" -d "drop_pending_updates=true"
echo ""

echo "4. Waiting 10 seconds for Telegram cleanup..."
sleep 10

echo "5. Trying to get updates manually (should show 409 if conflict exists)..."
curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?limit=1&timeout=1" | head -c 200
echo ""

echo "=== DEBUG COMPLETE ==="