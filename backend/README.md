# Scout Backend

Phase 1 backend skeleton — accepts run uploads (APK + trace bundle), persists to Postgres, exposes minimal endpoints. No agent or emulator integration yet; those land in Plan 3.

## Prerequisites

- Node.js 22+
- Docker (for the test Postgres container)
- A running Postgres 16 (local dev)

## First-time setup

```bash
npm install
cp .env.example .env
# edit .env — set DATABASE_URL and SCOUT_API_KEY

# Apply migrations to a local Postgres
npm run db:migrate
```

## Running locally

```bash
npm run dev
# Server listens on http://localhost:3000
```

## Running tests

```bash
npm test          # one-shot
npm run test:watch # watch mode
```

Tests spin up an ephemeral Postgres via testcontainers — Docker must be running.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | Health probe |
| POST | `/projects` | X-Scout-API-Key | Create a project |
| GET | `/projects/:id` | X-Scout-API-Key | Get a project |
| POST | `/runs` | X-Scout-API-Key | Upload a run (multipart) |
| GET | `/runs/:id` | X-Scout-API-Key | Get a run + sessions |

See `docs/smoke-test.md` for end-to-end curl examples.

## Project structure

See the design doc at `../docs/superpowers/specs/2026-05-12-scout-design.md`. The plan that produced this skeleton is `../docs/superpowers/plans/2026-05-12-scout-backend-skeleton.md`.
