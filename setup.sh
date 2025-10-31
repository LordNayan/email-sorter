#!/bin/bash

echo "🚀 Setting up Email Sorter..."

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is not installed. Please install it first:"
    echo "   npm install -g pnpm"
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Start Docker services
echo "🐳 Starting Docker services (PostgreSQL & Redis)..."
docker-compose up -d

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 5

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    
    # Generate encryption key
    ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    
    # Update .env with generated key
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/ENCRYPTION_KEY=/ENCRYPTION_KEY=$ENCRYPTION_KEY/" .env
    else
        sed -i "s/ENCRYPTION_KEY=/ENCRYPTION_KEY=$ENCRYPTION_KEY/" .env
    fi
    
    echo "✅ .env file created with generated encryption key"
    echo ""
    echo "⚠️  IMPORTANT: Please edit .env and add:"
    echo "   - GOOGLE_CLIENT_ID"
    echo "   - GOOGLE_CLIENT_SECRET"
    echo "   - GOOGLE_TEST_ALLOWED_EMAILS"
    echo "   - OPENAI_API_KEY"
    echo ""
else
    echo "✅ .env file already exists"
fi

# Generate Prisma Client first
echo "🔧 Generating Prisma Client..."
cd packages/db && npx prisma generate && cd ../..

# Run Prisma migrations
echo "🗄️  Running database migrations..."
cd packages/db && npx prisma migrate dev --name init && cd ../..

# Seed database
echo "🌱 Seeding database..."
pnpm db:seed

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your API keys (Google OAuth & OpenAI)"
echo "2. Run: pnpm dev"
echo "3. Open: http://localhost:5173"
echo ""
echo "For more information, see README.md"
