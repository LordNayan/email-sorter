# COPILOT TASK — Minimal AI Email Sorting App (Node + React + Postgres) — Pure JavaScript

Build a minimal, working app that satisfies all listed behaviors end-to-end. Keep code small, testable, and focused. No extras beyond what’s specified. (Pure JavaScript only – no TypeScript.)

## Tech Baseline

* Monorepo: pnpm workspaces
* Backend: Node.js + Express (pure JavaScript)
* Frontend: React + Vite (JavaScript)
* DB: PostgreSQL + Prisma
* Queue: BullMQ + Redis
* Gmail: OAuth2 + Gmail REST API
* AI: OpenAI-compatible completion endpoint (provider-agnostic wrapper)
* Headless browser for unsubscribe flows: Playwright (minimal)

## Workspace Layout

```
apps/
  api/          # Express API
  web/          # React app
  worker/       # queues + processors
packages/
  db/           # Prisma schema + client
  gmail/        # OAuth + Gmail helpers (scoped)
  ai/           # AI client + prompts
  core/         # shared tiny utils (no TS types / no zod)
```

## Env + Dev

Create `.env.example`:

```
# App
NODE_ENV=development
PORT=4000
WEB_URL=http://localhost:5173
API_URL=http://localhost:4000

# Postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_mail?schema=public

# Redis
REDIS_URL=redis://localhost:6379

# Google OAuth (dev-only; test user allowlist)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:4000/auth/google/callback
GOOGLE_TEST_ALLOWED_EMAILS=example@gmail.com

# AI
AI_PROVIDER=openai
OPENAI_API_KEY=
```

Provide `docker-compose.yml` with Postgres and Redis only.

## Data Model (Prisma)

Define the absolute minimum tables to meet behavior:

* `User { id, email, name, createdAt }`
* `ConnectedAccount { id, userId, email, googleUserId, accessTokenEnc, refreshTokenEnc, expiryDate, historyId, createdAt }`
* `Category { id, userId, name, description, createdAt }`
* `Email { id, userId, accountId, gmailId, threadId, subject, from, receivedAt, snippet, html, text, aiSummary, categoryId, archivedAt, unsubscribeUrl, unsubscribeMailto, createdAt }`
* `UnsubscribeAttempt { id, emailId, method ("link"|"mailto"), status ("success"|"failed"), notes, createdAt }`

Generate migrations and a tiny `seed` (2 categories and 1 dummy email).

## Security Minimal

* Cookie session (signed) storing user id only.
* Encrypt Google tokens at rest (libsodium sealed box).
* Sanitize rendered email HTML (DOMPurify on client).

## Gmail Scopes (exact)

* `openid email profile`
* `https://www.googleapis.com/auth/gmail.readonly`
* `https://www.googleapis.com/auth/gmail.modify`
* `https://www.googleapis.com/auth/gmail.send`  # for mailto unsubscribe

## Core Behaviors (implement exactly, minimally)

### Auth + Accounts

* `GET /auth/google` → start OAuth with offline access + refresh token.
* `GET /auth/google/callback` → exchange code; if email not in `GOOGLE_TEST_ALLOWED_EMAILS`, reject; store tokens; create `ConnectedAccount`; enqueue initial sync (last 7 days).
* `GET /me` → returns user + connected accounts.
* `GET /accounts` → list user’s Gmail accounts.
* `POST /accounts/:id/resync` → enqueue sync now.

### Categories

* `GET /categories` → list categories.
* `POST /categories` → create `{name, description}` (name unique per user).
* `PATCH /categories/:id` → update.
* `DELETE /categories/:id` → delete (only if no emails or cascade).

### Email Ingestion + AI

Minimal polling only (no Pub/Sub):

* Worker cron every 2 minutes per account:

  * Use Gmail History if `historyId` present; else list messages since last 2 minutes.
  * For each new message id: fetch full payload, parse headers/body, extract `List-Unsubscribe` → store `unsubscribeUrl|unsubscribeMailto`.
  * Classify into one user category using AI with `{subject, from, text/html truncated}` plus the list of category `{name, description}`.
  * Summarize to 1–3 sentences with AI.
  * Archive on Gmail: remove `INBOX` label via `modify`.
  * Persist `Email` row with `aiSummary`, `categoryId`, `archivedAt`.

### Category View + Bulk Actions

* `GET /emails?categoryId=...&cursor=...` → minimal cursor pagination.
* `GET /emails/:id` → original HTML/text + headers needed for display.
* `POST /emails/bulk/delete` `{ids: string[]}` → Gmail `trash`; reflect locally.
* `POST /emails/bulk/unsubscribe` `{ids: string[]}`:

  * If `mailto:` → send minimal unsubscribe email via Gmail `users.messages.send`.
  * If `unsubscribeUrl` → Playwright headless:

    * Navigate; click common selectors containing `unsubscribe|opt-out|confirm|submit`; wait for network idle.
  * Record `UnsubscribeAttempt` per email.

### Frontend Pages (React + Vite)

* `/login` → “Sign in with Google” button → hits `/auth/google`.
* `/dashboard` (single page with 3 sections):

  1. Connected accounts + “Connect another Gmail”.
  2. Categories list.
  3. “Add Category” button → modal `{name, description}`.
* `/categories/:id`:

  * Table: checkbox, Subject, From, Received, AI Summary, Unsubscribe (yes/no).
  * Toolbar: Select all | Delete | Unsubscribe → call bulk APIs.
  * Email drawer: shows sanitized original HTML and “Open in Gmail” link.

### AI Package (minimal)

* Single client wrapper for OpenAI-compatible `chat.completions`.
* Two functions:

  * `classifyEmail(email, categories) → { categoryName, confidence }`
  * `summarizeEmail(email) → string (≤3 sentences)`
* Low temperature; enforce output shape with manual `JSON.parse` + property existence checks (no zod / no TypeScript types).

### Gmail Package (minimal)

* OAuth client with refresh.
* Helpers: `listHistory`, `listMessages`, `getMessage`, `modifyLabels`, `trashMessage`, `sendMessage`.
* MIME utilities: extract `text`, `html`, `List-Unsubscribe` header; simple HTML anchor scan for “unsubscribe”.

### Worker (minimal)

* Queues: `syncQueue`, `unsubscribeQueue`.
* Sync processor: ingest → classify → summarize → archive (single processor function chaining steps).
* Unsubscribe processor: handle link/mailto; write `UnsubscribeAttempt`.
* Idempotency by `gmailId` (ignore duplicates).

## Validation (Runtime Only)

* Pure JavaScript everywhere (ESM recommended: set `"type": "module"` in `package.json`).
* Minimal manual validation on request payloads (check required fields & primitive types; respond 400 if invalid).
* For AI responses, wrap parsing in try/catch; if malformed, fallback to a safe default (e.g. category = first, summary = truncated snippet).
* Keep modules small; avoid introducing heavy validation libraries unless absolutely needed.

## Tests (small but real)

* Unit: parser for `List-Unsubscribe` header + HTML link extraction.
* Integration: categories CRUD and emails list with Supertest (DB test url).
* E2E (single Playwright spec): mocked OAuth, create category, ingest fixture email JSON, see it appear with summary.

## Scripts

* Root: `dev` (api + web + worker), `db:migrate`, `db:seed`, `test`, `lint`.
* Provide `README.md` with setup steps and `docker-compose up -d` for Postgres/Redis.

## Acceptance (must pass)

* Sign in with Google as a test user.
* Add categories.
* New emails auto-classified, summarized, and archived.
* Category view lists emails with summaries.
* Bulk delete moves emails to Trash.
* Bulk unsubscribe attempts link/mailto and records status.
* Minimal tests run green.

Generate all code, configs, and minimal fixtures now.

