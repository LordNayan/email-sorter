# Docker Setup Guide

This guide will help you run the entire Email Sorter application using Docker Compose.

## Prerequisites

- Docker Desktop (macOS/Windows) or Docker Engine + Docker Compose (Linux)
- At least 4GB of available RAM
- Google OAuth credentials (for authentication)
- OpenAI API key (for AI categorization)

## Quick Start

### 1. Clone and Navigate

```bash
cd /path/to/email-sorter
```

### 2. Configure Environment

Copy the Docker environment template:

```bash
cp .env.docker .env
```

Edit `.env` and fill in the required values:

```bash
# Generate a random session secret
SESSION_SECRET=your-super-secret-session-key-change-in-production

# Generate encryption key (32 bytes hex)
# Run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=your-64-character-hex-string

# Google OAuth credentials
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:4000/auth/google/callback
GOOGLE_TEST_ALLOWED_EMAILS=your-test-email@gmail.com

# OpenAI API Key
OPENAI_API_KEY=your-openai-api-key
```

### 3. Build and Start All Services

```bash
docker-compose up --build
```

Or run in detached mode:

```bash
docker-compose up -d --build
```

### 4. Access the Application

Once all services are running:

- **Web Application**: http://localhost:5173
- **API Server**: http://localhost:4000
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

## Services Overview

The Docker Compose setup includes:

1. **postgres** - PostgreSQL 16 database
2. **redis** - Redis 7 for job queue
3. **api** - Express.js API server (port 4000)
4. **worker** - Background job processor for email sync and AI categorization
5. **web** - React frontend (port 5173)

## Common Commands

### Start all services
```bash
docker-compose up -d
```

### Stop all services
```bash
docker-compose down
```

### Stop and remove volumes (⚠️ deletes all data)
```bash
docker-compose down -v
```

### View logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f worker
docker-compose logs -f web
```

### Restart a service
```bash
docker-compose restart api
```

### Rebuild a service
```bash
docker-compose up -d --build api
```

### Check service status
```bash
docker-compose ps
```

### Execute commands in a container
```bash
# Access API container shell
docker-compose exec api sh

# Access Postgres
docker-compose exec postgres psql -U postgres -d ai_mail

# Access Redis CLI
docker-compose exec redis redis-cli
```

## Database Management

### Run Migrations Manually

Migrations run automatically when the API starts, but you can also run them manually:

```bash
docker-compose exec api sh -c "cd /app/packages/db && pnpm run migrate:deploy"
```

### Seed Database

```bash
docker-compose exec api sh -c "cd /app/packages/db && pnpm run seed"
```

### Access Database

```bash
docker-compose exec postgres psql -U postgres -d ai_mail
```

## Troubleshooting

### Services won't start

1. Check if ports are already in use:
   ```bash
   lsof -i :4000  # API
   lsof -i :5173  # Web
   lsof -i :5432  # PostgreSQL
   lsof -i :6379  # Redis
   ```

2. Check logs for errors:
   ```bash
   docker-compose logs
   ```

### Database connection errors

1. Ensure PostgreSQL is healthy:
   ```bash
   docker-compose ps postgres
   ```

2. Check database logs:
   ```bash
   docker-compose logs postgres
   ```

### Worker not processing jobs

1. Ensure Redis is running:
   ```bash
   docker-compose ps redis
   ```

2. Check worker logs:
   ```bash
   docker-compose logs worker
   ```

### Build failures

Clean up and rebuild:
```bash
docker-compose down
docker system prune -a
docker-compose up --build
```

### Permission errors

If you encounter permission errors on Linux:
```bash
sudo chown -R $USER:$USER .
```

## Development vs Production

This Docker setup is configured for a **test/demo environment**. For production deployment:

1. Use proper secrets management (not .env files)
2. Set up SSL/TLS certificates
3. Configure proper CORS origins
4. Use production-grade session storage (e.g., Redis sessions)
5. Set up proper logging and monitoring
6. Configure backup strategies for PostgreSQL
7. Use Docker secrets for sensitive data
8. Set resource limits in docker-compose.yml

## Data Persistence

Data is persisted in Docker volumes:

- `postgres_data` - Database files
- `redis_data` - Redis persistence

To backup data:

```bash
# Backup PostgreSQL
docker-compose exec postgres pg_dump -U postgres ai_mail > backup.sql

# Restore PostgreSQL
docker-compose exec -T postgres psql -U postgres ai_mail < backup.sql
```

## Stopping and Cleanup

### Stop services (keeps data)
```bash
docker-compose down
```

### Stop and remove all data
```bash
docker-compose down -v
```

### Remove unused Docker resources
```bash
docker system prune -a
```

## Support

For issues or questions, please check the main README.md or create an issue in the repository.
