#!/bin/bash

# Deployment script for Conference CRM
# This script updates the code, clears caches, and restarts the application

echo "🚀 Starting deployment..."

# Step 1: Pull latest code
echo "📥 Pulling latest code from git..."
git pull origin main || git pull origin master

# Step 2: Install dependencies
echo "📦 Installing dependencies..."
cd server
npm install
cd ../client
npm install
cd ..

# Step 3: Clear build cache
echo "🧹 Clearing build cache..."
rm -rf client/build
rm -rf client/node_modules/.cache
rm -rf server/node_modules/.cache

# Step 4: Clear browser cache markers
echo "🔄 Clearing cache markers..."
# This will trigger cache clear in browser on next load
touch client/public/index.html

# Step 5: Restart servers (if using PM2 or similar)
if command -v pm2 &> /dev/null; then
    echo "🔄 Restarting with PM2..."
    pm2 restart all
else
    echo "⚠️  PM2 not found. Please restart servers manually."
    echo "   Backend: cd server && node index.js"
    echo "   Frontend: cd client && npm start"
fi

echo "✅ Deployment complete!"
echo "💡 Users may need to clear browser cache or do a hard refresh (Ctrl+Shift+R)"
