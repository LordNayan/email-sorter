# Base stage with all dependencies
FROM node:20-alpine AS base
WORKDIR /app

# Install OpenSSL and other dependencies for Prisma
RUN apk add --no-cache openssl libc6-compat

# Tell Prisma to use OpenSSL 3.0.x for Alpine Linux
ENV PRISMA_ENGINES_MIRROR=https://binaries.prisma.sh

# Install pnpm (use corepack for version management)
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY packages/ai/package.json ./packages/ai/
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/
COPY packages/gmail/package.json ./packages/gmail/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma Client for Alpine Linux with OpenSSL 3.0
RUN cd packages/db && npx prisma generate --generator client

# ========================================
# API Service
# ========================================
FROM base AS api
WORKDIR /app

# Copy startup script
# Run prisma migrations and seed the database, then start the API server
COPY apps/api/start.sh /app/start.sh
RUN chmod +x /app/start.sh
EXPOSE 4000
CMD ["/app/start.sh"]

# ========================================
# Worker Service (uses pre-built Playwright image)
# ========================================
FROM mcr.microsoft.com/playwright:v1.40.0-jammy AS worker
WORKDIR /app

# Set OpenSSL version for Prisma (Ubuntu 22.04 Jammy uses openssl 3.x)
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
ENV OPENSSL_CONF=/dev/null

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/ai/package.json ./packages/ai/
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/
COPY packages/gmail/package.json ./packages/gmail/

# Install only worker dependencies
RUN pnpm install --frozen-lockfile --filter worker...

# Copy only necessary source code
COPY packages/ ./packages/
COPY apps/worker/ ./apps/worker/

# Generate Prisma Client
RUN cd packages/db && npx prisma generate

# Playwright is already installed in this image!

CMD ["pnpm", "--filter", "worker", "start"]

# ========================================
# Web Service (Build and Serve)
# ========================================
FROM base AS web-builder
WORKDIR /app

# Build the web app
RUN pnpm --filter web build

# Serve stage using nginx
FROM nginx:alpine AS web
COPY --from=web-builder /app/apps/web/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
