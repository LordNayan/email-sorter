#!/bin/sh
set -e

echo "🔄 Running database migrations..."
cd /app/packages/db
npx prisma migrate deploy

echo "🌱 Seeding database..."
node seed.js

echo "🚀 Starting API server..."
cd /app
pnpm --filter api start
