# Email Sorter - AI-Powered Email Management

A minimal, working application that automatically sorts, classifies, and summarizes emails using AI. Built with Node.js, React, PostgreSQL, and OpenAI.

## Features

- 🔐 **OAuth2 Gmail Integration** - Secure authentication with Google
- 🤖 **AI-Powered Classification** - Automatically categorize emails using OpenAI
- 📝 **Smart Summaries** - Generate concise 1-3 sentence summaries of each email
- 📂 **Custom Categories** - Create and manage your own email categories
- 🗑️ **Bulk Actions** - Delete or unsubscribe from multiple emails at once
- 🔄 **Auto-Archive** - Automatically archive processed emails in Gmail
- 🎯 **Unsubscribe Helper** - Smart detection and automated unsubscribe (link + mailto)

## Tech Stack

### Backend
- **Node.js + Express** - REST API server
- **PostgreSQL + Prisma** - Database and ORM
- **BullMQ + Redis** - Job queue for email processing
- **Gmail API** - Email fetching and management
- **OpenAI API** - Email classification and summarization

### Frontend
- **React + Vite** - Modern frontend framework
- **React Router** - Client-side routing
- **DOMPurify** - Safe HTML rendering

### Infrastructure
- **pnpm Workspaces** - Monorepo management
- **Docker Compose** - Local development environment
- **Playwright** - End-to-end testing

## Project Structure

```
email-sorter/
├── apps/
│   ├── api/          # Express REST API
│   ├── web/          # React frontend
│   └── worker/       # Background job processor
├── packages/
│   ├── db/           # Prisma schema & migrations
│   ├── gmail/        # Gmail API helpers
│   ├── ai/           # OpenAI integration
│   └── core/         # Shared utilities
├── tests/
│   └── e2e/          # Playwright tests
├── docker-compose.yml
└── pnpm-workspace.yaml
```

## Prerequisites

- **Node.js** 18+ and **pnpm** 8+
- **Docker** and **Docker Compose**
- **Google Cloud Project** with Gmail API enabled
- **OpenAI API Key**

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd email-sorter
pnpm install
```

### 2. Start Docker Services

```bash
docker-compose up -d
```

This starts PostgreSQL and Redis containers.

### 3. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and fill in the required values:

```env
# App
NODE_ENV=development
PORT=4000
WEB_URL=http://localhost:5173
API_URL=http://localhost:4000

# Postgres (default Docker values)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_mail?schema=public

# Redis (default Docker values)
REDIS_URL=redis://localhost:6379

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:4000/auth/google/callback
GOOGLE_TEST_ALLOWED_EMAILS=your-email@gmail.com

# OpenAI
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...

# Security
SESSION_SECRET=generate-a-random-secret-here
ENCRYPTION_KEY=generate-32-byte-hex-key-here
```
Copy the env to db folder as well:

```bash
cp .env ./packages/db/.env
```

#### Generate Encryption Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Setup Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Gmail API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Configure OAuth consent screen
6. Add authorized redirect URI: `http://localhost:4000/auth/google/callback`
7. Copy the **Client ID** and **Client Secret** to your `.env` file
8. Add your test email to `GOOGLE_TEST_ALLOWED_EMAILS`

### 5. Setup Database

```bash
# Run Prisma migrations
pnpm db:migrate

# Seed database with sample categories
pnpm db:seed
```

### 6. Start the Application

```bash
# Start all services (API + Web + Worker)
pnpm dev
```

This starts:
- **API Server**: http://localhost:4000
- **Web App**: http://localhost:5173
- **Worker**: Background email processor

## Usage

### 1. Sign In

1. Open http://localhost:5173
2. Click "Sign in with Google"
3. Authorize the application
4. You'll be redirected to the dashboard

### 2. Create Categories

1. On the dashboard, click "Add Category"
2. Enter a name (e.g., "Newsletter", "Social", "Work")
3. Optionally add a description to help AI classify better
4. Click "Create"

### 3. Email Processing

The worker automatically:
- Fetches new emails every 2 minutes
- Classifies them into your categories using AI
- Generates summaries
- Archives them in Gmail
- Stores them in the database

### 4. Manage Emails

1. Click "View Emails" on any category
2. See all emails with AI summaries
3. Select emails using checkboxes
4. Use bulk actions:
   - **Delete** - Moves to Gmail trash
   - **Unsubscribe** - Attempts to unsubscribe via link or mailto

### 5. View Email Details

- Click "View" on any email to see the full content
- HTML emails are sanitized and rendered safely
- See AI-generated summary at the top

## Development

### Run Individual Services

```bash
# API only
pnpm --filter api dev

# Web only
pnpm --filter web dev

# Worker only
pnpm --filter worker dev
```

### Database Management

```bash
# Create a new migration
pnpm --filter db migrate

# Open Prisma Studio (database GUI)
pnpm --filter db studio

# Reset database (WARNING: deletes all data)
pnpm --filter db migrate:reset
```

### Testing

```bash
# Run unit tests
pnpm --filter gmail test

# Run E2E tests
pnpm test:e2e

# Run all tests
pnpm test
```

## API Endpoints

### Authentication
- `GET /auth/google` - Start OAuth flow
- `GET /auth/google/callback` - OAuth callback
- `POST /auth/logout` - Logout
- `GET /me` - Get current user

### Categories
- `GET /categories` - List categories
- `POST /categories` - Create category
- `PATCH /categories/:id` - Update category
- `DELETE /categories/:id` - Delete category

### Emails
- `GET /emails?categoryId=...` - List emails (with pagination)
- `GET /emails/:id` - Get single email
- `POST /emails/bulk/delete` - Bulk delete
- `POST /emails/bulk/unsubscribe` - Bulk unsubscribe

### Accounts
- `GET /accounts` - List connected Gmail accounts
- `POST /accounts/:id/resync` - Trigger manual sync

## Architecture

### Email Processing Flow

1. **Worker** polls Gmail API every 2 minutes
2. Fetches new emails using History API (or full list on first run)
3. For each email:
   - Parse headers and body
   - Extract unsubscribe information
   - **Classify** using AI with category descriptions
   - **Summarize** content with AI
   - Archive in Gmail (remove INBOX label)
   - Store in PostgreSQL with metadata
4. Updates history ID for incremental syncs

### Security

- **OAuth2** with refresh tokens for Gmail access
- **Token encryption** at rest using libsodium
- **Session cookies** (httpOnly, signed)
- **HTML sanitization** using DOMPurify on client
- **Test user allowlist** for development safety

### Background Jobs

- **Sync Queue** - Email ingestion and processing
- **Unsubscribe Queue** - Automated unsubscribe attempts
  - **Mailto**: Sends unsubscribe email via Gmail API
  - **Link**: Uses Playwright to navigate and click unsubscribe

## Troubleshooting

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker ps

# Restart database
docker-compose restart postgres
```

### Redis Connection Issues

```bash
# Check if Redis is running
docker ps

# Restart Redis
docker-compose restart redis
```

### Gmail API Quota

Gmail API has rate limits. If you hit them:
- Reduce sync frequency in `apps/worker/index.js`
- Use History API (already implemented) for incremental syncs

### Worker Not Processing Emails

```bash
# Check worker logs
pnpm --filter worker dev

# Verify Redis connection
redis-cli ping

# Check BullMQ queues
# Install Bull Board for UI monitoring
```

## Production Deployment

### Environment Variables

Update these for production:

```env
NODE_ENV=production
WEB_URL=https://your-domain.com
API_URL=https://api.your-domain.com
SESSION_SECRET=strong-random-secret
ENCRYPTION_KEY=strong-random-32-byte-hex
```

### Database

Use a production PostgreSQL instance (not Docker):

```env
DATABASE_URL=postgresql://user:pass@host:5432/db?schema=public
```

### Redis

Use a production Redis instance (AWS ElastiCache, Redis Cloud, etc.):

```env
REDIS_URL=redis://prod-redis-host:6379
```

### OAuth Callback

Update Google Cloud Console with production redirect URI:

```
https://api.your-domain.com/auth/google/callback
```

## License

MIT

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## Support

For issues and questions, please open a GitHub issue.
This app connects to a gmail inbox and sorts all incoming mail into user generated categories with the help of AI
