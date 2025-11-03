#!/bin/bash

# Email Sorter Docker Setup Script
set -e

echo "🚀 Email Sorter - Docker Setup"
echo "================================"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker Desktop first."
    echo "   Visit: https://www.docker.com/products/docker-desktop"
    exit 1
fi

# Check if Docker Compose is available
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not available. Please install Docker Compose."
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating from template..."
    if [ -f .env.docker ]; then
        cp .env.docker .env
        echo "✅ Created .env from .env.docker template"
        echo ""
        echo "⚠️  IMPORTANT: Please edit .env file and add your:"
        echo "   - SESSION_SECRET (random string)"
        echo "   - ENCRYPTION_KEY (run: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")"
        echo "   - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET"
        echo "   - GOOGLE_TEST_ALLOWED_EMAILS"
        echo "   - OPENAI_API_KEY"
        echo ""
        read -p "Press Enter after you've configured .env file..." 
    else
        echo "❌ .env.docker template not found!"
        exit 1
    fi
else
    echo "✅ .env file exists"
fi

echo ""
echo "Building and starting all services..."
echo "This may take a few minutes on first run..."
echo ""

# Build and start services
docker compose up --build -d

echo ""
echo "⏳ Waiting for services to be healthy..."
echo ""

# Wait for services to be ready
sleep 5

# Check service status
echo "📊 Service Status:"
docker compose ps

echo ""
echo "✅ Setup complete!"
echo ""
echo "🌐 Access the application:"
echo "   - Web App:  http://localhost:5173"
echo "   - API:      http://localhost:4000"
echo ""
echo "📋 Useful commands:"
echo "   - View logs:        docker compose logs -f"
echo "   - Stop services:    docker compose down"
echo "   - Restart services: docker compose restart"
echo ""
echo "📖 For more information, see DOCKER.md"
