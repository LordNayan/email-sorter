# Email Sorter - Quick Start

## Quick Setup (5 minutes)

### 1. Prerequisites
```bash
# Install pnpm if you haven't
npm install -g pnpm

# Make sure Docker is running
docker --version
```

### 2. Run Setup Script
```bash
chmod +x setup.sh
./setup.sh
```

### 3. Configure API Keys

Edit `.env` file and add:

```env
# Get from Google Cloud Console
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_TEST_ALLOWED_EMAILS=your-email@gmail.com

# Get from OpenAI
OPENAI_API_KEY=sk-...
```

### 4. Start the App
```bash
pnpm dev
```

### 5. Open Browser
Navigate to http://localhost:5173

## Getting API Keys

### Google OAuth (Required)
1. Visit https://console.cloud.google.com/
2. Create project → Enable Gmail API
3. Create OAuth 2.0 Client ID
4. Add redirect: `http://localhost:4000/auth/google/callback`
5. Copy Client ID & Secret

### OpenAI (Required)
1. Visit https://platform.openai.com/api-keys
2. Create new secret key
3. Copy the key (starts with `sk-`)

## Common Commands

```bash
# Start all services
pnpm dev

# Start individual services
pnpm --filter api dev
pnpm --filter web dev
pnpm --filter worker dev

# Database
pnpm db:migrate    # Run migrations
pnpm db:seed       # Seed data
pnpm db:studio     # Open Prisma Studio

# Tests
pnpm test          # Run all tests
pnpm test:e2e      # E2E tests only

# Docker
docker-compose up -d        # Start services
docker-compose down         # Stop services
docker-compose logs -f      # View logs
```

## Troubleshooting

**Port already in use?**
```bash
# Change ports in .env
PORT=4001
```

**Database connection failed?**
```bash
docker-compose restart postgres
```

**Worker not processing emails?**
```bash
docker-compose restart redis
```

For detailed documentation, see [README.md](README.md)
