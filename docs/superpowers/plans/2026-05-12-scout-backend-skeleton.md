# Scout Backend Skeleton — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Scout backend skeleton — a Fastify HTTP service backed by Postgres that accepts run uploads (APK + trace bundle), persists the full database schema, and exposes minimal endpoints needed by the CLI and (future) agent. No agent, no emulator, no dashboard in this plan — just the foundation everything else plugs into.

**Architecture:** A single Node.js service. HTTP layer = Fastify. Persistence = Postgres via Drizzle ORM. File storage (APK + trace bundles) = local filesystem behind a `StorageAdapter` interface so it's swappable for S3 later. Auth = single `X-Scout-API-Key` header (multi-tenancy is out of scope per the spec). Validation = Zod on every external input.

**Tech Stack:**
- Node.js 22+ (ESM, native fetch, native test runner not used — we use Vitest)
- TypeScript 5.x strict mode
- Fastify 5.x + `@fastify/multipart` (for APK upload)
- Postgres 16
- Drizzle ORM 0.36+ with `drizzle-kit` for migrations
- `postgres` (driver — modern alternative to `pg`)
- Zod 3.x
- Vitest + `@testcontainers/postgresql` for integration tests
- tsx for dev, `tsc` for build

**Plan position:** This is **Plan 1 of 5** for Scout Phase 1. Subsequent plans (CLI, cloud emulator + agent, multi-persona + critic, dashboard) build on the schema and endpoints established here. After this plan ships, you have a backend that accepts runs but nothing yet consumes them — that's expected.

**Deliverable when this plan is done:** You can `curl` against a running backend, create a project, POST a multipart `(APK + trace.json + metadata)` and get back a run ID, then `GET /runs/:id` and see the run + skeleton sessions persisted. All tests pass. Schema migrations apply cleanly. The repo is `npm run build`-able and `npm run dev`-runnable.

---

## File Structure

```
scout-mobile-agent/
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── drizzle.config.ts
│   ├── .env.example
│   ├── README.md
│   ├── docs/
│   │   └── smoke-test.md
│   ├── src/
│   │   ├── main.ts                       # entrypoint — starts server
│   │   ├── server.ts                     # builds the Fastify app (testable)
│   │   ├── config.ts                     # env vars validated by Zod
│   │   ├── db/
│   │   │   ├── client.ts                 # postgres + Drizzle instance
│   │   │   ├── schema.ts                 # all tables + enums
│   │   │   └── index.ts                  # exports
│   │   ├── storage/
│   │   │   ├── adapter.ts                # StorageAdapter interface
│   │   │   └── local.ts                  # LocalStorageAdapter
│   │   ├── auth/
│   │   │   └── api-key.ts                # Fastify pre-handler hook
│   │   ├── lib/
│   │   │   ├── errors.ts                 # AppError + error handler
│   │   │   └── trace-schema.ts           # Zod schema for trace bundle v1
│   │   ├── models/
│   │   │   ├── projects.ts               # repo functions
│   │   │   └── runs.ts                   # repo functions (runs + sessions)
│   │   └── routes/
│   │       ├── health.ts                 # GET /health
│   │       ├── projects.ts               # POST /projects, GET /projects/:id
│   │       └── runs.ts                   # POST /runs, GET /runs/:id
│   ├── migrations/                       # drizzle-kit output
│   └── tests/
│       ├── helpers/
│       │   ├── test-db.ts                # spins up Postgres via testcontainers
│       │   └── test-app.ts               # builds a Fastify app wired to test DB
│       ├── routes/
│       │   ├── health.test.ts
│       │   ├── auth.test.ts
│       │   ├── projects.test.ts
│       │   └── runs.test.ts
│       ├── models/
│       │   ├── projects.test.ts
│       │   └── runs.test.ts
│       ├── storage/
│       │   └── local.test.ts
│       └── lib/
│           └── trace-schema.test.ts
```

**Boundary rules:**
- `routes/` only handles HTTP — no SQL or filesystem IO inline. Delegates to `models/` and `storage/`.
- `models/` only knows about the DB. Returns plain typed objects.
- `storage/` only knows about file IO behind an interface.
- `lib/` is pure functions (Zod schemas, error types). No IO.

---

## Task 1: Initialize the backend project

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/.gitignore`

- [ ] **Step 1: Create the backend directory and package.json**

```bash
mkdir -p backend && cd backend
```

Create `backend/package.json`:

```json
{
  "name": "@scout/backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.0.0" },
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc",
    "start": "node dist/main.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "fastify": "^5.0.0",
    "@fastify/multipart": "^9.0.0",
    "drizzle-orm": "^0.36.0",
    "postgres": "^3.4.5",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0",
    "tsx": "^4.19.0",
    "vitest": "^2.1.0",
    "@testcontainers/postgresql": "^10.13.0",
    "drizzle-kit": "^0.28.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `backend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create .gitignore additions**

Create `backend/.gitignore`:

```
node_modules/
dist/
.env
.env.local
storage/
coverage/
```

- [ ] **Step 4: Install dependencies**

```bash
cd backend && npm install
```

Expected: package-lock.json created, no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/tsconfig.json backend/.gitignore
git commit -m "feat(backend): initialize Node + TypeScript backend project"
```

---

## Task 2: Health endpoint with Fastify (TDD)

**Files:**
- Create: `backend/src/server.ts`
- Create: `backend/src/routes/health.ts`
- Create: `backend/tests/routes/health.test.ts`
- Create: `backend/vitest.config.ts`

- [ ] **Step 1: Create Vitest config**

Create `backend/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 2: Write the failing test**

Create `backend/tests/routes/health.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildServer } from '../../src/server.js';

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const app = await buildServer({ apiKey: 'test-key' });
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd backend && npm test -- tests/routes/health.test.ts
```

Expected: FAIL with "Cannot find module '../../src/server.js'" or similar.

- [ ] **Step 4: Implement the health route**

Create `backend/src/routes/health.ts`:

```typescript
import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({ status: 'ok' }));
}
```

- [ ] **Step 5: Implement the server builder**

Create `backend/src/server.ts`:

```typescript
import Fastify, { type FastifyInstance } from 'fastify';
import { healthRoutes } from './routes/health.js';

export interface ServerOptions {
  apiKey: string;
}

export async function buildServer(_opts: ServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(healthRoutes);
  return app;
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd backend && npm test -- tests/routes/health.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/server.ts backend/src/routes/health.ts backend/tests/routes/health.test.ts backend/vitest.config.ts
git commit -m "feat(backend): add /health endpoint with TDD setup"
```

---

## Task 3: Config module with Zod env validation (TDD)

**Files:**
- Create: `backend/src/config.ts`
- Create: `backend/.env.example`
- Create: `backend/tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/config.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('returns parsed config when all env vars are present', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/scout',
      SCOUT_API_KEY: 'secret-key',
      STORAGE_DIR: './storage',
      PORT: '3000',
    });
    expect(config.databaseUrl).toBe('postgres://user:pass@localhost:5432/scout');
    expect(config.apiKey).toBe('secret-key');
    expect(config.storageDir).toBe('./storage');
    expect(config.port).toBe(3000);
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() => loadConfig({ SCOUT_API_KEY: 'k', STORAGE_DIR: './s', PORT: '3000' }))
      .toThrow(/DATABASE_URL/);
  });

  it('defaults PORT to 3000 when unset', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgres://u:p@l/d',
      SCOUT_API_KEY: 'k',
      STORAGE_DIR: './s',
    });
    expect(config.port).toBe(3000);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd backend && npm test -- tests/config.test.ts
```

Expected: FAIL with module not found.

- [ ] **Step 3: Implement the config module**

Create `backend/src/config.ts`:

```typescript
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  SCOUT_API_KEY: z.string().min(8, 'SCOUT_API_KEY must be at least 8 characters'),
  STORAGE_DIR: z.string().default('./storage'),
  PORT: z
    .string()
    .default('3000')
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().positive()),
});

export interface Config {
  databaseUrl: string;
  apiKey: string;
  storageDir: string;
  port: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.parse(env);
  return {
    databaseUrl: parsed.DATABASE_URL,
    apiKey: parsed.SCOUT_API_KEY,
    storageDir: parsed.STORAGE_DIR,
    port: parsed.PORT,
  };
}
```

- [ ] **Step 4: Verify the test passes**

```bash
cd backend && npm test -- tests/config.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Create the .env.example**

Create `backend/.env.example`:

```
# Postgres connection string
DATABASE_URL=postgres://scout:scout@localhost:5432/scout

# API key for the X-Scout-API-Key header. Must be at least 8 chars.
# Generate locally with: openssl rand -hex 32
SCOUT_API_KEY=replace-me-with-a-real-key

# Local filesystem dir where APK + trace bundles are stored
STORAGE_DIR=./storage

# HTTP port
PORT=3000
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/config.ts backend/tests/config.test.ts backend/.env.example
git commit -m "feat(backend): add Zod-validated config loader"
```

---

## Task 4: Postgres test helper using testcontainers

**Files:**
- Create: `backend/tests/helpers/test-db.ts`

This task introduces no production code; it sets up a helper for later integration tests.

- [ ] **Step 1: Implement the test DB helper**

Create `backend/tests/helpers/test-db.ts`:

```typescript
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

export interface TestDb {
  container: StartedPostgreSqlContainer;
  url: string;
  sql: ReturnType<typeof postgres>;
  db: PostgresJsDatabase;
  stop: () => Promise<void>;
}

export async function startTestDb(): Promise<TestDb> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('scout_test')
    .withUsername('scout')
    .withPassword('scout')
    .start();

  const url = container.getConnectionUri();
  const sql = postgres(url, { max: 4 });
  const db = drizzle(sql);

  return {
    container,
    url,
    sql,
    db,
    stop: async () => {
      await sql.end({ timeout: 5 });
      await container.stop();
    },
  };
}
```

- [ ] **Step 2: Sanity-check by writing a one-off smoke test**

Create `backend/tests/helpers/test-db.smoke.test.ts`:

```typescript
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { startTestDb, type TestDb } from './test-db.js';

describe('test-db helper', () => {
  let tdb: TestDb;

  beforeAll(async () => { tdb = await startTestDb(); }, 60000);
  afterAll(async () => { await tdb.stop(); });

  it('starts Postgres and accepts a SELECT 1', async () => {
    const rows = await tdb.sql`SELECT 1 AS one`;
    expect(rows[0]?.one).toBe(1);
  });
});
```

- [ ] **Step 3: Run the smoke test**

```bash
cd backend && npm test -- tests/helpers/test-db.smoke.test.ts
```

Expected: PASS (may take 30-60s on first run while Docker pulls the image).

If Docker isn't running, the test errors with a Docker connection issue — that's an environmental setup problem, not a code problem. Fix Docker, rerun.

- [ ] **Step 4: Delete the smoke test (helper is verified, smoke test would slow CI)**

```bash
rm backend/tests/helpers/test-db.smoke.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add backend/tests/helpers/test-db.ts
git commit -m "feat(backend): add testcontainers Postgres helper for integration tests"
```

---

## Task 5: Drizzle setup — config + client + first enums (no tables yet)

**Files:**
- Create: `backend/drizzle.config.ts`
- Create: `backend/src/db/schema.ts` (initial — enums only)
- Create: `backend/src/db/client.ts`
- Create: `backend/src/db/index.ts`

- [ ] **Step 1: Create drizzle config**

Create `backend/drizzle.config.ts`:

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://scout:scout@localhost:5432/scout',
  },
  strict: true,
  verbose: true,
});
```

- [ ] **Step 2: Create the schema file with enums**

Create `backend/src/db/schema.ts`:

```typescript
import { pgEnum } from 'drizzle-orm/pg-core';

export const runModeEnum = pgEnum('run_mode', ['exploration', 'verification']);
export const runStatusEnum = pgEnum('run_status', [
  'queued',
  'running',
  'completed',
  'failed',
  'budget_exhausted',
]);
export const sessionStatusEnum = pgEnum('session_status', ['running', 'completed', 'failed', 'stuck']);
export const findingTypeEnum = pgEnum('finding_type', ['perf', 'a11y', 'ux', 'polish', 'bug']);
export const findingSeverityEnum = pgEnum('finding_severity', ['low', 'med', 'high', 'critical']);
export const findingStatusEnum = pgEnum('finding_status', ['open', 'fixed', 'wontfix', 'duplicate']);
export const findingScopeEnum = pgEnum('finding_scope', ['state', 'session', 'edge']);
export const scorecardScopeEnum = pgEnum('scorecard_scope', ['state', 'session']);
export const pairResolutionEnum = pgEnum('pair_resolution', ['merged', 'split-confirmed']);
```

- [ ] **Step 3: Create the DB client**

Create `backend/src/db/client.ts`:

```typescript
import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

export type Db = PostgresJsDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  sql: ReturnType<typeof postgres>;
  close: () => Promise<void>;
}

export function createDbHandle(url: string): DbHandle {
  const sql = postgres(url, { max: 10 });
  const db = drizzle(sql, { schema });
  return {
    db,
    sql,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}
```

- [ ] **Step 4: Create the db barrel**

Create `backend/src/db/index.ts`:

```typescript
export * from './schema.js';
export * from './client.js';
```

- [ ] **Step 5: Typecheck**

```bash
cd backend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/drizzle.config.ts backend/src/db/
git commit -m "feat(backend): set up Drizzle ORM + DB client + enums"
```

---

## Task 6: Schema — projects + runs + sessions

**Files:**
- Modify: `backend/src/db/schema.ts`

- [ ] **Step 1: Add projects, runs, and sessions tables**

Add to the bottom of `backend/src/db/schema.ts`:

```typescript
import { pgTable, uuid, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  defaultPersonas: text('default_personas').array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const runs = pgTable('runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  apkUrl: text('apk_url').notNull(),
  traceUrl: text('trace_url').notNull(),
  intent: text('intent'),
  personas: text('personas').array().notNull().default(sql`'{}'::text[]`),
  mode: runModeEnum('mode').notNull().default('exploration'),
  status: runStatusEnum('status').notNull().default('queued'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: uuid('run_id')
    .notNull()
    .references(() => runs.id, { onDelete: 'cascade' }),
  personaId: text('persona_id').notNull(),
  startedStateId: uuid('started_state_id'), // FK added once states table exists
  endedStateId: uuid('ended_state_id'),
  budgetUsed: integer('budget_used').notNull().default(0),
  status: sessionStatusEnum('status').notNull().default('running'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
```

- [ ] **Step 2: Typecheck**

```bash
cd backend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/schema.ts
git commit -m "feat(backend): add projects, runs, sessions tables to schema"
```

---

## Task 7: Schema — states + edges

**Files:**
- Modify: `backend/src/db/schema.ts`

- [ ] **Step 1: Add states and edges tables**

Append to `backend/src/db/schema.ts`:

```typescript
export const states = pgTable('states', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  perceptualHash: text('perceptual_hash').notNull(),
  uiTreeFingerprint: text('ui_tree_fingerprint').notNull(),
  inferredTitle: text('inferred_title'),
  sampleScreenshotUrl: text('sample_screenshot_url').notNull(),
  sampleUiTree: jsonb('sample_ui_tree').notNull(),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  visitCount: integer('visit_count').notNull().default(0),
});

export const edges = pgTable('edges', {
  id: uuid('id').defaultRandom().primaryKey(),
  fromStateId: uuid('from_state_id')
    .notNull()
    .references(() => states.id, { onDelete: 'cascade' }),
  toStateId: uuid('to_state_id')
    .notNull()
    .references(() => states.id, { onDelete: 'cascade' }),
  action: jsonb('action').notNull(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  durationMs: integer('duration_ms').notNull().default(0),
  networkCalls: jsonb('network_calls').notNull().default(sql`'[]'::jsonb`),
  beforeScreenshotUrl: text('before_screenshot_url'),
  afterScreenshotUrl: text('after_screenshot_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type StateRow = typeof states.$inferSelect;
export type NewStateRow = typeof states.$inferInsert;
export type Edge = typeof edges.$inferSelect;
export type NewEdge = typeof edges.$inferInsert;
```

(Note: type is named `StateRow` — `State` would collide with the JavaScript global; using `StateRow` keeps imports unambiguous.)

- [ ] **Step 2: Typecheck**

```bash
cd backend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/schema.ts
git commit -m "feat(backend): add states and edges tables to schema"
```

---

## Task 8: Schema — scorecards + findings + persona_reports + candidate_similar_pairs

**Files:**
- Modify: `backend/src/db/schema.ts`

- [ ] **Step 1: Add remaining tables**

Append to `backend/src/db/schema.ts`:

```typescript
import { boolean } from 'drizzle-orm/pg-core';

export const scorecards = pgTable('scorecards', {
  id: uuid('id').defaultRandom().primaryKey(),
  scope: scorecardScopeEnum('scope').notNull(),
  subjectId: uuid('subject_id').notNull(),
  perf: integer('perf').notNull(),
  a11y: integer('a11y').notNull(),
  ux: integer('ux').notNull(),
  polish: integer('polish').notNull(),
  summary: text('summary'),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const findings = pgTable('findings', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  scope: findingScopeEnum('scope').notNull(),
  subjectId: uuid('subject_id').notNull(),
  type: findingTypeEnum('type').notNull(),
  severity: findingSeverityEnum('severity').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  suggestedFix: text('suggested_fix'),
  personaId: text('persona_id'),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  status: findingStatusEnum('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const personaReports = pgTable('persona_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  personaId: text('persona_id').notNull(),
  summary: text('summary').notNull(),
  painPoints: jsonb('pain_points').notNull().default(sql`'[]'::jsonb`),
  highlights: jsonb('highlights').notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const candidateSimilarPairs = pgTable('candidate_similar_pairs', {
  id: uuid('id').defaultRandom().primaryKey(),
  stateAId: uuid('state_a_id')
    .notNull()
    .references(() => states.id, { onDelete: 'cascade' }),
  stateBId: uuid('state_b_id')
    .notNull()
    .references(() => states.id, { onDelete: 'cascade' }),
  phashMatch: boolean('phash_match').notNull(),
  treeMatch: boolean('tree_match').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolution: pairResolutionEnum('resolution'),
});

export type Scorecard = typeof scorecards.$inferSelect;
export type NewScorecard = typeof scorecards.$inferInsert;
export type Finding = typeof findings.$inferSelect;
export type NewFinding = typeof findings.$inferInsert;
export type PersonaReport = typeof personaReports.$inferSelect;
export type NewPersonaReport = typeof personaReports.$inferInsert;
export type CandidateSimilarPair = typeof candidateSimilarPairs.$inferSelect;
export type NewCandidateSimilarPair = typeof candidateSimilarPairs.$inferInsert;
```

- [ ] **Step 2: Typecheck**

```bash
cd backend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/schema.ts
git commit -m "feat(backend): add scorecards, findings, persona_reports, candidate_similar_pairs"
```

---

## Task 9: Generate the initial migration

**Files:**
- Create: `backend/migrations/0000_*.sql` (generated)

- [ ] **Step 1: Generate the migration**

```bash
cd backend && npm run db:generate
```

Expected: A file appears under `backend/migrations/0000_xxx.sql` containing CREATE TABLE statements for all tables and CREATE TYPE statements for all enums. A `meta/` subdirectory also appears.

- [ ] **Step 2: Inspect the generated SQL**

Open the generated file. Verify it contains: enum types, all 9 tables, foreign-key constraints, default values for `default_personas`, `personas`, `network_calls`, `pain_points`, `highlights`.

If the migration is missing anything, fix the schema and re-run `npm run db:generate`. Drizzle will diff and produce a new migration; delete the wrong one and regenerate to keep `0000_*.sql` clean.

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/
git commit -m "feat(backend): generate initial database migration"
```

---

## Task 10: Migration applier helper for tests

**Files:**
- Modify: `backend/tests/helpers/test-db.ts`

The test DB helper from Task 4 starts an empty Postgres. We now need it to also apply our migrations so tests run against a real schema.

- [ ] **Step 1: Add a migration runner to the helper**

Replace `backend/tests/helpers/test-db.ts` with:

```typescript
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from '../../src/db/schema.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(here, '../../migrations');

export interface TestDb {
  container: StartedPostgreSqlContainer;
  url: string;
  sql: ReturnType<typeof postgres>;
  db: PostgresJsDatabase<typeof schema>;
  stop: () => Promise<void>;
}

export async function startTestDb(): Promise<TestDb> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('scout_test')
    .withUsername('scout')
    .withPassword('scout')
    .start();

  const url = container.getConnectionUri();
  const sql = postgres(url, { max: 4 });
  const db = drizzle(sql, { schema });

  await migrate(db, { migrationsFolder });

  return {
    container,
    url,
    sql,
    db,
    stop: async () => {
      await sql.end({ timeout: 5 });
      await container.stop();
    },
  };
}
```

- [ ] **Step 2: Write a sanity test that confirms migrations apply**

Create `backend/tests/db/migrations.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestDb, type TestDb } from '../helpers/test-db.js';
import { projects } from '../../src/db/schema.js';

describe('migrations', () => {
  let tdb: TestDb;
  beforeAll(async () => { tdb = await startTestDb(); }, 90000);
  afterAll(async () => { await tdb.stop(); });

  it('creates all tables and accepts an insert into projects', async () => {
    const inserted = await tdb.db.insert(projects).values({ name: 'demo' }).returning();
    expect(inserted[0]?.name).toBe('demo');
    expect(inserted[0]?.defaultPersonas).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test**

```bash
cd backend && npm test -- tests/db/migrations.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/helpers/test-db.ts backend/tests/db/migrations.test.ts
git commit -m "test(backend): apply migrations in test-db helper and verify schema"
```

---

## Task 11: Projects repo (TDD)

**Files:**
- Create: `backend/src/models/projects.ts`
- Create: `backend/tests/models/projects.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/models/projects.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestDb, type TestDb } from '../helpers/test-db.js';
import { createProject, getProjectById } from '../../src/models/projects.js';

describe('projects model', () => {
  let tdb: TestDb;
  beforeAll(async () => { tdb = await startTestDb(); }, 90000);
  afterAll(async () => { await tdb.stop(); });

  it('createProject persists and returns the row', async () => {
    const p = await createProject(tdb.db, { name: 'my-app', defaultPersonas: ['happy-rusher'] });
    expect(p.name).toBe('my-app');
    expect(p.defaultPersonas).toEqual(['happy-rusher']);
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('getProjectById returns null for a missing id', async () => {
    const p = await getProjectById(tdb.db, '00000000-0000-0000-0000-000000000000');
    expect(p).toBeNull();
  });

  it('getProjectById returns the row for an existing id', async () => {
    const created = await createProject(tdb.db, { name: 'another' });
    const fetched = await getProjectById(tdb.db, created.id);
    expect(fetched?.name).toBe('another');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && npm test -- tests/models/projects.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement the projects repo**

Create `backend/src/models/projects.ts`:

```typescript
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { projects, type Project } from '../db/schema.js';

export interface CreateProjectInput {
  name: string;
  defaultPersonas?: string[];
}

export async function createProject(db: Db, input: CreateProjectInput): Promise<Project> {
  const rows = await db
    .insert(projects)
    .values({
      name: input.name,
      defaultPersonas: input.defaultPersonas ?? [],
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('createProject returned no rows');
  return row;
}

export async function getProjectById(db: Db, id: string): Promise<Project | null> {
  const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return rows[0] ?? null;
}
```

- [ ] **Step 4: Verify pass**

```bash
cd backend && npm test -- tests/models/projects.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/models/projects.ts backend/tests/models/projects.test.ts
git commit -m "feat(backend): add projects model with create/get"
```

---

## Task 12: Runs repo — create a run + skeleton sessions (TDD)

**Files:**
- Create: `backend/src/models/runs.ts`
- Create: `backend/tests/models/runs.test.ts`

A run is created with one `session` per persona, all in `status='queued'`. Sessions are skeletons — they don't get a `started_state_id` until the agent actually runs in Plan 3.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/models/runs.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestDb, type TestDb } from '../helpers/test-db.js';
import { createProject } from '../../src/models/projects.js';
import { createRun, getRunById } from '../../src/models/runs.js';

describe('runs model', () => {
  let tdb: TestDb;
  beforeAll(async () => { tdb = await startTestDb(); }, 90000);
  afterAll(async () => { await tdb.stop(); });

  it('createRun persists the run and one session per persona', async () => {
    const project = await createProject(tdb.db, { name: 'r-app' });
    const run = await createRun(tdb.db, {
      projectId: project.id,
      apkUrl: 'file:///tmp/x.apk',
      traceUrl: 'file:///tmp/x.json',
      intent: 'check checkout',
      personas: ['happy-rusher', 'low-vision'],
      mode: 'exploration',
    });

    expect(run.run.projectId).toBe(project.id);
    expect(run.run.status).toBe('queued');
    expect(run.run.mode).toBe('exploration');
    expect(run.sessions).toHaveLength(2);
    const personaIds = run.sessions.map((s) => s.personaId).sort();
    expect(personaIds).toEqual(['happy-rusher', 'low-vision']);
    expect(run.sessions.every((s) => s.status === 'running')).toBe(true);
  });

  it('getRunById returns the run with its sessions', async () => {
    const project = await createProject(tdb.db, { name: 'r-app-2' });
    const created = await createRun(tdb.db, {
      projectId: project.id,
      apkUrl: 'file:///a.apk',
      traceUrl: 'file:///t.json',
      personas: ['first-timer'],
      mode: 'exploration',
    });
    const fetched = await getRunById(tdb.db, created.run.id);
    expect(fetched?.run.id).toBe(created.run.id);
    expect(fetched?.sessions).toHaveLength(1);
    expect(fetched?.sessions[0]?.personaId).toBe('first-timer');
  });

  it('getRunById returns null for missing id', async () => {
    const fetched = await getRunById(tdb.db, '00000000-0000-0000-0000-000000000000');
    expect(fetched).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && npm test -- tests/models/runs.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the runs repo**

Create `backend/src/models/runs.ts`:

```typescript
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { runs, sessions, type Run, type Session } from '../db/schema.js';

export interface CreateRunInput {
  projectId: string;
  apkUrl: string;
  traceUrl: string;
  intent?: string;
  personas: string[];
  mode: 'exploration' | 'verification';
}

export interface RunWithSessions {
  run: Run;
  sessions: Session[];
}

export async function createRun(db: Db, input: CreateRunInput): Promise<RunWithSessions> {
  return await db.transaction(async (tx) => {
    const runRows = await tx
      .insert(runs)
      .values({
        projectId: input.projectId,
        apkUrl: input.apkUrl,
        traceUrl: input.traceUrl,
        intent: input.intent,
        personas: input.personas,
        mode: input.mode,
        status: 'queued',
      })
      .returning();
    const run = runRows[0];
    if (!run) throw new Error('createRun: insert returned no rows');

    const sessionRows =
      input.personas.length === 0
        ? []
        : await tx
            .insert(sessions)
            .values(
              input.personas.map((personaId) => ({
                runId: run.id,
                personaId,
                status: 'running' as const,
              })),
            )
            .returning();

    return { run, sessions: sessionRows };
  });
}

export async function getRunById(db: Db, id: string): Promise<RunWithSessions | null> {
  const runRow = (await db.select().from(runs).where(eq(runs.id, id)).limit(1))[0];
  if (!runRow) return null;
  const sessionRows = await db.select().from(sessions).where(eq(sessions.runId, runRow.id));
  return { run: runRow, sessions: sessionRows };
}
```

- [ ] **Step 4: Verify pass**

```bash
cd backend && npm test -- tests/models/runs.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/models/runs.ts backend/tests/models/runs.test.ts
git commit -m "feat(backend): add runs model with skeleton-session creation"
```

---

## Task 13: Trace bundle Zod schema (TDD)

**Files:**
- Create: `backend/src/lib/trace-schema.ts`
- Create: `backend/tests/lib/trace-schema.test.ts`

The trace bundle is what the CLI (Plan 2) uploads. We define the v1 wire format here, validate fully on ingestion.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/lib/trace-schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { traceBundleV1Schema, type TraceBundleV1 } from '../../src/lib/trace-schema.js';

describe('traceBundleV1Schema', () => {
  const valid: TraceBundleV1 = {
    version: 1,
    recorded_at: '2026-05-12T10:00:00.000Z',
    flow_name: 'checkout',
    actions: [
      { type: 'launch', timestamp_ms: 0 },
      { type: 'tap', target: { selector: 'Login' }, timestamp_ms: 1500 },
    ],
    states: [
      {
        after_action_index: 0,
        screenshot_path: 'screens/0.png',
        ui_tree: { type: 'root' },
        timestamp_ms: 100,
      },
    ],
  };

  it('accepts a valid bundle', () => {
    const result = traceBundleV1Schema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects wrong version', () => {
    const r = traceBundleV1Schema.safeParse({ ...valid, version: 2 });
    expect(r.success).toBe(false);
  });

  it('rejects unknown action type', () => {
    const r = traceBundleV1Schema.safeParse({
      ...valid,
      actions: [{ type: 'teleport', timestamp_ms: 0 }],
    });
    expect(r.success).toBe(false);
  });

  it('accepts an optional intent', () => {
    const r = traceBundleV1Schema.safeParse({ ...valid, intent: 'verify happy path' });
    expect(r.success).toBe(true);
  });

  it('rejects negative timestamps', () => {
    const r = traceBundleV1Schema.safeParse({
      ...valid,
      actions: [{ type: 'launch', timestamp_ms: -1 }],
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && npm test -- tests/lib/trace-schema.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the schema**

Create `backend/src/lib/trace-schema.ts`:

```typescript
import { z } from 'zod';

export const actionTypeSchema = z.enum([
  'launch',
  'tap',
  'swipe',
  'input',
  'wait',
  'back',
  'home',
]);

export const actionSchema = z.object({
  type: actionTypeSchema,
  target: z.record(z.unknown()).optional(),
  value: z.string().optional(),
  timestamp_ms: z.number().int().nonnegative(),
});

export const stateSnapshotSchema = z.object({
  after_action_index: z.number().int().nonnegative(),
  screenshot_path: z.string().min(1),
  ui_tree: z.record(z.unknown()),
  timestamp_ms: z.number().int().nonnegative(),
});

export const logLineSchema = z.object({
  level: z.enum(['verbose', 'debug', 'info', 'warn', 'error', 'fatal']),
  tag: z.string(),
  message: z.string(),
  timestamp_ms: z.number().int().nonnegative(),
});

export const traceBundleV1Schema = z.object({
  version: z.literal(1),
  recorded_at: z.string().datetime(),
  flow_name: z.string().min(1),
  intent: z.string().optional(),
  actions: z.array(actionSchema),
  states: z.array(stateSnapshotSchema),
  logs: z.array(logLineSchema).optional(),
});

export type TraceBundleV1 = z.infer<typeof traceBundleV1Schema>;
export type ActionV1 = z.infer<typeof actionSchema>;
export type StateSnapshotV1 = z.infer<typeof stateSnapshotSchema>;
```

- [ ] **Step 4: Verify pass**

```bash
cd backend && npm test -- tests/lib/trace-schema.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/trace-schema.ts backend/tests/lib/trace-schema.test.ts
git commit -m "feat(backend): add Zod schema for trace bundle v1"
```

---

## Task 14: Local file storage adapter (TDD)

**Files:**
- Create: `backend/src/storage/adapter.ts`
- Create: `backend/src/storage/local.ts`
- Create: `backend/tests/storage/local.test.ts`

The adapter holds the APK and the trace.json on disk under `storageDir/runs/<run-id>/`. Returns `file://` URLs that get stored in `runs.apk_url` / `runs.trace_url`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/storage/local.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorageAdapter } from '../../src/storage/local.js';

describe('LocalStorageAdapter', () => {
  let dir: string;
  let adapter: LocalStorageAdapter;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'scout-storage-'));
    adapter = new LocalStorageAdapter(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('saveApk writes the buffer and returns a file:// URL', async () => {
    const url = await adapter.saveApk('run-abc', Buffer.from('PKfake-apk-content'));
    expect(url).toMatch(/^file:\/\//);
    expect(url).toContain('run-abc');
    expect(url).toMatch(/\.apk$/);
    const path = url.replace('file://', '');
    const written = await readFile(path);
    expect(written.toString()).toBe('PKfake-apk-content');
  });

  it('saveTrace writes JSON and returns a file:// URL', async () => {
    const url = await adapter.saveTrace('run-xyz', { version: 1, hello: 'world' });
    expect(url).toMatch(/^file:\/\//);
    expect(url).toMatch(/\.json$/);
    const path = url.replace('file://', '');
    const written = JSON.parse((await readFile(path)).toString());
    expect(written).toEqual({ version: 1, hello: 'world' });
  });

  it('rejects empty run id', async () => {
    await expect(adapter.saveApk('', Buffer.from('x'))).rejects.toThrow(/run id/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && npm test -- tests/storage/local.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the adapter interface**

Create `backend/src/storage/adapter.ts`:

```typescript
export interface StorageAdapter {
  saveApk(runId: string, content: Buffer): Promise<string>;
  saveTrace(runId: string, content: unknown): Promise<string>;
}
```

- [ ] **Step 4: Implement the local adapter**

Create `backend/src/storage/local.ts`:

```typescript
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { StorageAdapter } from './adapter.js';

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly baseDir: string) {}

  async saveApk(runId: string, content: Buffer): Promise<string> {
    if (!runId) throw new Error('run id is required');
    const dir = resolve(this.baseDir, 'runs', runId);
    await mkdir(dir, { recursive: true });
    const path = join(dir, 'app.apk');
    await writeFile(path, content);
    return `file://${path}`;
  }

  async saveTrace(runId: string, content: unknown): Promise<string> {
    if (!runId) throw new Error('run id is required');
    const dir = resolve(this.baseDir, 'runs', runId);
    await mkdir(dir, { recursive: true });
    const path = join(dir, 'trace.json');
    await writeFile(path, JSON.stringify(content, null, 2));
    return `file://${path}`;
  }
}
```

- [ ] **Step 5: Verify pass**

```bash
cd backend && npm test -- tests/storage/local.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/storage/adapter.ts backend/src/storage/local.ts backend/tests/storage/local.test.ts
git commit -m "feat(backend): add LocalStorageAdapter with file:// URLs"
```

---

## Task 15: API key auth pre-handler (TDD)

**Files:**
- Create: `backend/src/auth/api-key.ts`
- Create: `backend/src/lib/errors.ts`
- Create: `backend/tests/routes/auth.test.ts`

- [ ] **Step 1: Write the failing test**

The auth hook should:
- Allow requests to `/health` without a key
- Reject requests to anything else without the header → 401
- Reject requests with a wrong key → 401
- Allow requests with a correct key

Create `backend/tests/routes/auth.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { registerApiKeyAuth } from '../../src/auth/api-key.js';

async function makeApp(apiKey: string) {
  const app = Fastify({ logger: false });
  await registerApiKeyAuth(app, { apiKey });
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/protected', async () => ({ ok: true }));
  return app;
}

describe('api key auth', () => {
  it('allows /health without a key', async () => {
    const app = await makeApp('secret');
    const r = await app.inject({ method: 'GET', url: '/health' });
    expect(r.statusCode).toBe(200);
    await app.close();
  });

  it('rejects protected route with no key', async () => {
    const app = await makeApp('secret');
    const r = await app.inject({ method: 'GET', url: '/protected' });
    expect(r.statusCode).toBe(401);
    expect(r.json()).toMatchObject({ error: 'unauthorized' });
    await app.close();
  });

  it('rejects protected route with wrong key', async () => {
    const app = await makeApp('secret');
    const r = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { 'x-scout-api-key': 'wrong' },
    });
    expect(r.statusCode).toBe(401);
    await app.close();
  });

  it('allows protected route with correct key', async () => {
    const app = await makeApp('secret');
    const r = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { 'x-scout-api-key': 'secret' },
    });
    expect(r.statusCode).toBe(200);
    await app.close();
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd backend && npm test -- tests/routes/auth.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the error type**

Create `backend/src/lib/errors.ts`:

```typescript
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
```

- [ ] **Step 4: Implement the auth plugin**

Create `backend/src/auth/api-key.ts`:

```typescript
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

const ALLOWLIST = new Set(['/health']);

export interface ApiKeyAuthOptions {
  apiKey: string;
}

export async function registerApiKeyAuth(
  app: FastifyInstance,
  opts: ApiKeyAuthOptions,
): Promise<void> {
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (ALLOWLIST.has(req.url.split('?')[0]!)) return;
    const provided = req.headers['x-scout-api-key'];
    if (typeof provided !== 'string' || provided !== opts.apiKey) {
      await reply.code(401).send({ error: 'unauthorized' });
    }
  });
}
```

- [ ] **Step 5: Verify pass**

```bash
cd backend && npm test -- tests/routes/auth.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/auth/ backend/src/lib/errors.ts backend/tests/routes/auth.test.ts
git commit -m "feat(backend): add X-Scout-API-Key auth pre-handler"
```

---

## Task 16: Wire auth + DB into server.ts; build test-app helper

**Files:**
- Modify: `backend/src/server.ts`
- Create: `backend/tests/helpers/test-app.ts`

`buildServer` now needs the DB handle, the storage adapter, and the API key. The test helper wires a server against the test DB.

- [ ] **Step 1: Update server.ts**

Replace `backend/src/server.ts` with:

```typescript
import Fastify, { type FastifyInstance } from 'fastify';
import { registerApiKeyAuth } from './auth/api-key.js';
import { healthRoutes } from './routes/health.js';
import type { Db } from './db/client.js';
import type { StorageAdapter } from './storage/adapter.js';

export interface ServerDeps {
  apiKey: string;
  db: Db;
  storage: StorageAdapter;
}

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await registerApiKeyAuth(app, { apiKey: deps.apiKey });
  await app.register(healthRoutes);

  // Make deps available to routes through decorators.
  app.decorate('db', deps.db);
  app.decorate('storage', deps.storage);

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    storage: StorageAdapter;
  }
}
```

- [ ] **Step 2: Build the test-app helper**

Create `backend/tests/helpers/test-app.ts`:

```typescript
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../../src/server.js';
import { LocalStorageAdapter } from '../../src/storage/local.js';
import { startTestDb, type TestDb } from './test-db.js';
import type { FastifyInstance } from 'fastify';

export interface TestApp {
  app: FastifyInstance;
  tdb: TestDb;
  storageDir: string;
  apiKey: string;
  close: () => Promise<void>;
}

export async function startTestApp(): Promise<TestApp> {
  const tdb = await startTestDb();
  const storageDir = await mkdtemp(join(tmpdir(), 'scout-storage-'));
  const storage = new LocalStorageAdapter(storageDir);
  const apiKey = 'test-api-key';
  const app = await buildServer({ apiKey, db: tdb.db, storage });

  return {
    app,
    tdb,
    storageDir,
    apiKey,
    close: async () => {
      await app.close();
      await tdb.stop();
      await rm(storageDir, { recursive: true, force: true });
    },
  };
}
```

- [ ] **Step 3: Update the existing health.test.ts to use the new buildServer signature**

Replace `backend/tests/routes/health.test.ts` with:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestApp, type TestApp } from '../helpers/test-app.js';

describe('GET /health', () => {
  let t: TestApp;
  beforeAll(async () => { t = await startTestApp(); }, 90000);
  afterAll(async () => { await t.close(); });

  it('returns 200 with status ok and does not require auth', async () => {
    const r = await t.app.inject({ method: 'GET', url: '/health' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 4: Run tests**

```bash
cd backend && npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/server.ts backend/tests/helpers/test-app.ts backend/tests/routes/health.test.ts
git commit -m "feat(backend): inject DB + storage into server; add test-app helper"
```

---

## Task 17: POST /projects + GET /projects/:id (TDD)

**Files:**
- Create: `backend/src/routes/projects.ts`
- Modify: `backend/src/server.ts`
- Create: `backend/tests/routes/projects.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/routes/projects.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestApp, type TestApp } from '../helpers/test-app.js';

describe('projects routes', () => {
  let t: TestApp;
  beforeAll(async () => { t = await startTestApp(); }, 90000);
  afterAll(async () => { await t.close(); });

  it('POST /projects creates and returns a project', async () => {
    const r = await t.app.inject({
      method: 'POST',
      url: '/projects',
      headers: { 'x-scout-api-key': t.apiKey, 'content-type': 'application/json' },
      payload: { name: 'demo-app', default_personas: ['happy-rusher'] },
    });
    expect(r.statusCode).toBe(201);
    const body = r.json();
    expect(body.name).toBe('demo-app');
    expect(body.default_personas).toEqual(['happy-rusher']);
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('POST /projects rejects missing name', async () => {
    const r = await t.app.inject({
      method: 'POST',
      url: '/projects',
      headers: { 'x-scout-api-key': t.apiKey, 'content-type': 'application/json' },
      payload: { default_personas: [] },
    });
    expect(r.statusCode).toBe(400);
  });

  it('GET /projects/:id returns 404 for missing', async () => {
    const r = await t.app.inject({
      method: 'GET',
      url: '/projects/00000000-0000-0000-0000-000000000000',
      headers: { 'x-scout-api-key': t.apiKey },
    });
    expect(r.statusCode).toBe(404);
  });

  it('GET /projects/:id returns the project for existing', async () => {
    const created = await t.app.inject({
      method: 'POST',
      url: '/projects',
      headers: { 'x-scout-api-key': t.apiKey, 'content-type': 'application/json' },
      payload: { name: 'fetchable' },
    });
    const { id } = created.json();
    const r = await t.app.inject({
      method: 'GET',
      url: `/projects/${id}`,
      headers: { 'x-scout-api-key': t.apiKey },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().name).toBe('fetchable');
  });

  it('GET /projects/:id without api key returns 401', async () => {
    const r = await t.app.inject({
      method: 'GET',
      url: '/projects/00000000-0000-0000-0000-000000000000',
    });
    expect(r.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd backend && npm test -- tests/routes/projects.test.ts
```

Expected: FAIL (routes not found → 404 for all).

- [ ] **Step 3: Implement the routes**

Create `backend/src/routes/projects.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createProject, getProjectById } from '../models/projects.js';

const createProjectBody = z.object({
  name: z.string().min(1),
  default_personas: z.array(z.string()).optional(),
});

const idParam = z.object({ id: z.string().uuid() });

export async function projectsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/projects', async (req, reply) => {
    const parsed = createProjectBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'bad_request', issues: parsed.error.issues });
    }
    const project = await createProject(app.db, {
      name: parsed.data.name,
      defaultPersonas: parsed.data.default_personas,
    });
    return reply.code(201).send({
      id: project.id,
      name: project.name,
      default_personas: project.defaultPersonas,
      created_at: project.createdAt.toISOString(),
    });
  });

  app.get('/projects/:id', async (req, reply) => {
    const parsed = idParam.safeParse(req.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'bad_request' });
    }
    const project = await getProjectById(app.db, parsed.data.id);
    if (!project) return reply.code(404).send({ error: 'not_found' });
    return reply.code(200).send({
      id: project.id,
      name: project.name,
      default_personas: project.defaultPersonas,
      created_at: project.createdAt.toISOString(),
    });
  });
}
```

- [ ] **Step 4: Register the routes**

In `backend/src/server.ts`, add the import and register call. Replace the existing `buildServer` function body with:

```typescript
import { projectsRoutes } from './routes/projects.js';
// existing imports stay

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await registerApiKeyAuth(app, { apiKey: deps.apiKey });
  app.decorate('db', deps.db);
  app.decorate('storage', deps.storage);
  await app.register(healthRoutes);
  await app.register(projectsRoutes);
  return app;
}
```

- [ ] **Step 5: Verify pass**

```bash
cd backend && npm test -- tests/routes/projects.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/projects.ts backend/src/server.ts backend/tests/routes/projects.test.ts
git commit -m "feat(backend): add POST /projects and GET /projects/:id"
```

---

## Task 18: POST /runs — multipart upload + validation + persistence (TDD)

**Files:**
- Modify: `backend/package.json` (add `@fastify/multipart` is already declared; just ensure registration)
- Create: `backend/src/routes/runs.ts`
- Modify: `backend/src/server.ts`
- Create: `backend/tests/routes/runs.test.ts`

POST /runs accepts a multipart payload with three parts:
- `apk` — the APK file (binary)
- `trace` — the trace bundle (JSON-encoded string)
- `metadata` — JSON string with `{ project_id, mode, personas, intent? }`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/routes/runs.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestApp, type TestApp } from '../helpers/test-app.js';
import { readFile } from 'node:fs/promises';

async function createProjectFor(t: TestApp): Promise<string> {
  const r = await t.app.inject({
    method: 'POST',
    url: '/projects',
    headers: { 'x-scout-api-key': t.apiKey, 'content-type': 'application/json' },
    payload: { name: 'runs-test' },
  });
  return r.json().id;
}

function buildMultipart(parts: Array<{ name: string; data: Buffer; filename?: string; contentType?: string }>): { body: Buffer; contentType: string } {
  const boundary = '----scout-test-boundary-' + Math.random().toString(36).slice(2);
  const chunks: Buffer[] = [];
  for (const p of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    const disposition = p.filename
      ? `form-data; name="${p.name}"; filename="${p.filename}"`
      : `form-data; name="${p.name}"`;
    chunks.push(Buffer.from(`Content-Disposition: ${disposition}\r\n`));
    chunks.push(Buffer.from(`Content-Type: ${p.contentType ?? 'application/octet-stream'}\r\n\r\n`));
    chunks.push(p.data);
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe('POST /runs', () => {
  let t: TestApp;
  beforeAll(async () => { t = await startTestApp(); }, 90000);
  afterAll(async () => { await t.close(); });

  it('creates a run, persists APK + trace, returns run with sessions', async () => {
    const projectId = await createProjectFor(t);
    const trace = {
      version: 1,
      recorded_at: '2026-05-12T10:00:00.000Z',
      flow_name: 'checkout',
      actions: [{ type: 'launch', timestamp_ms: 0 }],
      states: [{ after_action_index: 0, screenshot_path: 's/0.png', ui_tree: {}, timestamp_ms: 100 }],
    };
    const metadata = {
      project_id: projectId,
      mode: 'exploration',
      personas: ['happy-rusher', 'low-vision'],
      intent: 'verify checkout',
    };
    const { body, contentType } = buildMultipart([
      { name: 'apk', data: Buffer.from('PKfake'), filename: 'app.apk', contentType: 'application/vnd.android.package-archive' },
      { name: 'trace', data: Buffer.from(JSON.stringify(trace)), contentType: 'application/json' },
      { name: 'metadata', data: Buffer.from(JSON.stringify(metadata)), contentType: 'application/json' },
    ]);

    const r = await t.app.inject({
      method: 'POST',
      url: '/runs',
      headers: { 'x-scout-api-key': t.apiKey, 'content-type': contentType },
      payload: body,
    });

    expect(r.statusCode).toBe(201);
    const json = r.json();
    expect(json.run.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(json.run.project_id).toBe(projectId);
    expect(json.run.status).toBe('queued');
    expect(json.run.mode).toBe('exploration');
    expect(json.sessions).toHaveLength(2);
    expect(json.run.apk_url).toMatch(/^file:\/\//);
    expect(json.run.trace_url).toMatch(/^file:\/\//);

    // verify the APK was actually written
    const apkPath = json.run.apk_url.replace('file://', '');
    const apkContent = await readFile(apkPath);
    expect(apkContent.toString()).toBe('PKfake');
  });

  it('rejects when metadata is missing', async () => {
    const projectId = await createProjectFor(t);
    const { body, contentType } = buildMultipart([
      { name: 'apk', data: Buffer.from('x'), filename: 'a.apk' },
      { name: 'trace', data: Buffer.from(JSON.stringify({
          version: 1, recorded_at: '2026-05-12T00:00:00.000Z', flow_name: 'f', actions: [], states: [],
        })), contentType: 'application/json' },
    ]);
    const r = await t.app.inject({
      method: 'POST', url: '/runs',
      headers: { 'x-scout-api-key': t.apiKey, 'content-type': contentType },
      payload: body,
    });
    expect(r.statusCode).toBe(400);
    void projectId;
  });

  it('rejects when trace bundle is invalid', async () => {
    const projectId = await createProjectFor(t);
    const { body, contentType } = buildMultipart([
      { name: 'apk', data: Buffer.from('x'), filename: 'a.apk' },
      { name: 'trace', data: Buffer.from(JSON.stringify({ version: 99 })), contentType: 'application/json' },
      { name: 'metadata', data: Buffer.from(JSON.stringify({ project_id: projectId, mode: 'exploration', personas: ['happy-rusher'] })), contentType: 'application/json' },
    ]);
    const r = await t.app.inject({
      method: 'POST', url: '/runs',
      headers: { 'x-scout-api-key': t.apiKey, 'content-type': contentType },
      payload: body,
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('invalid_trace');
  });

  it('rejects when project_id does not exist', async () => {
    const trace = { version: 1, recorded_at: '2026-05-12T00:00:00.000Z', flow_name: 'f', actions: [], states: [] };
    const { body, contentType } = buildMultipart([
      { name: 'apk', data: Buffer.from('x'), filename: 'a.apk' },
      { name: 'trace', data: Buffer.from(JSON.stringify(trace)), contentType: 'application/json' },
      { name: 'metadata', data: Buffer.from(JSON.stringify({ project_id: '00000000-0000-0000-0000-000000000000', mode: 'exploration', personas: ['happy-rusher'] })), contentType: 'application/json' },
    ]);
    const r = await t.app.inject({
      method: 'POST', url: '/runs',
      headers: { 'x-scout-api-key': t.apiKey, 'content-type': contentType },
      payload: body,
    });
    expect(r.statusCode).toBe(404);
    expect(r.json().error).toBe('project_not_found');
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd backend && npm test -- tests/routes/runs.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the route**

Create `backend/src/routes/runs.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { traceBundleV1Schema } from '../lib/trace-schema.js';
import { createRun, getRunById } from '../models/runs.js';
import { getProjectById } from '../models/projects.js';

const metadataSchema = z.object({
  project_id: z.string().uuid(),
  mode: z.enum(['exploration', 'verification']),
  personas: z.array(z.string().min(1)).min(1),
  intent: z.string().optional(),
});

const idParam = z.object({ id: z.string().uuid() });

export async function runsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/runs', async (req, reply) => {
    if (!req.isMultipart()) {
      return reply.code(400).send({ error: 'bad_request', detail: 'multipart required' });
    }

    let apkBuffer: Buffer | undefined;
    let traceRaw: string | undefined;
    let metadataRaw: string | undefined;

    for await (const part of req.parts()) {
      if (part.type === 'file' && part.fieldname === 'apk') {
        apkBuffer = await part.toBuffer();
      } else if (part.type === 'field' && part.fieldname === 'trace') {
        traceRaw = String(part.value);
      } else if (part.type === 'field' && part.fieldname === 'metadata') {
        metadataRaw = String(part.value);
      } else if (part.type === 'file' && part.fieldname === 'trace') {
        // tolerate clients that upload trace as a file
        traceRaw = (await part.toBuffer()).toString('utf-8');
      } else if (part.type === 'file' && part.fieldname === 'metadata') {
        metadataRaw = (await part.toBuffer()).toString('utf-8');
      }
    }

    if (!apkBuffer || !traceRaw || !metadataRaw) {
      return reply
        .code(400)
        .send({ error: 'bad_request', detail: 'apk, trace, and metadata parts are all required' });
    }

    let metadataJson: unknown;
    let traceJson: unknown;
    try {
      metadataJson = JSON.parse(metadataRaw);
      traceJson = JSON.parse(traceRaw);
    } catch {
      return reply.code(400).send({ error: 'bad_request', detail: 'metadata or trace not valid JSON' });
    }

    const metadata = metadataSchema.safeParse(metadataJson);
    if (!metadata.success) {
      return reply.code(400).send({ error: 'bad_request', issues: metadata.error.issues });
    }

    const trace = traceBundleV1Schema.safeParse(traceJson);
    if (!trace.success) {
      return reply.code(400).send({ error: 'invalid_trace', issues: trace.error.issues });
    }

    const project = await getProjectById(app.db, metadata.data.project_id);
    if (!project) {
      return reply.code(404).send({ error: 'project_not_found' });
    }

    const runId = randomUUID();
    const apkUrl = await app.storage.saveApk(runId, apkBuffer);
    const traceUrl = await app.storage.saveTrace(runId, trace.data);

    const result = await createRun(app.db, {
      projectId: project.id,
      apkUrl,
      traceUrl,
      intent: metadata.data.intent,
      personas: metadata.data.personas,
      mode: metadata.data.mode,
    });

    return reply.code(201).send({
      run: {
        id: result.run.id,
        project_id: result.run.projectId,
        apk_url: result.run.apkUrl,
        trace_url: result.run.traceUrl,
        intent: result.run.intent,
        personas: result.run.personas,
        mode: result.run.mode,
        status: result.run.status,
        created_at: result.run.createdAt.toISOString(),
      },
      sessions: result.sessions.map((s) => ({
        id: s.id,
        persona_id: s.personaId,
        status: s.status,
      })),
    });
  });

  app.get('/runs/:id', async (req, reply) => {
    const parsed = idParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const result = await getRunById(app.db, parsed.data.id);
    if (!result) return reply.code(404).send({ error: 'not_found' });
    return reply.send({
      run: {
        id: result.run.id,
        project_id: result.run.projectId,
        apk_url: result.run.apkUrl,
        trace_url: result.run.traceUrl,
        intent: result.run.intent,
        personas: result.run.personas,
        mode: result.run.mode,
        status: result.run.status,
        created_at: result.run.createdAt.toISOString(),
      },
      sessions: result.sessions.map((s) => ({
        id: s.id,
        persona_id: s.personaId,
        status: s.status,
      })),
    });
  });
}
```

- [ ] **Step 4: Register the multipart plugin and runs routes in server.ts**

Replace `backend/src/server.ts` with:

```typescript
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import { registerApiKeyAuth } from './auth/api-key.js';
import { healthRoutes } from './routes/health.js';
import { projectsRoutes } from './routes/projects.js';
import { runsRoutes } from './routes/runs.js';
import type { Db } from './db/client.js';
import type { StorageAdapter } from './storage/adapter.js';

export interface ServerDeps {
  apiKey: string;
  db: Db;
  storage: StorageAdapter;
}

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 500 * 1024 * 1024, // 500MB cap for APK
      files: 5,
    },
  });
  await registerApiKeyAuth(app, { apiKey: deps.apiKey });
  app.decorate('db', deps.db);
  app.decorate('storage', deps.storage);
  await app.register(healthRoutes);
  await app.register(projectsRoutes);
  await app.register(runsRoutes);
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    storage: StorageAdapter;
  }
}
```

- [ ] **Step 5: Verify pass**

```bash
cd backend && npm test -- tests/routes/runs.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 6: Run the full suite**

```bash
cd backend && npm test
```

Expected: every test passes.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/runs.ts backend/src/server.ts backend/tests/routes/runs.test.ts
git commit -m "feat(backend): add POST /runs and GET /runs/:id with multipart APK + trace ingestion"
```

---

## Task 19: Wire main.ts entrypoint

**Files:**
- Create: `backend/src/main.ts`

- [ ] **Step 1: Implement main.ts**

Create `backend/src/main.ts`:

```typescript
import { loadConfig } from './config.js';
import { createDbHandle } from './db/client.js';
import { LocalStorageAdapter } from './storage/local.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const { db, close } = createDbHandle(config.databaseUrl);
  const storage = new LocalStorageAdapter(config.storageDir);
  const app = await buildServer({ apiKey: config.apiKey, db, storage });

  await app.listen({ host: '0.0.0.0', port: config.port });
  console.log(`scout backend listening on :${config.port}`);

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`received ${signal}, shutting down`);
    await app.close();
    await close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('fatal error', err);
  process.exit(1);
});
```

- [ ] **Step 2: Typecheck and build**

```bash
cd backend && npm run typecheck && npm run build
```

Expected: no errors. `dist/main.js` exists.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main.ts
git commit -m "feat(backend): add main.ts entrypoint with graceful shutdown"
```

---

## Task 20: README, smoke test doc, and final verification

**Files:**
- Create: `backend/README.md`
- Create: `backend/docs/smoke-test.md`

- [ ] **Step 1: Write the backend README**

Create `backend/README.md`:

```markdown
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
```

- [ ] **Step 2: Write the smoke test doc**

Create `backend/docs/smoke-test.md`:

```markdown
# Backend smoke test

End-to-end manual verification. Assumes the server is running on `localhost:3000` with `SCOUT_API_KEY=test-key`.

## 1. Health

```bash
curl -s http://localhost:3000/health
# {"status":"ok"}
```

## 2. Create a project

```bash
curl -s -X POST http://localhost:3000/projects \
  -H "x-scout-api-key: test-key" \
  -H "content-type: application/json" \
  -d '{"name":"smoke-app","default_personas":["happy-rusher"]}'
```

Save the returned `id` as `PROJECT_ID`.

## 3. Build a minimal trace bundle

```bash
cat > /tmp/trace.json <<'EOF'
{
  "version": 1,
  "recorded_at": "2026-05-12T10:00:00.000Z",
  "flow_name": "smoke",
  "actions": [{"type":"launch","timestamp_ms":0}],
  "states": [{"after_action_index":0,"screenshot_path":"s/0.png","ui_tree":{},"timestamp_ms":100}]
}
EOF

cat > /tmp/metadata.json <<EOF
{"project_id":"$PROJECT_ID","mode":"exploration","personas":["happy-rusher"],"intent":"smoke"}
EOF

# Create a stub APK
printf 'PK\x03\x04smoke' > /tmp/app.apk
```

## 4. Upload a run

```bash
curl -s -X POST http://localhost:3000/runs \
  -H "x-scout-api-key: test-key" \
  -F apk=@/tmp/app.apk \
  -F "trace=$(cat /tmp/trace.json);type=application/json" \
  -F "metadata=$(cat /tmp/metadata.json);type=application/json"
```

The response should contain `run.id`, `run.status: "queued"`, and `sessions[0].persona_id: "happy-rusher"`.

## 5. Fetch the run

```bash
curl -s http://localhost:3000/runs/<run-id> \
  -H "x-scout-api-key: test-key"
```

## 6. Check the filesystem

```bash
ls ./storage/runs/<run-id>/
# Should contain app.apk and trace.json
```
```

- [ ] **Step 3: Run the full test suite one last time**

```bash
cd backend && npm test
```

Expected: every test passes. Note the count — write it down for the commit message.

- [ ] **Step 4: Run typecheck and build**

```bash
cd backend && npm run typecheck && npm run build
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add backend/README.md backend/docs/smoke-test.md
git commit -m "docs(backend): README + smoke test instructions"
```

- [ ] **Step 6: Final verification**

Manually run through the smoke test in `backend/docs/smoke-test.md` against a locally-running server. Confirm: project creation works, run upload returns 201, the APK and trace.json land on disk, GET /runs/:id returns the persisted data.

If the smoke test passes end-to-end, Plan 1 is done. The backend is ready for Plan 2 (the CLI) to start uploading real traces against it.

---

## What this plan does NOT do (and which future plan covers it)

- **No CLI** — Plan 2. The backend is curl-able; the CLI will package real traces.
- **No agent execution** — Plan 3. `runs.status` stays `'queued'` forever in Plan 1. Plan 3 adds the worker that picks queued runs and runs personas.
- **No emulator integration** — Plan 3.
- **No scoring** — Plan 4. `scorecards` and `findings` tables exist but never get rows in Plan 1.
- **No dashboard** — Plan 5.
- **No S3 storage** — kept the `StorageAdapter` interface so Plan 4 or 5 can drop in `S3StorageAdapter` without touching routes.
- **No state-map population** — that's the Cartographer's job in Plan 3.

These omissions are intentional. Plan 1 ships a working, testable backend skeleton that does one thing well: accept runs and persist them.
