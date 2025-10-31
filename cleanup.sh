#!/bin/bash

echo "🧹 Cleaning up Email Sorter..."

# Stop and remove Docker containers
echo "🐳 Stopping Docker services..."
docker-compose down -v

# Remove node_modules
echo "📦 Removing node_modules..."
rm -rf node_modules
rm -rf apps/*/node_modules
rm -rf packages/*/node_modules

# Remove build artifacts
echo "🗑️  Removing build artifacts..."
rm -rf apps/*/dist
rm -rf apps/web/build
rm -rf test-results
rm -rf playwright-report

# Remove lock files
echo "🔒 Removing lock files..."
rm -f pnpm-lock.yaml

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "To start fresh, run:"
echo "  ./setup.sh"
