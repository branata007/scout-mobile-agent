# Scout Worker + Agent Brain v0 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Scout **worker** — a Node.js process that picks up queued runs from the Plan 1 backend, leases a cloud Android emulator, installs the APK, replays the captured happy path, then autonomously explores from the resulting state with a single LLM-driven persona (`happy-rusher`). Each new state and traversal lands in the Postgres state map. The deliverable is a complete vertical slice: queued run → autonomous exploration → populated map → run marked done.

**Architecture:** A second Node service alongside `backend/` and `cli/`. The worker imports the backend's Drizzle schema and `StorageAdapter` directly (Phase 1 simplification — no internal HTTP layer between worker and backend; both processes talk to the same Postgres). External integrations (emulator pool, LLM, adb) are behind interfaces with fake implementations for tests; real implementations are smoke-tested only.

**Tech Stack:**
- Node.js 22+ (ESM)
- TypeScript 5.x strict mode
- Drizzle ORM 0.36+ (re-uses `backend/src/db/schema.ts`)
- `@anthropic-ai/sdk` 0.30+ for the Director LLM calls
- Native `fetch` for Genymotion Cloud API
- `execFile` for adb (port the AdbClient pattern from `cli/`)
- `sharp` 0.33+ for screenshot decode + downscale (perceptual-hash input)
- Vitest 2.x + `@testcontainers/postgresql` for integration tests
- `pino` 9.x for structured logs
- tsx for dev, `tsc` for build

**Plan position:** This is **Plan 3 of 5** for Scout Phase 1. Plan 1 (backend skeleton) and Plan 2 (CLI + capture daemon) are merged on `main`. Plan 4 (multi-persona + Critic + findings) and Plan 5 (dashboard) follow.

**Deliverable when this plan is done:** With the Plan 1 backend running, the Plan 2 CLI uploads a real Android happy-path trace bundle. The worker (this plan) is started; it claims the run, leases a Genymotion Cloud emulator, replays the captured happy path, runs the `happy-rusher` persona for up to the budget, and writes states/edges/sessions/persona_reports to Postgres. The run status transitions `queued → running → done` (or `failed`/`budget_exhausted`). All unit + integration tests pass. A documented manual e2e against a real Genymotion + real Anthropic API key works end-to-end.

**Important constraints to keep this plan tractable:**
- **One persona only** — `happy-rusher` (built-in). The other defaults (`low-vision`, `first-timer`, `slow-3g`, `chaos-tapper`) come in Plan 4.
- **Sequential execution** — one emulator at a time. Plan 4 adds parallelism.
- **No Critic** — no scorecards, no findings, no LLM-as-judge. Plan 4.
- **No network/perf capture** — adb screencap + uiautomator dump only. Plan 4.
- **No re-exploration UI** — the worker handles `mode='exploration'` only. Plan 5.
- **No edge screenshots** — `runs.mode='exploration'` per the spec means before/after screenshots stay null on edges. State sample screenshots are still captured.

If the plan grows and a task feels like Plan 4 work creeping in, stop and ask.

---

## File Structure

```
scout-mobile-agent/
├── backend/                              # existing (Plan 1)
├── cli/                                  # existing (Plan 2)
├── worker/                               # new
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── .env.example
│   ├── .gitignore
│   ├── README.md
│   ├── docs/
│   │   └── smoke-test.md
│   ├── src/
│   │   ├── main.ts                       # entrypoint — starts the poller loop
│   │   ├── worker.ts                     # Worker class (testable)
│   │   ├── config.ts                     # env validation via Zod
│   │   ├── db.ts                         # shared Drizzle client (re-uses backend schema)
│   │   ├── storage.ts                    # imports backend LocalStorageAdapter
│   │   ├── lib/
│   │   │   ├── errors.ts                 # WorkerError
│   │   │   └── logger.ts                 # pino instance
│   │   ├── trace/
│   │   │   ├── types.ts                  # TraceBundleV1 (same shape as cli + backend Zod)
│   │   │   └── parse.ts                  # loadTraceBundle(storageUrl) → TraceBundleV1
│   │   ├── adb/
│   │   │   ├── client.ts                 # AdbClient interface (port from cli)
│   │   │   ├── exec.ts                   # AdbClientImpl
│   │   │   └── fake.ts                   # FakeAdbClient for tests
│   │   ├── emulator/
│   │   │   ├── pool.ts                   # EmulatorPool interface + EmulatorLease type
│   │   │   ├── genymotion.ts             # GenymotionPool — real impl
│   │   │   └── fake.ts                   # FakeEmulatorPool — for tests
│   │   ├── driver/
│   │   │   ├── driver.ts                 # Driver interface (tap, swipe, input, back, home, wait)
│   │   │   └── adb-driver.ts             # AdbDriver impl on top of AdbClient
│   │   ├── sensor/
│   │   │   ├── phash.ts                  # perceptualHash(buffer): hex string
│   │   │   ├── fingerprint.ts            # uiTreeFingerprint(node): hash
│   │   │   └── observer.ts               # observeState(adb, serial): Observation
│   │   ├── replay/
│   │   │   └── replay.ts                 # replayHappyPath(driver, trace): final Observation
│   │   ├── llm/
│   │   │   ├── client.ts                 # LLMClient interface (chat-style)
│   │   │   ├── anthropic.ts              # AnthropicLLM impl
│   │   │   └── fake.ts                   # FakeLLM — scripted responses
│   │   ├── personas/
│   │   │   ├── types.ts                  # PersonaProfile
│   │   │   └── happy-rusher.ts           # built-in profile
│   │   ├── director/
│   │   │   ├── prompt.ts                 # renderDirectorPrompt(persona, state, history)
│   │   │   ├── parse.ts                  # parseDirectorReply → DirectorAction
│   │   │   └── director.ts               # Director — exposes nextAction()
│   │   ├── cartographer/
│   │   │   ├── dedup.ts                  # isSameState + phash hamming
│   │   │   └── cartographer.ts           # recordState / recordEdge — writes via Drizzle
│   │   ├── session/
│   │   │   └── runner.ts                 # PersonaSessionRunner — the exploration loop
│   │   └── run/
│   │       └── processor.ts              # RunProcessor — claims + runs + finalizes one run
│   └── tests/
│       ├── helpers/
│       │   ├── test-db.ts                # testcontainers Postgres + migrations
│       │   ├── fake-emulator.ts          # ergonomic builder for FakeEmulatorPool
│       │   ├── fake-llm.ts               # ergonomic builder for FakeLLM
│       │   ├── fake-adb.ts               # ergonomic builder for FakeAdbClient
│       │   └── fixtures.ts               # sample TraceBundleV1, UI tree XML, screenshot PNG
│       ├── sensor/
│       │   ├── phash.test.ts
│       │   ├── fingerprint.test.ts
│       │   └── observer.test.ts
│       ├── replay/
│       │   └── replay.test.ts
│       ├── director/
│       │   ├── prompt.test.ts
│       │   ├── parse.test.ts
│       │   └── director.test.ts
│       ├── cartographer/
│       │   ├── dedup.test.ts
│       │   └── cartographer.test.ts
│       ├── session/
│       │   └── runner.test.ts
│       └── run/
│           └── processor.test.ts
└── docs/                                 # existing
```

**Boundary rules:**
- `adb/`, `emulator/`, `llm/` each know one external integration only — no business logic.
- `sensor/`, `replay/`, `director/`, `cartographer/` are pure-ish: they take primitives in (driver, llm, adb), do their job, return results. They don't know about Drizzle except where explicitly noted (Cartographer writes DB rows).
- `session/runner.ts` is the inner loop — it orchestrates `Driver + Observer + Director + Cartographer` for one persona. No DB writes inline; it calls Cartographer.
- `run/processor.ts` is the outer orchestration — claims a run, leases emulator, installs APK, replays happy path, runs the session, finalizes the run. The only place that touches `EmulatorPool`.
- `worker.ts` polls for queued runs and dispatches them to `RunProcessor`. The only entry point with a loop.

**Shared with backend:**
- Worker imports `backend/src/db/schema.ts` (re-export via `worker/src/db.ts`).
- Worker imports `backend/src/storage/local.ts` to read APK + trace bundle by storage URL.
- Worker imports `backend/src/lib/trace-schema.ts` (Zod) for validation when reading the uploaded trace JSON — single source of truth.

Path mapping for those imports is set up in `worker/tsconfig.json` via `paths`.

---

## Task 1: Initialize the worker package

**Files:**
- Create: `worker/package.json`
- Create: `worker/tsconfig.json`
- Create: `worker/vitest.config.ts`
- Create: `worker/.gitignore`
- Create: `worker/.env.example`

- [ ] **Step 1: Create the directory and base files**

```bash
mkdir -p worker/src worker/tests
cd worker
```

`worker/package.json`:

```json
{
  "name": "@scout/worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc",
    "start": "node dist/main.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "drizzle-orm": "^0.36.0",
    "pino": "^9.4.0",
    "postgres": "^3.4.0",
    "sharp": "^0.33.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@testcontainers/postgresql": "^10.13.0",
    "@types/node": "^22.7.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

`worker/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": false,
    "baseUrl": ".",
    "paths": {
      "@backend/*": ["../backend/src/*"]
    }
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

`worker/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: { '@backend': new URL('../backend/src', import.meta.url).pathname },
  },
});
```

`worker/.gitignore`:
```
node_modules/
dist/
.env
.env.local
```

`worker/.env.example`:
```
DATABASE_URL=postgres://scout:scout@localhost:5432/scout
STORAGE_DIR=../backend/storage
ANTHROPIC_API_KEY=sk-ant-...
GENYMOTION_API_KEY=
EMULATOR_POOL=fake             # fake | genymotion
LLM_PROVIDER=anthropic         # anthropic | fake
LOG_LEVEL=info
POLL_INTERVAL_MS=2000
```

- [ ] **Step 2: Install + verify**

```bash
cd worker && npm install
npm run typecheck   # should be clean (no src yet)
```

- [ ] **Step 3: Commit**

```bash
git add worker/package.json worker/tsconfig.json worker/vitest.config.ts worker/.gitignore worker/.env.example
git commit -m "feat(worker): initialize worker package"
```

---

## Task 2: Config + logger + errors

**Files:**
- Create: `worker/src/config.ts`
- Create: `worker/src/lib/logger.ts`
- Create: `worker/src/lib/errors.ts`

- [ ] **Step 1: Implement**

`worker/src/lib/errors.ts`:

```typescript
export class WorkerError extends Error {
  constructor(public readonly code: string, message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'WorkerError';
  }
}
```

`worker/src/lib/logger.ts`:

```typescript
import pino from 'pino';
export const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
```

`worker/src/config.ts`:

```typescript
import { z } from 'zod';

const Env = z.object({
  DATABASE_URL: z.string().url(),
  STORAGE_DIR: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().optional(),
  GENYMOTION_API_KEY: z.string().optional(),
  EMULATOR_POOL: z.enum(['fake', 'genymotion']).default('fake'),
  LLM_PROVIDER: z.enum(['anthropic', 'fake']).default('fake'),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  LOG_LEVEL: z.string().default('info'),
});

export type WorkerConfig = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv): WorkerConfig {
  return Env.parse(env);
}
```

- [ ] **Step 2: Commit**

```bash
git add worker/src/config.ts worker/src/lib/errors.ts worker/src/lib/logger.ts
git commit -m "feat(worker): add config loader + logger + error type"
```

---

## Task 3: DB + storage re-exports (TDD)

**Files:**
- Create: `worker/src/db.ts`
- Create: `worker/src/storage.ts`
- Create: `worker/tests/helpers/test-db.ts`

`worker/src/db.ts` and `storage.ts` are thin re-exports of the backend modules. The test verifies that the schema is reachable and a migration runs cleanly against a fresh testcontainers Postgres.

- [ ] **Step 1: Failing test**

`worker/tests/helpers/test-db.ts`:

```typescript
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { schema } from '../../src/db.js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { resolve } from 'node:path';

export interface TestDb {
  container: StartedPostgreSqlContainer;
  url: string;
  client: postgres.Sql;
  db: ReturnType<typeof drizzle>;
  cleanup: () => Promise<void>;
}

export async function startTestDb(): Promise<TestDb> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();
  const client = postgres(url, { onnotice: () => {} });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: resolve(import.meta.dirname, '../../../backend/migrations') });
  return {
    container, url, client, db,
    cleanup: async () => { await client.end({ timeout: 1 }); await container.stop(); },
  };
}
```

Create a smoke test `worker/tests/db.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestDb, type TestDb } from './helpers/test-db.js';
import { projects } from '../src/db.js';
import { eq } from 'drizzle-orm';

describe('db re-export', () => {
  let t: TestDb;
  beforeAll(async () => { t = await startTestDb(); }, 60_000);
  afterAll(async () => { await t.cleanup(); });

  it('can insert + select via re-exported schema', async () => {
    const [row] = await t.db.insert(projects).values({ name: 'wt' }).returning();
    expect(row?.id).toMatch(/^[0-9a-f-]{36}$/);
    const fetched = await t.db.select().from(projects).where(eq(projects.id, row!.id));
    expect(fetched).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Implement**

`worker/src/db.ts`:

```typescript
export * from '@backend/db/schema.js';
export { schema } from '@backend/db/index.js';
```

(Confirm the actual export shape in `backend/src/db/index.ts`; adapt if different.)

`worker/src/storage.ts`:

```typescript
export { LocalStorageAdapter } from '@backend/storage/local.js';
export type { StorageAdapter } from '@backend/storage/adapter.js';
```

- [ ] **Step 3: Verify pass**

```bash
cd worker && npm test -- tests/db.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add worker/src/db.ts worker/src/storage.ts worker/tests/helpers/test-db.ts worker/tests/db.test.ts
git commit -m "feat(worker): re-export backend schema + storage adapter"
```

---

## Task 4: Trace types + bundle loader (TDD)

**Files:**
- Create: `worker/src/trace/types.ts`
- Create: `worker/src/trace/parse.ts`
- Create: `worker/tests/trace/parse.test.ts`
- Create: `worker/tests/helpers/fixtures.ts`

`loadTraceBundle(storageUrl, adapter)` resolves the storage URL of the uploaded `trace.json`, reads it, validates it with the backend's Zod schema, returns the parsed `TraceBundleV1`.

- [ ] **Step 1: Failing test**

`worker/tests/trace/parse.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTraceBundle } from '../../src/trace/parse.js';
import { LocalStorageAdapter } from '../../src/storage.js';

const minimalTrace = {
  version: 1,
  recorded_at: '2026-05-13T10:00:00.000Z',
  flow_name: 'checkout',
  actions: [{ type: 'launch', timestamp_ms: 0 }],
  states: [{
    after_action_index: 0,
    screenshot_path: 'screens/0.png',
    ui_tree: { tag: 'hierarchy', children: [] },
    timestamp_ms: 100,
  }],
};

describe('loadTraceBundle', () => {
  it('reads + validates a trace bundle from local storage', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'worker-trace-'));
    const path = join(dir, 'trace.json');
    await writeFile(path, JSON.stringify(minimalTrace));
    const adapter = new LocalStorageAdapter(dir);
    const trace = await loadTraceBundle('file://trace.json', adapter);
    expect(trace.flow_name).toBe('checkout');
    expect(trace.actions).toHaveLength(1);
  });

  it('rejects invalid JSON with WorkerError', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'worker-trace-'));
    const path = join(dir, 'trace.json');
    await writeFile(path, '{not json');
    const adapter = new LocalStorageAdapter(dir);
    await expect(loadTraceBundle('file://trace.json', adapter)).rejects.toThrow(/parse/i);
  });
});
```

- [ ] **Step 2: Implement**

`worker/src/trace/types.ts` — re-export the backend Zod schema's inferred type:

```typescript
export type { TraceBundleV1 } from '@backend/lib/trace-schema.js';
```

`worker/src/trace/parse.ts`:

```typescript
import { traceBundleV1Schema } from '@backend/lib/trace-schema.js';
import type { TraceBundleV1 } from './types.js';
import type { StorageAdapter } from '../storage.js';
import { WorkerError } from '../lib/errors.js';

export async function loadTraceBundle(storageUrl: string, adapter: StorageAdapter): Promise<TraceBundleV1> {
  const raw = await adapter.read(storageUrl);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString('utf-8'));
  } catch (e) {
    throw new WorkerError('trace_parse_error', `could not parse trace JSON: ${(e as Error).message}`, e);
  }
  const result = traceBundleV1Schema.safeParse(parsed);
  if (!result.success) {
    throw new WorkerError('trace_invalid', `trace failed validation: ${result.error.message}`);
  }
  return result.data;
}
```

(Adapt to the actual export name in `backend/src/lib/trace-schema.ts`. Confirm `StorageAdapter.read(url)` exists; the Plan 1 LocalStorageAdapter wrote — verify it also reads. If `read()` is missing on the adapter, **add it** in this task: `read(url: string): Promise<Buffer>` on both interface and LocalStorageAdapter. That's the only modification of `backend/` permitted in Plan 3.)

`worker/tests/helpers/fixtures.ts` (used later — stub for now):

```typescript
export const SAMPLE_UI_TREE_XML = `<?xml version="1.0"?><hierarchy>...</hierarchy>`;
export const SAMPLE_TRACE_BUNDLE = { /* full TraceBundleV1 fixture */ };
```

- [ ] **Step 3: Verify pass + commit**

```bash
cd worker && npm test -- tests/trace/parse.test.ts
git add worker/src/trace/ worker/tests/trace/ worker/tests/helpers/fixtures.ts
# also stage backend/src/storage/* if you added .read()
git commit -m "feat(worker): trace bundle loader with Zod validation"
```

---

## Task 5: AdbClient interface + FakeAdbClient (port from cli)

**Files:**
- Create: `worker/src/adb/client.ts`
- Create: `worker/src/adb/exec.ts`
- Create: `worker/src/adb/fake.ts`
- Create: `worker/tests/helpers/fake-adb.ts` (ergonomic wrapper around FakeAdbClient)

Port the existing CLI implementation. The CLI's `cli/src/adb/{client,exec,parse-uitree,parse-logcat}.ts` are the source of truth — copy + adapt. Worker doesn't need `pullApk` (worker installs APK, not pulls); it does need `installApk`, `launchApp`, `tap`, `swipe`, `back`, `home`, `inputText`, `screencap`, `uiautomatorDump`, `devices`.

- [ ] **Step 1: Copy + adapt**

Copy `cli/src/adb/client.ts` → `worker/src/adb/client.ts`. Replace the `pullApk` method with `installApk(serial, apkPath)` (`adb -s <serial> install -r <apkPath>`). Add `launchApp(serial, packageName, mainActivity?)` using `adb shell monkey -p <pkg> -c android.intent.category.LAUNCHER 1` as the default launcher.

Copy `cli/src/adb/exec.ts` → `worker/src/adb/exec.ts` and update for the new interface.

Copy `cli/src/adb/parse-uitree.ts` → `worker/src/adb/parse-uitree.ts` unchanged.

- [ ] **Step 2: FakeAdbClient**

`worker/src/adb/fake.ts`: in-memory FakeAdbClient where you can pre-seed `screencap` results and `uiautomatorDump` results by serial; record every `tap`/`swipe`/etc. call to a journal.

```typescript
export class FakeAdbClient implements AdbClient {
  private screencaps: Map<string, Buffer> = new Map();
  private dumps: Map<string, string> = new Map();
  public journal: Array<{ method: string; args: unknown[] }> = [];
  setScreencap(serial: string, png: Buffer) { this.screencaps.set(serial, png); }
  setDump(serial: string, xml: string) { this.dumps.set(serial, xml); }
  // implement all methods, push to journal, return seeded values
  // ...
}
```

- [ ] **Step 3: Commit**

```bash
git add worker/src/adb/
git commit -m "feat(worker): port AdbClient + add installApk/launchApp"
```

---

## Task 6: EmulatorPool interface + FakeEmulatorPool (TDD)

**Files:**
- Create: `worker/src/emulator/pool.ts`
- Create: `worker/src/emulator/fake.ts`
- Create: `worker/tests/helpers/fake-emulator.ts`
- Create: `worker/tests/emulator/fake.test.ts`

Pool interface:
```typescript
export interface EmulatorLease {
  id: string;
  adbSerial: string;          // e.g. "10.0.0.5:5555"
  androidApiLevel: number;
  release: () => Promise<void>;
}

export interface EmulatorPool {
  lease(profile: { androidApiLevel?: number }): Promise<EmulatorLease>;
}
```

FakeEmulatorPool returns a scripted lease (configurable serial); `release()` is a no-op that records the call. Genymotion impl comes in Task 7.

- [ ] **Step 1: Failing test**

`worker/tests/emulator/fake.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { FakeEmulatorPool } from '../../src/emulator/fake.js';

describe('FakeEmulatorPool', () => {
  it('returns a lease and records release', async () => {
    const pool = new FakeEmulatorPool({ adbSerial: '10.0.0.5:5555' });
    const lease = await pool.lease({});
    expect(lease.adbSerial).toBe('10.0.0.5:5555');
    await lease.release();
    expect(pool.releaseCount).toBe(1);
  });
});
```

- [ ] **Step 2: Implement + verify + commit**

```bash
cd worker && npm test -- tests/emulator/fake.test.ts
git add worker/src/emulator/ worker/tests/emulator/ worker/tests/helpers/fake-emulator.ts
git commit -m "feat(worker): EmulatorPool interface + FakeEmulatorPool"
```

---

## Task 7: GenymotionPool (real impl, no unit tests)

**Files:**
- Create: `worker/src/emulator/genymotion.ts`

Genymotion Cloud REST API client. Endpoints (verify in current Genymotion docs):
- `POST /api/v1/instances` — start an instance with a recipe (Android version)
- `GET /api/v1/instances/:uuid` — poll for `state: 'ONLINE'`
- `POST /api/v1/instances/:uuid/start-adb` — connects ADB; returns `adb_serial`
- `DELETE /api/v1/instances/:uuid` — terminate

```typescript
export class GenymotionPool implements EmulatorPool {
  constructor(private readonly cfg: { apiKey: string; baseUrl?: string; recipe: string }) {}

  async lease(profile: { androidApiLevel?: number }): Promise<EmulatorLease> {
    // POST to create instance, poll until ONLINE, call start-adb, run `adb connect <host:port>`
    // return EmulatorLease with release() that DELETEs
  }
}
```

No unit tests for the real impl. It is exercised in the manual smoke test in Task 20.

- [ ] **Step 1: Implement + typecheck + commit**

```bash
cd worker && npm run typecheck && npm run build
git add worker/src/emulator/genymotion.ts
git commit -m "feat(worker): add GenymotionPool real implementation"
```

---

## Task 8: Driver interface + AdbDriver (TDD)

**Files:**
- Create: `worker/src/driver/driver.ts`
- Create: `worker/src/driver/adb-driver.ts`
- Create: `worker/tests/driver/adb-driver.test.ts`

```typescript
export interface Driver {
  tap(x: number, y: number): Promise<void>;
  swipe(x1: number, y1: number, x2: number, y2: number, durationMs?: number): Promise<void>;
  inputText(text: string): Promise<void>;
  back(): Promise<void>;
  home(): Promise<void>;
  wait(ms: number): Promise<void>;
}
```

`AdbDriver` wraps `AdbClient + serial`. Trivial. Tests use FakeAdbClient and assert the journal.

- [ ] **Step 1: Failing test → implement → verify → commit**

---

## Task 9: Perceptual hash (TDD)

**Files:**
- Create: `worker/src/sensor/phash.ts`
- Create: `worker/tests/sensor/phash.test.ts`

`perceptualHash(buffer: Buffer): string` — 64-bit dHash over an 8x9 grayscale downscale via `sharp`. Returns 16-char hex. Also export `hammingDistance(a, b)`.

Reference algorithm (dHash):
1. Decode PNG with `sharp(buffer).grayscale().resize(9, 8).raw().toBuffer()`
2. For each row, compare adjacent pixels left-to-right; bit = pixel[i] < pixel[i+1]
3. 8 rows × 8 bits = 64 bits → 16 hex chars

Tests:
- Identical PNG → identical hash, hamming distance 0
- Same image with 1px noise → hamming distance ≤ 2
- Solid red vs solid blue → identical greyscale → identical hash (acceptable; this is a known phash limitation; document it)
- All-white vs all-black → hamming 0 vs 0 (both are flat) — write a test asserting the known limitation

- [ ] **Step 1-4: TDD + commit**

---

## Task 10: UI tree fingerprint (TDD)

**Files:**
- Create: `worker/src/sensor/fingerprint.ts`
- Create: `worker/tests/sensor/fingerprint.test.ts`

`uiTreeFingerprint(tree: UiTree): string` — SHA-256 over a normalized JSON serialization:
- Strip `text`, `content-desc`, `bounds`, `index`, `instance` (volatile per-render).
- Keep `class`, `package`, `resource-id`, structure (children count + recursion).
- Canonical key order.

Same tree → same hash. Tree with only text changed → same hash. Tree with one extra button → different hash.

- [ ] **Step 1-4: TDD + commit**

---

## Task 11: State observer (TDD)

**Files:**
- Create: `worker/src/sensor/observer.ts`
- Create: `worker/tests/sensor/observer.test.ts`

`observeState(adb, serial)` calls `screencap` + `uiautomatorDump`, parses, computes hash + fingerprint, returns:

```typescript
export interface Observation {
  screenshot: Buffer;           // PNG
  perceptualHash: string;
  uiTree: UiTree;
  uiTreeFingerprint: string;
  inferredTitle: string | null; // best-effort from text-y nodes
  observedAt: Date;
}
```

`inferredTitle`: walk tree, return the first node's `text` that's between 3-40 chars and looks title-y (no digits-only, no email). Best-effort; null is fine.

Test uses FakeAdbClient with seeded PNG + XML.

- [ ] **Step 1-4: TDD + commit**

---

## Task 12: LLMClient interface + FakeLLM + AnthropicLLM (TDD for interface)

**Files:**
- Create: `worker/src/llm/client.ts`
- Create: `worker/src/llm/fake.ts`
- Create: `worker/src/llm/anthropic.ts`
- Create: `worker/tests/llm/fake.test.ts`

```typescript
export interface LLMMessage { role: 'user' | 'assistant' | 'system'; content: string }
export interface LLMRequest {
  system: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
}
export interface LLMResponse { content: string; usage: { inputTokens: number; outputTokens: number } }

export interface LLMClient {
  complete(req: LLMRequest): Promise<LLMResponse>;
}
```

`FakeLLM`: scripted — `new FakeLLM([response1, response2, ...])` returns them in order; throws if exhausted.

`AnthropicLLM`: uses `@anthropic-ai/sdk`; defaults to `claude-sonnet-4-6` (configurable via env).

Unit test only the FakeLLM contract — Anthropic is smoke-tested at the end.

- [ ] **Step 1-4: TDD + commit**

---

## Task 13: Trace replay (TDD)

**Files:**
- Create: `worker/src/replay/replay.ts`
- Create: `worker/tests/replay/replay.test.ts`

`replayHappyPath(driver, trace)` walks `trace.actions` and dispatches to the appropriate `Driver` method:
- `launch` → driver records nothing (the caller is responsible for `adb.launchApp` before replay)
- `tap` → driver.tap(x, y)
- `swipe` → driver.swipe(...)
- `input` → driver.inputText(value)
- `back` → driver.back()
- `home` → driver.home()
- `wait` → driver.wait(ms)

Between each action, sleep `trace.actions[i+1].timestamp_ms - trace.actions[i].timestamp_ms` (clamped to a max — Plan 3 budget can't be eaten by replay).

Tests use a FakeDriver (in-memory journal) and assert the journal matches the trace.

- [ ] **Step 1-4: TDD + commit**

---

## Task 14: happy-rusher persona profile

**Files:**
- Create: `worker/src/personas/types.ts`
- Create: `worker/src/personas/happy-rusher.ts`

```typescript
export interface PersonaProfile {
  id: string;
  goal: string;
  successCriteria: string[];
  traits: { patience: 'low' | 'med' | 'high'; tapStyle: 'fast' | 'deliberate' };
  systemPrompt: string;
}
```

`happy-rusher.ts` exports a `HAPPY_RUSHER: PersonaProfile` constant whose system prompt instructs the LLM: skim, tap obvious primary CTAs, prefer forward motion, don't dawdle, stop when blocked.

No tests — pure data.

- [ ] **Step 1: Implement + commit**

---

## Task 15: Director prompt rendering + reply parsing (TDD)

**Files:**
- Create: `worker/src/director/prompt.ts`
- Create: `worker/src/director/parse.ts`
- Create: `worker/tests/director/prompt.test.ts`
- Create: `worker/tests/director/parse.test.ts`

**Director's contract:**
- Input: persona profile, current observation (screenshot is omitted from prompt v1 — we send the UI tree as a compact serialization), short action history.
- Output: a JSON object `{ "action": { "type": "tap"|"swipe"|"input"|"back"|"home"|"wait"|"done", ... }, "rationale": string }`.

`renderDirectorPrompt(persona, observation, history)` returns `{ system, messages }`. We instruct the model to output strict JSON (no markdown fences) and provide examples.

`parseDirectorReply(content)` returns `{ action: DirectorAction; rationale: string }` or throws `WorkerError('director_parse', ...)`. Strip ```json fences if present (defensive).

Tests:
- Prompt contains persona goal + UI tree summary
- Parser handles bare JSON, fenced JSON, JSON-with-noise (extract the first `{...}` block)
- Parser rejects missing `action.type`
- All 6 action types parse correctly
- `done` action → terminal

- [ ] **Step 1-4: TDD + commit**

---

## Task 16: Director (TDD with FakeLLM)

**Files:**
- Create: `worker/src/director/director.ts`
- Create: `worker/tests/director/director.test.ts`

```typescript
export class Director {
  constructor(private readonly llm: LLMClient, private readonly persona: PersonaProfile) {}
  async nextAction(state: Observation, history: ActionEntry[]): Promise<DirectorAction>;
}
```

Caches on `(uiTreeFingerprint, persona.id, historyDigest)` for the duration of the session — the spec says cache per state-fingerprint, but a cold session-level cache is enough for Plan 3.

Tests: with `FakeLLM(['{"action":{"type":"tap","x":100,"y":200},"rationale":"primary CTA"}'])`, calling `nextAction(stateA, [])` returns `tap(100,200)`. Calling again with the same state should hit the cache (FakeLLM only had one scripted reply; second call without cache would throw).

- [ ] **Step 1-4: TDD + commit**

---

## Task 17: Cartographer dedup (TDD)

**Files:**
- Create: `worker/src/cartographer/dedup.ts`
- Create: `worker/tests/cartographer/dedup.test.ts`

```typescript
export function isSameState(a: { perceptualHash: string; uiTreeFingerprint: string }, b: { perceptualHash: string; uiTreeFingerprint: string }): { merged: boolean; phashMatch: boolean; treeMatch: boolean };
```

- `phashMatch = hammingDistance(a.perceptualHash, b.perceptualHash) <= 6`
- `treeMatch = a.uiTreeFingerprint === b.uiTreeFingerprint`
- `merged = phashMatch && treeMatch` (conservative AND)

Test the AND truth table + the candidate-similar boundary case (one matches, one doesn't → not merged, but flagged).

- [ ] **Step 1-4: TDD + commit**

---

## Task 18: Cartographer DB writes (TDD with testcontainers)

**Files:**
- Create: `worker/src/cartographer/cartographer.ts`
- Create: `worker/tests/cartographer/cartographer.test.ts`

```typescript
export class Cartographer {
  constructor(private readonly db: Drizzle, private readonly storage: StorageAdapter, private readonly projectId: string) {}

  // Returns the state id (existing or newly created), and writes a candidate_similar_pairs row
  // if exactly one of (phash, treeFingerprint) matches an existing state.
  async recordState(obs: Observation): Promise<{ stateId: string; created: boolean }>;

  // Records an edge from fromStateId to toStateId. Per spec, exploration mode → no edge screenshots.
  async recordEdge(input: { fromStateId: string; toStateId: string; action: DirectorAction; sessionId: string; durationMs: number }): Promise<{ edgeId: string }>;
}
```

`recordState` does a project-scoped scan of existing states, applies `isSameState`, and:
- If a full match exists → bump `visit_count`, update `last_seen_at`, return existing id.
- If no match → upload the screenshot to storage, insert new state row, return new id.
- If partial match → still insert new state, additionally insert into `candidate_similar_pairs`.

Tests use the testcontainers DB. Cases:
- New state → row inserted, screenshot uploaded
- Identical observation → existing state reused, `visit_count` incremented
- Partial match → both states present + one `candidate_similar_pairs` row

- [ ] **Step 1-4: TDD + commit**

---

## Task 19: PersonaSessionRunner — the exploration loop (TDD)

**Files:**
- Create: `worker/src/session/runner.ts`
- Create: `worker/tests/session/runner.test.ts`

```typescript
export interface PersonaSessionInput {
  sessionId: string;
  persona: PersonaProfile;
  driver: Driver;
  adb: AdbClient;
  serial: string;
  director: Director;
  cartographer: Cartographer;
  budget: { maxActions: number; maxDurationMs: number };
  startObservation: Observation;
  startStateId: string;
}

export interface PersonaSessionResult {
  endedStateId: string;
  actionsTaken: number;
  status: 'done' | 'stuck' | 'budget_exhausted' | 'failed';
  reason: string;
}

export async function runPersonaSession(input: PersonaSessionInput): Promise<PersonaSessionResult>;
```

Loop:
1. `currentState = startObservation`; `currentStateId = startStateId`; `actionsTaken = 0`; `stuckCounter = 0`.
2. While `actionsTaken < maxActions && elapsed < maxDurationMs`:
   - `action = await director.nextAction(currentState, history)`
   - If `action.type === 'done'` → break with status `done`.
   - Execute via driver.
   - Wait short settle delay (e.g. 1000ms — configurable).
   - `nextObs = await observeState(adb, serial)`
   - `{ stateId: nextId, created } = await cartographer.recordState(nextObs)`
   - `await cartographer.recordEdge({ fromStateId: currentStateId, toStateId: nextId, action, sessionId, durationMs })`
   - If `nextId === currentStateId` → `stuckCounter++`; else `stuckCounter = 0`.
   - If `stuckCounter >= 5` → break with status `stuck`.
   - `currentState = nextObs; currentStateId = nextId; actionsTaken++`.
3. Return `{ endedStateId: currentStateId, actionsTaken, status, reason }`.

Tests use FakeDriver + FakeAdbClient + a Director wrapped around a scripted FakeLLM + a Cartographer against testcontainers DB. Scenarios:
- Director says `done` after 1 action → status `done`, actionsTaken 1
- Director never produces a new state (every action returns to same fingerprint) → status `stuck` after 5 same-state in a row
- maxActions reached → status `budget_exhausted`

- [ ] **Step 1-4: TDD + commit**

---

## Task 20: RunProcessor — orchestrates one run end-to-end (TDD)

**Files:**
- Create: `worker/src/run/processor.ts`
- Create: `worker/tests/run/processor.test.ts`

```typescript
export class RunProcessor {
  constructor(deps: {
    db: Drizzle;
    storage: StorageAdapter;
    emulatorPool: EmulatorPool;
    llm: LLMClient;
    adbFactory: (serial: string) => AdbClient;   // injectable for tests
    settleMs?: number;
  }) {}

  // Atomically claims a queued run (UPDATE ... WHERE status='queued' RETURNING) and runs it to completion.
  // Returns the final run row, or null if no queued run.
  async claimAndProcess(): Promise<RunRow | null>;
}
```

Flow:
1. Atomically `UPDATE runs SET status='running' WHERE status='queued' ORDER BY created_at LIMIT 1 RETURNING *`.
2. Load `TraceBundleV1` from `run.trace_url` via storage adapter.
3. `lease = await emulatorPool.lease({ androidApiLevel: 30 })`.
4. `try { ... } finally { await lease.release(); }` around everything below.
5. `adb = adbFactory(lease.adbSerial)`. `await adb.installApk(lease.adbSerial, await storage.path(run.apk_url))`.
6. `await adb.launchApp(lease.adbSerial, packageName)` — packageName comes from the project row (denormalize during run creation in Plan 2, or look up from `projects` by `run.project_id` → not stored… **NOTE:** if `projects` doesn't store app_package, this needs a small Plan 1 schema add. Check before writing this task. If missing, add `app_package` to `projects` in a new migration + update Plan 2 `runInit` to pass it. Stage that migration in this commit.)
7. `driver = new AdbDriver(adb, lease.adbSerial)`. `await replayHappyPath(driver, trace)`.
8. `startObs = await observeState(adb, lease.adbSerial)`.
9. `startStateId = (await cartographer.recordState(startObs)).stateId`.
10. Insert a `sessions` row: `{ run_id: run.id, persona_id: 'happy-rusher', started_state_id: startStateId, status: 'running' }`.
11. `result = await runPersonaSession({ persona: HAPPY_RUSHER, budget: { maxActions: 30, maxDurationMs: 5*60_000 }, ... })`.
12. Update the session row: `ended_state_id`, `status`, `budget_used`.
13. Insert a minimal `persona_reports` row (summary = `result.reason`, pain_points = []). The full reports come in Plan 4.
14. Update the run row: `status = 'done' | 'failed' | 'budget_exhausted'`.

Tests run the full flow with all fakes against testcontainers DB. Assertions:
- Run transitions queued → running → done
- At least 2 states + at least 1 edge exist for the run
- Session row populated with `ended_state_id`
- `persona_reports` row exists

- [ ] **Step 1-4: TDD + commit + (if schema change made, separate commit for the migration)**

---

## Task 21: Worker poller + main entrypoint

**Files:**
- Create: `worker/src/worker.ts`
- Create: `worker/src/main.ts`

```typescript
// worker.ts
export class Worker {
  constructor(private readonly processor: RunProcessor, private readonly intervalMs: number) {}
  private stopped = false;
  async run(): Promise<void> {
    while (!this.stopped) {
      const run = await this.processor.claimAndProcess();
      if (!run) await new Promise(r => setTimeout(r, this.intervalMs));
    }
  }
  stop(): void { this.stopped = true; }
}
```

`main.ts`:
1. Load config.
2. Build Drizzle client from `DATABASE_URL`.
3. Build storage adapter from `STORAGE_DIR`.
4. Build EmulatorPool based on `EMULATOR_POOL` (fake | genymotion).
5. Build LLMClient based on `LLM_PROVIDER`.
6. `processor = new RunProcessor({ ... })`.
7. `worker = new Worker(processor, POLL_INTERVAL_MS)`.
8. SIGINT/SIGTERM handler → `worker.stop()` + flush logger.
9. `await worker.run()`.

No new tests — the loop is trivial and the components are tested.

- [ ] **Step 1: Implement + typecheck + build + commit**

```bash
cd worker && npm run typecheck && npm run build
node dist/main.js --help 2>/dev/null || true   # may or may not have flags
git add worker/src/worker.ts worker/src/main.ts
git commit -m "feat(worker): poller loop + main entrypoint"
```

---

## Task 22: README + smoke walkthrough + final manual e2e

**Files:**
- Create: `worker/README.md`
- Create: `worker/docs/smoke-test.md`

This is the acceptance gate — end-to-end against real Genymotion + real Anthropic API + the Plan 1 backend + the Plan 2 CLI.

- [ ] **Step 1: README** — covers prerequisites, env vars, how to start the worker, how it interacts with backend + CLI, where logs go, how to inject fakes for local dev (`EMULATOR_POOL=fake LLM_PROVIDER=fake`).

- [ ] **Step 2: Smoke test doc** — `worker/docs/smoke-test.md` walks through:
  1. Start backend (`cd backend && npm run dev`).
  2. Start a Genymotion Cloud account; export `GENYMOTION_API_KEY`.
  3. Export `ANTHROPIC_API_KEY`.
  4. Start worker (`cd worker && EMULATOR_POOL=genymotion LLM_PROVIDER=anthropic npm run dev`).
  5. From a third terminal, use the Plan 2 CLI to record + upload a real flow against a local emulator.
  6. Watch worker logs: claim → lease → install → replay → exploration loop.
  7. After worker reports `done`, `curl GET /runs/:id` from backend and verify the response shows `states`, `edges`, `sessions`, `persona_reports` populated.

- [ ] **Step 3: Run full Vitest suite + typecheck + build**

```bash
cd worker && npm test && npm run typecheck && npm run build
```

Expected: all tests pass, no type errors.

- [ ] **Step 4: Commit the docs**

```bash
git add worker/README.md worker/docs/smoke-test.md
git commit -m "docs(worker): README + smoke walkthrough"
```

- [ ] **Step 5: Manual e2e**

Follow `worker/docs/smoke-test.md`. Confirm:
- A queued run is claimed within `POLL_INTERVAL_MS`.
- Genymotion instance is leased and reaches ONLINE.
- APK installs.
- Happy-path replay reaches the expected screen (eyeball via emulator's web view).
- The persona takes ≥ 5 actions and stops with a non-`failed` status.
- The map has ≥ 2 states and ≥ 1 edge in Postgres.
- Run transitions to `done`.
- Emulator is released (Genymotion dashboard shows no leaked instances).

If anything is broken or unstable, **report** rather than papering over with retries. The unit tests should have caught most bugs; e2e issues are usually integration mismatches with the external API.

---

## Self-Review

- All 22 commits in order.
- All Vitest tests pass (target: ~25 new tests across Tasks 3–20).
- `npm run typecheck` + `npm run build` clean in `worker/`.
- Manual e2e ran end-to-end against real Genymotion + real Anthropic + Plan 1 backend + Plan 2 CLI.
- Working tree clean. Branch ready for PR against `main`.
- No leaked Genymotion instances after the smoke test.

## Report

After completing Plan 3, write a short status report:
- Status: DONE | DONE_WITH_CONCERNS | BLOCKED
- All commit SHAs (T1–T22, plus any migration commits)
- Final test count
- Manual e2e: ran / skipped (with reason)
- Costs incurred (Genymotion minutes, Anthropic tokens)
- Concerns / Plan 4 hand-offs

Under 400 words.

---

## Pointers to context (for the fresh Claude Code session)

When picking this up cold, read these first (in order):

1. **`docs/superpowers/specs/2026-05-12-scout-design.md`** — full Scout design. The "Architecture", "Components", "Data Flow", "State Map Data Model", and "Personas + Quality Scoring" sections are the load-bearing context.
2. **`docs/superpowers/plans/2026-05-12-scout-backend-skeleton.md`** — Plan 1. The DB schema in `backend/src/db/schema.ts` is the contract this plan reads and writes against.
3. **`docs/superpowers/plans/2026-05-13-scout-cli-capture.md`** — Plan 2. The TraceBundleV1 shape in `cli/src/lib/trace-types.ts` is what `worker/src/replay/replay.ts` consumes.
4. **This plan**.

**Existing repo state (as of plan authoring):**
- `backend/` — Fastify API, Postgres schema, LocalStorageAdapter. Endpoints: `/health`, `/projects`, `/runs` (multipart). 33 tests passing. Runs at port 3000.
- `cli/` — `scout` binary with commands `init`, `record`, `done`, `upload`, `status`. 28 tests passing. Uploads multipart `(APK + trace.json + metadata)` to backend's `/runs` and writes returned run id to disk.
- `worker/` — **does not exist yet**. This plan creates it.

**Schema decisions made in Plan 1 + 2 that this plan depends on:**
- `runs.mode` enum includes `'exploration'` and `'verification'`. CLI sends `'exploration'`.
- `runs.status` enum includes `'queued'`, `'running'`, `'done'`, `'failed'`, `'budget_exhausted'`.
- `runs.personas` is `text[]`. CLI currently sends `['happy-rusher', 'low-vision', 'first-timer']` by default; Plan 3 only consumes `happy-rusher` and ignores the others (Plan 4 will fan out).
- `states.perceptual_hash` and `states.ui_tree_fingerprint` are `text NOT NULL`.
- `edges.before_screenshot_url` and `edges.after_screenshot_url` are nullable; Plan 3 leaves them null for `mode='exploration'`.
- `candidate_similar_pairs` exists and is written by Cartographer when exactly one of (phash, tree fingerprint) matches.

**Schema gaps to verify at Task 20 start:**
- Does `projects` have `app_package`? If not, add it in a migration (Plan 3 needs it to launch the app after install). Update Plan 2's `runInit` to write it.
- Does `runs` have a `budget` column for max actions/minutes? Plan 3 hardcodes a default; if the column doesn't exist, that's fine for now — add it in Plan 4.
- Does `sessions.budget_used` exist? It should per Plan 1, but verify.

**What is intentionally NOT in Plan 3:**
- LLM-judge / Critic / scorecards / findings (Plan 4)
- Multi-persona parallel execution (Plan 4)
- Network capture, Perfetto perf trace (Plan 4)
- Web dashboard (Plan 5)
- Re-exploration (Plan 5)
- iOS driver (Phase 5)

If a task feels like it's drifting into one of those, stop and write a short note in the report instead of building it.
