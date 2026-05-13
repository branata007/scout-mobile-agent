# Scout CLI + Capture Daemon — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `scout` CLI — a Node + TypeScript binary that initializes a project, drives an interactive happy-path capture against a local Android emulator (taps + screenshots + UI tree + logcat), and uploads the resulting bundle to the Plan 1 backend.

**Architecture:** Single Node package at `/cli`. Commander for command parsing. Adb invoked via `execFile` behind an `AdbClient` interface (real impl + fake for tests). Capture is snapshot-on-keypress (v1): the user taps their emulator, presses SPACE in the terminal, the CLI synchronously dumps screenshot + UI tree + recent logcat. Bundle is written to `.scout/recordings/<flow>/<timestamp>/`. Upload uses Node 22's built-in `fetch` + `FormData`.

**Tech Stack:**
- Node.js 22+ (uses native `fetch`, `FormData`, `Blob`)
- TypeScript 5.x strict mode (ESM)
- Commander 12.x (command parsing)
- @iarna/toml 2.x (scout.toml read/write)
- kleur 4.x (terminal colors — tiny, no deps)
- Vitest 2.x for tests
- Built-in `readline` + raw-mode stdin for the interactive capture loop

**Plan position:** This is **Plan 2 of 5** for Scout Phase 1. Plan 1 (backend skeleton) is shipped — Plan 2 builds the CLI that talks to it. Plan 3 will add the cloud emulator + agent brain (consumes the trace bundle uploaded here).

**Deliverable when this plan is done:** A developer can run `scout init` against the running backend (creates a project), then `scout record checkout` to tap through their Android app on a local emulator. Each SPACE press captures state. Press `q` to finalize. `scout upload` ships the trace + APK to the backend. `scout status` confirms upload. End-to-end manual smoke test passes against a real emulator.

---

## File Structure

```
scout-mobile-agent/
├── backend/                              # existing (Plan 1)
├── cli/                                  # new
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── .gitignore
│   ├── README.md
│   ├── docs/
│   │   └── smoke-test.md
│   ├── src/
│   │   ├── main.ts                       # entrypoint — calls program.parseAsync
│   │   ├── program.ts                    # commander program builder (testable)
│   │   ├── lib/
│   │   │   ├── trace-types.ts            # TS types for TraceBundleV1 (no Zod)
│   │   │   └── errors.ts                 # CliError
│   │   ├── config/
│   │   │   ├── types.ts                  # ScoutConfig type
│   │   │   └── load.ts                   # loadConfig() — scout.toml + env
│   │   ├── adb/
│   │   │   ├── client.ts                 # AdbClient interface + types
│   │   │   ├── exec.ts                   # AdbClientImpl (execFile wrapper)
│   │   │   ├── parse-uitree.ts           # parseUiTreeXml()
│   │   │   └── parse-logcat.ts           # parseLogcat()
│   │   ├── capture/
│   │   │   ├── session.ts                # CaptureSession — in-memory action+state log
│   │   │   ├── recorder.ts               # Recorder — interactive loop using EventSource
│   │   │   └── bundle.ts                 # finalize() — writes trace.json + screenshots
│   │   ├── upload/
│   │   │   └── client.ts                 # BackendClient — postRun, getRun, createProject
│   │   └── commands/
│   │       ├── init.ts                   # scout init
│   │       ├── record.ts                 # scout record <flow>
│   │       ├── done.ts                   # scout done (recovery)
│   │       ├── upload.ts                 # scout upload
│   │       └── status.ts                 # scout status
│   └── tests/
│       ├── helpers/
│       │   ├── fake-adb.ts               # FakeAdbClient with scripted responses
│       │   ├── mock-backend.ts           # Fastify mock backend for upload tests
│       │   ├── fixtures.ts               # sample UI tree XML, logcat lines
│       │   └── tmp-dir.ts                # mkdtemp helper + cleanup
│       ├── config/
│       │   └── load.test.ts
│       ├── adb/
│       │   ├── parse-uitree.test.ts
│       │   └── parse-logcat.test.ts
│       ├── upload/
│       │   └── client.test.ts
│       ├── capture/
│       │   ├── session.test.ts
│       │   ├── bundle.test.ts
│       │   └── recorder.test.ts
│       └── commands/
│           └── init.test.ts
└── docs/                                 # existing
```

**Boundary rules:**
- `commands/` are thin — orchestrate, print, exit code. No business logic inline.
- `adb/` knows about Android only. No knowledge of trace bundle.
- `capture/` knows about the trace bundle and AdbClient. No knowledge of HTTP.
- `upload/` knows about HTTP only. No knowledge of capture session shape — accepts an already-built bundle path.
- `config/` knows about scout.toml. No knowledge of anything else.

---

## Task 1: Initialize the CLI package

**Files:**
- Create: `cli/package.json`
- Create: `cli/tsconfig.json`
- Create: `cli/vitest.config.ts`
- Create: `cli/.gitignore`

- [ ] **Step 1: Create the CLI directory**

```bash
mkdir -p cli && cd cli
```

- [ ] **Step 2: Create `cli/package.json`**

```json
{
  "name": "@scout/cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "scout": "./dist/main.js" },
  "engines": { "node": ">=22.0.0" },
  "scripts": {
    "dev": "tsx src/main.ts",
    "build": "tsc",
    "start": "node dist/main.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "commander": "^12.1.0",
    "@iarna/toml": "^2.2.5",
    "kleur": "^4.1.5"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0",
    "tsx": "^4.19.0",
    "vitest": "^2.1.0",
    "fastify": "^5.0.0"
  }
}
```

(`fastify` is only used as a dev dep for `mock-backend.ts` in upload tests.)

- [ ] **Step 3: Create `cli/tsconfig.json`**

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

- [ ] **Step 4: Create `cli/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 20000,
    hookTimeout: 30000,
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Create `cli/.gitignore`**

```
node_modules/
dist/
coverage/
.scout/
```

- [ ] **Step 6: Install dependencies**

```bash
cd cli && npm install
```

Expected: package-lock.json created, no errors.

- [ ] **Step 7: Commit**

```bash
git add cli/package.json cli/package-lock.json cli/tsconfig.json cli/vitest.config.ts cli/.gitignore
git commit -m "feat(cli): initialize Node + TypeScript CLI package"
```

---

## Task 2: TraceBundle TypeScript types (no Zod)

**Files:**
- Create: `cli/src/lib/trace-types.ts`

These types mirror `backend/src/lib/trace-schema.ts` exactly. The CLI builds bundles against these types; the backend validates with its own Zod schema at ingestion. If they drift, the backend rejects with 400 `invalid_trace`.

- [ ] **Step 1: Create `cli/src/lib/trace-types.ts`**

```typescript
// Types mirror backend/src/lib/trace-schema.ts. The CLI builds against types;
// the backend validates with Zod on receipt.

export type ActionType = 'launch' | 'tap' | 'swipe' | 'input' | 'wait' | 'back' | 'home';

export interface ActionV1 {
  type: ActionType;
  target?: Record<string, unknown>;
  value?: string;
  timestamp_ms: number;
}

export interface StateSnapshotV1 {
  after_action_index: number;
  screenshot_path: string;
  ui_tree: Record<string, unknown>;
  timestamp_ms: number;
}

export type LogLevel = 'verbose' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogLineV1 {
  level: LogLevel;
  tag: string;
  message: string;
  timestamp_ms: number;
}

export interface TraceBundleV1 {
  version: 1;
  recorded_at: string; // ISO datetime
  flow_name: string;
  intent?: string;
  actions: ActionV1[];
  states: StateSnapshotV1[];
  logs?: LogLineV1[];
}
```

- [ ] **Step 2: Typecheck**

```bash
cd cli && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add cli/src/lib/trace-types.ts
git commit -m "feat(cli): add TraceBundleV1 TS types mirroring backend schema"
```

---

## Task 3: CliError type

**Files:**
- Create: `cli/src/lib/errors.ts`

- [ ] **Step 1: Create `cli/src/lib/errors.ts`**

```typescript
export class CliError extends Error {
  constructor(
    public readonly exitCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CliError';
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd cli && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add cli/src/lib/errors.ts
git commit -m "feat(cli): add CliError type"
```

---

## Task 4: Config types + loader (TDD)

**Files:**
- Create: `cli/src/config/types.ts`
- Create: `cli/src/config/load.ts`
- Create: `cli/tests/config/load.test.ts`
- Create: `cli/tests/helpers/tmp-dir.ts`

`scout.toml` lives in the project root. The loader reads it and combines with env vars (notably `SCOUT_API_KEY`).

- [ ] **Step 1: Create the tmp-dir test helper**

Create `cli/tests/helpers/tmp-dir.ts`:

```typescript
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function makeTmpDir(prefix = 'scout-cli-'): Promise<string> {
  return await mkdtemp(join(tmpdir(), prefix));
}

export async function removeTmpDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
```

- [ ] **Step 2: Write the failing test**

Create `cli/tests/config/load.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeTmpDir, removeTmpDir } from '../helpers/tmp-dir.js';
import { loadConfig } from '../../src/config/load.js';

describe('loadConfig', () => {
  let dir: string;

  beforeEach(async () => { dir = await makeTmpDir(); });
  afterEach(async () => { await removeTmpDir(dir); });

  it('reads scout.toml and overlays env', async () => {
    await writeFile(
      join(dir, 'scout.toml'),
      `[project]
id = "550e8400-e29b-41d4-a716-446655440000"
name = "my-app"
app_package = "com.example.app"

[backend]
url = "http://localhost:3000"
`,
    );
    const config = await loadConfig({ cwd: dir, env: { SCOUT_API_KEY: 'k-12345678' } });
    expect(config.project.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(config.project.name).toBe('my-app');
    expect(config.project.appPackage).toBe('com.example.app');
    expect(config.backend.url).toBe('http://localhost:3000');
    expect(config.backend.apiKey).toBe('k-12345678');
  });

  it('throws CliError if scout.toml is missing', async () => {
    await expect(loadConfig({ cwd: dir, env: {} })).rejects.toThrow(/scout\.toml not found/);
  });

  it('throws CliError if SCOUT_API_KEY is missing', async () => {
    await writeFile(
      join(dir, 'scout.toml'),
      `[project]
id = ""
name = "x"
app_package = "com.x"

[backend]
url = "http://localhost:3000"
`,
    );
    await expect(loadConfig({ cwd: dir, env: {} })).rejects.toThrow(/SCOUT_API_KEY/);
  });
});
```

- [ ] **Step 3: Run to confirm failure**

```bash
cd cli && npm test -- tests/config/load.test.ts
```

Expected: FAIL (modules not found).

- [ ] **Step 4: Implement the config types**

Create `cli/src/config/types.ts`:

```typescript
export interface ScoutConfig {
  project: {
    id: string;
    name: string;
    appPackage: string;
  };
  backend: {
    url: string;
    apiKey: string;
  };
  cwd: string;
}
```

- [ ] **Step 5: Implement the loader**

Create `cli/src/config/load.ts`:

```typescript
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import toml from '@iarna/toml';
import { CliError } from '../lib/errors.js';
import type { ScoutConfig } from './types.js';

export interface LoadConfigInput {
  cwd: string;
  env: Record<string, string | undefined>;
}

interface RawScoutToml {
  project?: {
    id?: string;
    name?: string;
    app_package?: string;
  };
  backend?: {
    url?: string;
  };
}

export async function loadConfig(input: LoadConfigInput): Promise<ScoutConfig> {
  const tomlPath = resolve(input.cwd, 'scout.toml');
  let raw: string;
  try {
    raw = await readFile(tomlPath, 'utf-8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new CliError(1, 'config_missing', `scout.toml not found at ${tomlPath}. Run "scout init" first.`);
    }
    throw e;
  }

  const parsed = toml.parse(raw) as RawScoutToml;
  const apiKey = input.env.SCOUT_API_KEY;
  if (!apiKey) {
    throw new CliError(1, 'no_api_key', 'SCOUT_API_KEY environment variable is required.');
  }

  return {
    project: {
      id: parsed.project?.id ?? '',
      name: parsed.project?.name ?? '',
      appPackage: parsed.project?.app_package ?? '',
    },
    backend: {
      url: parsed.backend?.url ?? 'http://localhost:3000',
      apiKey,
    },
    cwd: input.cwd,
  };
}
```

- [ ] **Step 6: Verify pass (3 tests)**

```bash
cd cli && npm test -- tests/config/load.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add cli/src/config/ cli/tests/config/ cli/tests/helpers/tmp-dir.ts
git commit -m "feat(cli): add scout.toml config loader with env overlay"
```

---

## Task 5: UI tree XML parser (TDD)

**Files:**
- Create: `cli/src/adb/parse-uitree.ts`
- Create: `cli/tests/helpers/fixtures.ts`
- Create: `cli/tests/adb/parse-uitree.test.ts`

`adb shell uiautomator dump` produces XML like the fixture below. We parse it to a typed tree.

- [ ] **Step 1: Add fixtures**

Create `cli/tests/helpers/fixtures.ts`:

```typescript
export const SAMPLE_UI_TREE_XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="com.android.systemui" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][1080,2280]">
    <node index="0" text="Welcome" resource-id="com.example.app:id/title" class="android.widget.TextView" package="com.example.app" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[100,200][980,300]" />
    <node index="1" text="Login" resource-id="com.example.app:id/login_btn" class="android.widget.Button" package="com.example.app" content-desc="Login button" checkable="false" checked="false" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[100,400][980,500]" />
  </node>
</hierarchy>
`;

export const SAMPLE_LOGCAT_LINES = `05-13 12:34:56.789  1234  5678 I MyApp   : Login button tapped
05-13 12:34:56.890  1234  5678 D MyApp   : Calling auth.signIn
05-13 12:34:57.123  1234  5678 W MyApp   : Slow response (200ms)
05-13 12:34:57.456  1234  5678 E MyApp   : Auth failed: invalid_credentials
`;
```

- [ ] **Step 2: Write the failing test**

Create `cli/tests/adb/parse-uitree.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseUiTreeXml } from '../../src/adb/parse-uitree.js';
import { SAMPLE_UI_TREE_XML } from '../helpers/fixtures.js';

describe('parseUiTreeXml', () => {
  it('parses the hierarchy rotation', () => {
    const tree = parseUiTreeXml(SAMPLE_UI_TREE_XML);
    expect(tree.rotation).toBe(0);
  });

  it('parses root + children', () => {
    const tree = parseUiTreeXml(SAMPLE_UI_TREE_XML);
    expect(tree.root.class).toBe('android.widget.FrameLayout');
    expect(tree.root.children).toHaveLength(2);
    const loginBtn = tree.root.children[1];
    expect(loginBtn?.text).toBe('Login');
    expect(loginBtn?.resourceId).toBe('com.example.app:id/login_btn');
    expect(loginBtn?.clickable).toBe(true);
    expect(loginBtn?.contentDesc).toBe('Login button');
    expect(loginBtn?.bounds).toEqual({ left: 100, top: 400, right: 980, bottom: 500 });
  });

  it('handles empty input gracefully', () => {
    expect(() => parseUiTreeXml('')).toThrow(/empty/i);
  });

  it('handles malformed XML', () => {
    expect(() => parseUiTreeXml('<not-xml')).toThrow();
  });
});
```

- [ ] **Step 3: Run to confirm failure**

```bash
cd cli && npm test -- tests/adb/parse-uitree.test.ts
```

- [ ] **Step 4: Implement the parser**

We avoid a full XML library dep by writing a minimal regex-based parser that handles the constrained shape of uiautomator output. (For robustness, a full parser is a follow-up.)

Create `cli/src/adb/parse-uitree.ts`:

```typescript
export interface UiTreeNode {
  index: number;
  class: string;
  text: string;
  resourceId: string;
  package: string;
  contentDesc: string;
  clickable: boolean;
  enabled: boolean;
  focused: boolean;
  selected: boolean;
  bounds: { left: number; top: number; right: number; bottom: number };
  children: UiTreeNode[];
}

export interface UiTree {
  rotation: number;
  root: UiTreeNode;
}

const ATTR_RE = /(\w[\w-]*)\s*=\s*"([^"]*)"/g;
const NODE_OPEN_RE = /<node([^>]*?)\/?>/g;
const SELF_CLOSING_RE = /<node[^>]*\/>/;

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(ATTR_RE)) {
    out[m[1]!] = m[2]!;
  }
  return out;
}

function parseBounds(s: string): UiTreeNode['bounds'] {
  const m = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(s);
  if (!m) return { left: 0, top: 0, right: 0, bottom: 0 };
  return {
    left: parseInt(m[1]!, 10),
    top: parseInt(m[2]!, 10),
    right: parseInt(m[3]!, 10),
    bottom: parseInt(m[4]!, 10),
  };
}

function makeNode(attrs: Record<string, string>): UiTreeNode {
  return {
    index: parseInt(attrs.index ?? '0', 10),
    class: attrs.class ?? '',
    text: attrs.text ?? '',
    resourceId: attrs['resource-id'] ?? '',
    package: attrs.package ?? '',
    contentDesc: attrs['content-desc'] ?? '',
    clickable: attrs.clickable === 'true',
    enabled: attrs.enabled === 'true',
    focused: attrs.focused === 'true',
    selected: attrs.selected === 'true',
    bounds: parseBounds(attrs.bounds ?? '[0,0][0,0]'),
    children: [],
  };
}

export function parseUiTreeXml(xml: string): UiTree {
  if (!xml.trim()) throw new Error('empty UI tree XML');
  if (!xml.includes('<hierarchy')) throw new Error('not a uiautomator dump (no <hierarchy>)');

  const hierMatch = /<hierarchy\b([^>]*)>/.exec(xml);
  if (!hierMatch) throw new Error('malformed XML: no <hierarchy> open tag');
  const rotation = parseInt(parseAttrs(hierMatch[1]!).rotation ?? '0', 10);

  // Tokenize <node ...> opens (and self-closures) and </node> closes in order.
  type Token = { kind: 'open' | 'close'; node?: UiTreeNode };
  const tokens: Token[] = [];
  let pos = 0;
  while (pos < xml.length) {
    const openIdx = xml.indexOf('<node', pos);
    const closeIdx = xml.indexOf('</node>', pos);
    if (openIdx === -1 && closeIdx === -1) break;
    if (openIdx !== -1 && (closeIdx === -1 || openIdx < closeIdx)) {
      const endOfTag = xml.indexOf('>', openIdx);
      if (endOfTag === -1) throw new Error('malformed XML: unterminated <node>');
      const tagContent = xml.slice(openIdx, endOfTag + 1);
      const node = makeNode(parseAttrs(tagContent));
      tokens.push({ kind: 'open', node });
      if (SELF_CLOSING_RE.test(tagContent)) tokens.push({ kind: 'close' });
      pos = endOfTag + 1;
    } else {
      tokens.push({ kind: 'close' });
      pos = closeIdx + '</node>'.length;
    }
  }

  if (tokens.length === 0 || tokens[0]!.kind !== 'open') {
    throw new Error('malformed XML: no <node> elements');
  }

  const root = tokens[0]!.node!;
  const stack: UiTreeNode[] = [root];
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.kind === 'open') {
      stack[stack.length - 1]!.children.push(t.node!);
      stack.push(t.node!);
    } else {
      stack.pop();
    }
  }

  return { rotation, root };
}
```

- [ ] **Step 5: Verify pass (4 tests)**

```bash
cd cli && npm test -- tests/adb/parse-uitree.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add cli/src/adb/parse-uitree.ts cli/tests/adb/parse-uitree.test.ts cli/tests/helpers/fixtures.ts
git commit -m "feat(cli): add uiautomator XML parser"
```

---

## Task 6: Logcat parser (TDD)

**Files:**
- Create: `cli/src/adb/parse-logcat.ts`
- Create: `cli/tests/adb/parse-logcat.test.ts`

`adb logcat -d` emits lines like `MM-DD HH:MM:SS.MMM  PID  TID L TAG : message`.

- [ ] **Step 1: Failing test**

Create `cli/tests/adb/parse-logcat.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseLogcat } from '../../src/adb/parse-logcat.js';
import { SAMPLE_LOGCAT_LINES } from '../helpers/fixtures.js';

describe('parseLogcat', () => {
  it('parses 4 lines with right levels', () => {
    const refDate = new Date('2026-05-13T00:00:00.000Z');
    const lines = parseLogcat(SAMPLE_LOGCAT_LINES, refDate);
    expect(lines).toHaveLength(4);
    expect(lines[0]?.level).toBe('info');
    expect(lines[1]?.level).toBe('debug');
    expect(lines[2]?.level).toBe('warn');
    expect(lines[3]?.level).toBe('error');
  });

  it('extracts tag and message', () => {
    const lines = parseLogcat(SAMPLE_LOGCAT_LINES, new Date('2026-05-13T00:00:00.000Z'));
    expect(lines[0]?.tag).toBe('MyApp');
    expect(lines[0]?.message).toBe('Login button tapped');
  });

  it('produces non-negative timestamp_ms relative to refDate', () => {
    const refDate = new Date('2026-05-13T12:34:56.000Z');
    const lines = parseLogcat(SAMPLE_LOGCAT_LINES, refDate);
    expect(lines[0]?.timestamp_ms).toBeGreaterThanOrEqual(0);
  });

  it('skips empty and unrecognized lines', () => {
    const input = `\n\nsome garbage line\n05-13 10:00:00.000  1  1 V Tag : ok\n`;
    const lines = parseLogcat(input, new Date('2026-05-13T00:00:00.000Z'));
    expect(lines).toHaveLength(1);
    expect(lines[0]?.level).toBe('verbose');
  });
});
```

- [ ] **Step 2: Confirm fail**

```bash
cd cli && npm test -- tests/adb/parse-logcat.test.ts
```

- [ ] **Step 3: Implement**

Create `cli/src/adb/parse-logcat.ts`:

```typescript
import type { LogLineV1, LogLevel } from '../lib/trace-types.js';

const LINE_RE = /^(\d{2})-(\d{2})\s(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s+\d+\s+\d+\s+([VDIWEF])\s+([^:]+?)\s*:\s*(.*)$/;

const LEVEL_MAP: Record<string, LogLevel> = {
  V: 'verbose',
  D: 'debug',
  I: 'info',
  W: 'warn',
  E: 'error',
  F: 'fatal',
};

export function parseLogcat(raw: string, refDate: Date): LogLineV1[] {
  const refYear = refDate.getUTCFullYear();
  const out: LogLineV1[] = [];
  for (const line of raw.split('\n')) {
    const m = LINE_RE.exec(line);
    if (!m) continue;
    const [, MM, DD, hh, mm, ss, ms, lvl, tag, message] = m;
    const date = new Date(Date.UTC(
      refYear,
      parseInt(MM!, 10) - 1,
      parseInt(DD!, 10),
      parseInt(hh!, 10),
      parseInt(mm!, 10),
      parseInt(ss!, 10),
      parseInt(ms!, 10),
    ));
    const ts = Math.max(0, date.getTime() - refDate.getTime());
    out.push({
      level: LEVEL_MAP[lvl!]!,
      tag: tag!.trim(),
      message: message!,
      timestamp_ms: ts,
    });
  }
  return out;
}
```

- [ ] **Step 4: Verify pass (4 tests)**

```bash
cd cli && npm test -- tests/adb/parse-logcat.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add cli/src/adb/parse-logcat.ts cli/tests/adb/parse-logcat.test.ts
git commit -m "feat(cli): add logcat parser"
```

---

## Task 7: AdbClient interface + FakeAdbClient

**Files:**
- Create: `cli/src/adb/client.ts`
- Create: `cli/tests/helpers/fake-adb.ts`

The interface that capture code consumes. Real impl lands in Task 8.

- [ ] **Step 1: Create `cli/src/adb/client.ts`**

```typescript
import type { UiTree } from './parse-uitree.js';
import type { LogLineV1 } from '../lib/trace-types.js';

export interface AdbDevice {
  serial: string;
  type: 'device' | 'emulator';
  state: 'device' | 'offline' | 'unauthorized';
}

export interface AdbClient {
  devices(): Promise<AdbDevice[]>;
  launchApp(serial: string, packageName: string): Promise<void>;
  screencap(serial: string): Promise<Buffer>;
  uiautomatorDump(serial: string): Promise<UiTree>;
  currentActivity(serial: string): Promise<string>;
  logcatSnapshot(serial: string, sinceMs: number): Promise<LogLineV1[]>;
  pullApk(serial: string, packageName: string, destPath: string): Promise<void>;
  pressKey(serial: string, key: 'back' | 'home'): Promise<void>;
  inputText(serial: string, text: string): Promise<void>;
}
```

- [ ] **Step 2: Create `cli/tests/helpers/fake-adb.ts`**

```typescript
import type { AdbClient, AdbDevice } from '../../src/adb/client.js';
import type { UiTree } from '../../src/adb/parse-uitree.js';
import type { LogLineV1 } from '../../src/lib/trace-types.js';

export interface FakeAdbScript {
  devices?: AdbDevice[];
  screencap?: Buffer;
  uiTree?: UiTree;
  activity?: string;
  logs?: LogLineV1[];
}

export class FakeAdbClient implements AdbClient {
  public calls: Array<{ method: string; args: unknown[] }> = [];
  constructor(private script: FakeAdbScript = {}) {}

  async devices(): Promise<AdbDevice[]> {
    this.calls.push({ method: 'devices', args: [] });
    return this.script.devices ?? [{ serial: 'emulator-5554', type: 'emulator', state: 'device' }];
  }

  async launchApp(serial: string, packageName: string): Promise<void> {
    this.calls.push({ method: 'launchApp', args: [serial, packageName] });
  }

  async screencap(serial: string): Promise<Buffer> {
    this.calls.push({ method: 'screencap', args: [serial] });
    return this.script.screencap ?? Buffer.from('PNGfake');
  }

  async uiautomatorDump(serial: string): Promise<UiTree> {
    this.calls.push({ method: 'uiautomatorDump', args: [serial] });
    return (
      this.script.uiTree ?? {
        rotation: 0,
        root: {
          index: 0,
          class: 'android.widget.FrameLayout',
          text: '',
          resourceId: '',
          package: 'com.example',
          contentDesc: '',
          clickable: false,
          enabled: true,
          focused: false,
          selected: false,
          bounds: { left: 0, top: 0, right: 1080, bottom: 1920 },
          children: [],
        },
      }
    );
  }

  async currentActivity(serial: string): Promise<string> {
    this.calls.push({ method: 'currentActivity', args: [serial] });
    return this.script.activity ?? 'com.example/.MainActivity';
  }

  async logcatSnapshot(serial: string, sinceMs: number): Promise<LogLineV1[]> {
    this.calls.push({ method: 'logcatSnapshot', args: [serial, sinceMs] });
    return this.script.logs ?? [];
  }

  async pullApk(serial: string, packageName: string, destPath: string): Promise<void> {
    this.calls.push({ method: 'pullApk', args: [serial, packageName, destPath] });
  }

  async pressKey(serial: string, key: 'back' | 'home'): Promise<void> {
    this.calls.push({ method: 'pressKey', args: [serial, key] });
  }

  async inputText(serial: string, text: string): Promise<void> {
    this.calls.push({ method: 'inputText', args: [serial, text] });
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
cd cli && npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add cli/src/adb/client.ts cli/tests/helpers/fake-adb.ts
git commit -m "feat(cli): add AdbClient interface + FakeAdbClient for tests"
```

---

## Task 8: AdbClientImpl real implementation

**Files:**
- Create: `cli/src/adb/exec.ts`

The real impl shells out to `adb` via `execFile`. No unit tests in this task — it requires a real adb binary + emulator. Manual e2e in Task 19 exercises this.

- [ ] **Step 1: Create `cli/src/adb/exec.ts`**

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AdbClient, AdbDevice } from './client.js';
import type { UiTree } from './parse-uitree.js';
import type { LogLineV1 } from '../lib/trace-types.js';
import { parseUiTreeXml } from './parse-uitree.js';
import { parseLogcat } from './parse-logcat.js';
import { CliError } from '../lib/errors.js';

const execFileP = promisify(execFile);

async function run(args: string[], opts: { binary?: Buffer } = {}): Promise<{ stdout: string; stderr: string }> {
  const encoding = opts.binary ? undefined : 'utf-8';
  try {
    // execFile with maxBuffer 50MB to handle screencap output
    const { stdout, stderr } = await execFileP('adb', args, {
      encoding: encoding as BufferEncoding | undefined,
      maxBuffer: 50 * 1024 * 1024,
    });
    return { stdout: stdout.toString(), stderr: stderr.toString() };
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw new CliError(1, 'adb_not_found', 'adb binary not found. Install Android SDK platform-tools.');
    }
    throw err;
  }
}

async function runBuffer(args: string[]): Promise<Buffer> {
  return await new Promise<Buffer>((resolveFn, rejectFn) => {
    execFile('adb', args, { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        const e = err as NodeJS.ErrnoException;
        if (e.code === 'ENOENT') {
          rejectFn(new CliError(1, 'adb_not_found', 'adb binary not found.'));
          return;
        }
        rejectFn(err);
        return;
      }
      resolveFn(stdout as Buffer);
    });
  });
}

export class AdbClientImpl implements AdbClient {
  async devices(): Promise<AdbDevice[]> {
    const { stdout } = await run(['devices']);
    const out: AdbDevice[] = [];
    for (const line of stdout.split('\n').slice(1)) {
      const m = /^(\S+)\s+(\S+)$/.exec(line.trim());
      if (!m) continue;
      const serial = m[1]!;
      const state = (m[2] as AdbDevice['state']) ?? 'offline';
      out.push({ serial, type: serial.startsWith('emulator-') ? 'emulator' : 'device', state });
    }
    return out;
  }

  async launchApp(serial: string, packageName: string): Promise<void> {
    await run(['-s', serial, 'shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1']);
  }

  async screencap(serial: string): Promise<Buffer> {
    return await runBuffer(['-s', serial, 'exec-out', 'screencap', '-p']);
  }

  async uiautomatorDump(serial: string): Promise<UiTree> {
    // /sdcard/window_dump.xml is the default output path
    await run(['-s', serial, 'shell', 'uiautomator', 'dump', '/sdcard/window_dump.xml']);
    const { stdout } = await run(['-s', serial, 'shell', 'cat', '/sdcard/window_dump.xml']);
    return parseUiTreeXml(stdout);
  }

  async currentActivity(serial: string): Promise<string> {
    const { stdout } = await run(['-s', serial, 'shell', 'dumpsys', 'window', '|', 'grep', '-E', '"mCurrentFocus|mFocusedApp"']);
    const m = /\s([\w.]+\/[\w.]+)\b/.exec(stdout);
    return m?.[1] ?? '';
  }

  async logcatSnapshot(serial: string, sinceMs: number): Promise<LogLineV1[]> {
    // -d = dump and exit; we read the last 200 lines as a bounded window
    const { stdout } = await run(['-s', serial, 'logcat', '-d', '-t', '200']);
    return parseLogcat(stdout, new Date(sinceMs));
  }

  async pullApk(serial: string, packageName: string, destPath: string): Promise<void> {
    const { stdout: pathOut } = await run(['-s', serial, 'shell', 'pm', 'path', packageName]);
    const apkPath = pathOut.trim().replace(/^package:/, '').split('\n')[0]?.trim();
    if (!apkPath) {
      throw new CliError(1, 'apk_not_found', `Could not find APK path for ${packageName} on ${serial}.`);
    }
    await mkdir(dirname(destPath), { recursive: true });
    await run(['-s', serial, 'pull', apkPath, destPath]);
  }

  async pressKey(serial: string, key: 'back' | 'home'): Promise<void> {
    const code = key === 'back' ? '4' : '3';
    await run(['-s', serial, 'shell', 'input', 'keyevent', code]);
  }

  async inputText(serial: string, text: string): Promise<void> {
    // Escape spaces for adb shell input text
    const escaped = text.replace(/ /g, '%s');
    await run(['-s', serial, 'shell', 'input', 'text', escaped]);
  }
}

// Helper for using-write the screencap result to disk if needed
export async function writeScreenshot(destPath: string, png: Buffer): Promise<void> {
  await mkdir(dirname(destPath), { recursive: true });
  await writeFile(destPath, png);
}
```

- [ ] **Step 2: Typecheck**

```bash
cd cli && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add cli/src/adb/exec.ts
git commit -m "feat(cli): add AdbClientImpl real adb wrapper"
```

---

## Task 9: BackendClient (TDD with mock Fastify backend)

**Files:**
- Create: `cli/src/upload/client.ts`
- Create: `cli/tests/helpers/mock-backend.ts`
- Create: `cli/tests/upload/client.test.ts`

The CLI's BackendClient talks to the real Plan 1 backend. For tests we stand up a minimal Fastify server with the same endpoint shapes.

- [ ] **Step 1: Create the mock backend helper**

Create `cli/tests/helpers/mock-backend.ts`:

```typescript
import Fastify, { type FastifyInstance } from 'fastify';

export interface MockBackend {
  url: string;
  app: FastifyInstance;
  receivedRuns: Array<{
    apkSize: number;
    trace: unknown;
    metadata: unknown;
  }>;
  close: () => Promise<void>;
}

export async function startMockBackend(apiKey: string): Promise<MockBackend> {
  const app = Fastify({ logger: false });
  await app.register(import('@fastify/multipart'), { limits: { fileSize: 100 * 1024 * 1024 } });

  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/health') return;
    if (req.headers['x-scout-api-key'] !== apiKey) {
      await reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.get('/health', async () => ({ status: 'ok' }));

  const projects = new Map<string, { id: string; name: string }>();

  app.post('/projects', async (req, reply) => {
    const body = req.body as { name?: string };
    if (!body?.name) return reply.code(400).send({ error: 'bad_request' });
    const id = crypto.randomUUID();
    projects.set(id, { id, name: body.name });
    return reply.code(201).send({ id, name: body.name, default_personas: [], created_at: new Date().toISOString() });
  });

  app.get('/projects/:id', async (req, reply) => {
    const p = projects.get((req.params as { id: string }).id);
    if (!p) return reply.code(404).send({ error: 'not_found' });
    return reply.send({ ...p, default_personas: [], created_at: new Date().toISOString() });
  });

  const received: MockBackend['receivedRuns'] = [];

  app.post('/runs', async (req, reply) => {
    if (!req.isMultipart()) return reply.code(400).send({ error: 'bad_request' });
    let apkSize = 0;
    let trace: unknown;
    let metadata: unknown;
    for await (const part of req.parts()) {
      if (part.type === 'file' && part.fieldname === 'apk') {
        const buf = await part.toBuffer();
        apkSize = buf.length;
      } else if (part.type === 'field') {
        const v = (part as { value: unknown }).value;
        const s = typeof v === 'string' ? v : JSON.stringify(v);
        if (part.fieldname === 'trace') trace = JSON.parse(s);
        if (part.fieldname === 'metadata') metadata = JSON.parse(s);
      }
    }
    received.push({ apkSize, trace, metadata });
    const runId = crypto.randomUUID();
    return reply.code(201).send({
      run: { id: runId, project_id: (metadata as { project_id: string }).project_id, status: 'queued', mode: 'exploration', created_at: new Date().toISOString() },
      sessions: ((metadata as { personas: string[] }).personas).map((p) => ({ id: crypto.randomUUID(), persona_id: p, status: 'running' })),
    });
  });

  app.get('/runs/:id', async (_req, reply) => {
    return reply.send({
      run: { id: 'fake-run-id', status: 'queued', mode: 'exploration', created_at: new Date().toISOString() },
      sessions: [],
    });
  });

  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('mock backend listen failed');

  return {
    url: `http://127.0.0.1:${address.port}`,
    app,
    receivedRuns: received,
    close: async () => { await app.close(); },
  };
}
```

- [ ] **Step 2: Write the failing test**

Create `cli/tests/upload/client.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startMockBackend, type MockBackend } from '../helpers/mock-backend.js';
import { BackendClient } from '../../src/upload/client.js';

describe('BackendClient', () => {
  let backend: MockBackend;
  let client: BackendClient;
  const apiKey = 'test-api-key-1234';

  beforeAll(async () => {
    backend = await startMockBackend(apiKey);
    client = new BackendClient({ url: backend.url, apiKey });
  });
  afterAll(async () => { await backend.close(); });

  it('createProject returns id + name', async () => {
    const p = await client.createProject({ name: 'demo-app', defaultPersonas: ['happy-rusher'] });
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(p.name).toBe('demo-app');
  });

  it('postRun sends multipart and returns run + sessions', async () => {
    const project = await client.createProject({ name: 'p-1' });
    const result = await client.postRun({
      apk: Buffer.from('PKfake'),
      trace: {
        version: 1,
        recorded_at: '2026-05-13T10:00:00.000Z',
        flow_name: 'checkout',
        actions: [{ type: 'launch', timestamp_ms: 0 }],
        states: [],
      },
      metadata: { project_id: project.id, mode: 'exploration', personas: ['happy-rusher'] },
    });
    expect(result.run.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.run.status).toBe('queued');
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.persona_id).toBe('happy-rusher');

    expect(backend.receivedRuns).toHaveLength(1);
    const got = backend.receivedRuns[0]!;
    expect(got.apkSize).toBe(6); // "PKfake"
    expect((got.trace as { version: number }).version).toBe(1);
    expect((got.metadata as { mode: string }).mode).toBe('exploration');
  });

  it('throws CliError on 401', async () => {
    const badClient = new BackendClient({ url: backend.url, apiKey: 'wrong' });
    await expect(badClient.createProject({ name: 'x' })).rejects.toThrow(/unauthorized/i);
  });

  it('getRun returns run', async () => {
    const r = await client.getRun('any-id');
    expect(r.run).toBeDefined();
  });
});
```

- [ ] **Step 3: Confirm failure**

```bash
cd cli && npm test -- tests/upload/client.test.ts
```

- [ ] **Step 4: Implement BackendClient**

Create `cli/src/upload/client.ts`:

```typescript
import { CliError } from '../lib/errors.js';
import type { TraceBundleV1 } from '../lib/trace-types.js';

export interface BackendClientOpts {
  url: string;
  apiKey: string;
}

export interface CreateProjectInput {
  name: string;
  defaultPersonas?: string[];
}

export interface ProjectResponse {
  id: string;
  name: string;
  default_personas: string[];
  created_at: string;
}

export interface RunMetadata {
  project_id: string;
  mode: 'exploration' | 'verification';
  personas: string[];
  intent?: string;
}

export interface PostRunInput {
  apk: Buffer;
  trace: TraceBundleV1;
  metadata: RunMetadata;
}

export interface RunResponse {
  run: {
    id: string;
    project_id: string;
    status: string;
    mode: string;
    created_at: string;
  };
  sessions: Array<{ id: string; persona_id: string; status: string }>;
}

export class BackendClient {
  constructor(private readonly opts: BackendClientOpts) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { 'x-scout-api-key': this.opts.apiKey, ...extra };
  }

  async createProject(input: CreateProjectInput): Promise<ProjectResponse> {
    const res = await fetch(`${this.opts.url}/projects`, {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ name: input.name, default_personas: input.defaultPersonas }),
    });
    if (res.status === 401) {
      throw new CliError(1, 'unauthorized', 'Backend rejected the API key (401 unauthorized).');
    }
    if (!res.ok) {
      throw new CliError(1, 'backend_error', `Backend returned ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as ProjectResponse;
  }

  async postRun(input: PostRunInput): Promise<RunResponse> {
    const form = new FormData();
    const apkBlob = new Blob([new Uint8Array(input.apk)], {
      type: 'application/vnd.android.package-archive',
    });
    form.append('apk', apkBlob, 'app.apk');
    form.append('trace', JSON.stringify(input.trace));
    form.append('metadata', JSON.stringify(input.metadata));

    const res = await fetch(`${this.opts.url}/runs`, {
      method: 'POST',
      headers: this.headers(),
      body: form,
    });
    if (res.status === 401) {
      throw new CliError(1, 'unauthorized', 'Backend rejected the API key (401 unauthorized).');
    }
    if (res.status === 404) {
      const body = (await res.json()) as { error: string };
      throw new CliError(1, body.error, `Backend 404: ${body.error}`);
    }
    if (!res.ok) {
      throw new CliError(1, 'backend_error', `Backend returned ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as RunResponse;
  }

  async getRun(id: string): Promise<RunResponse> {
    const res = await fetch(`${this.opts.url}/runs/${encodeURIComponent(id)}`, {
      headers: this.headers(),
    });
    if (res.status === 401) {
      throw new CliError(1, 'unauthorized', 'Backend rejected the API key (401 unauthorized).');
    }
    if (res.status === 404) {
      throw new CliError(1, 'not_found', `Run ${id} not found.`);
    }
    if (!res.ok) {
      throw new CliError(1, 'backend_error', `Backend returned ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as RunResponse;
  }
}
```

- [ ] **Step 5: Add `@fastify/multipart` to devDeps and install**

```bash
cd cli && npm install --save-dev @fastify/multipart
```

- [ ] **Step 6: Verify pass (4 tests)**

```bash
cd cli && npm test -- tests/upload/client.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add cli/src/upload/client.ts cli/tests/upload/client.test.ts cli/tests/helpers/mock-backend.ts cli/package.json cli/package-lock.json
git commit -m "feat(cli): add BackendClient for /projects + /runs HTTP calls"
```

---

## Task 10: CaptureSession (in-memory action+state log, TDD)

**Files:**
- Create: `cli/src/capture/session.ts`
- Create: `cli/tests/capture/session.test.ts`

A `CaptureSession` is a stateful object the Recorder feeds: it records actions and states with timestamps. `toBundle()` produces a `TraceBundleV1` with `screenshot_path` placeholders that the bundle writer (Task 11) later fills in.

- [ ] **Step 1: Failing test**

Create `cli/tests/capture/session.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { CaptureSession } from '../../src/capture/session.js';

describe('CaptureSession', () => {
  it('records a launch action and initial state', () => {
    const s = new CaptureSession({ flowName: 'checkout', startedAtMs: 1000 });
    s.recordAction({ type: 'launch', tsMs: 1000 });
    s.recordState({ uiTree: { type: 'root' }, screenshot: Buffer.from('p0'), tsMs: 1100 });
    const b = s.toBundle();
    expect(b.flow_name).toBe('checkout');
    expect(b.actions).toHaveLength(1);
    expect(b.actions[0]?.timestamp_ms).toBe(0); // relative to startedAtMs
    expect(b.states).toHaveLength(1);
    expect(b.states[0]?.after_action_index).toBe(0);
    expect(b.states[0]?.screenshot_path).toBe('screens/0.png');
  });

  it('records multiple actions with relative timestamps', () => {
    const s = new CaptureSession({ flowName: 'f', startedAtMs: 1000 });
    s.recordAction({ type: 'tap', tsMs: 1500 });
    s.recordState({ uiTree: {}, screenshot: Buffer.from('s0'), tsMs: 1600 });
    s.recordAction({ type: 'input', tsMs: 2000, value: 'hello' });
    s.recordState({ uiTree: {}, screenshot: Buffer.from('s1'), tsMs: 2100 });
    const b = s.toBundle();
    expect(b.actions).toHaveLength(2);
    expect(b.actions[0]?.timestamp_ms).toBe(500);
    expect(b.actions[1]?.timestamp_ms).toBe(1000);
    expect(b.actions[1]?.value).toBe('hello');
    expect(b.states[1]?.screenshot_path).toBe('screens/1.png');
  });

  it('attaches intent and logs', () => {
    const s = new CaptureSession({ flowName: 'f', startedAtMs: 1000, intent: 'verify the flow' });
    s.recordAction({ type: 'launch', tsMs: 1000 });
    s.recordState({ uiTree: {}, screenshot: Buffer.from('p'), tsMs: 1050 });
    s.appendLogs([{ level: 'info', tag: 'X', message: 'm', timestamp_ms: 10 }]);
    const b = s.toBundle();
    expect(b.intent).toBe('verify the flow');
    expect(b.logs).toHaveLength(1);
  });

  it('exposes screenshots in order', () => {
    const s = new CaptureSession({ flowName: 'f', startedAtMs: 0 });
    s.recordAction({ type: 'launch', tsMs: 0 });
    s.recordState({ uiTree: {}, screenshot: Buffer.from('a'), tsMs: 1 });
    s.recordAction({ type: 'tap', tsMs: 2 });
    s.recordState({ uiTree: {}, screenshot: Buffer.from('b'), tsMs: 3 });
    expect(s.screenshots.map((b) => b.toString())).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Confirm fail**

```bash
cd cli && npm test -- tests/capture/session.test.ts
```

- [ ] **Step 3: Implement**

Create `cli/src/capture/session.ts`:

```typescript
import type { ActionType, ActionV1, LogLineV1, StateSnapshotV1, TraceBundleV1 } from '../lib/trace-types.js';

export interface CaptureSessionOpts {
  flowName: string;
  startedAtMs: number;
  intent?: string;
}

export interface RecordActionInput {
  type: ActionType;
  tsMs: number;
  target?: Record<string, unknown>;
  value?: string;
}

export interface RecordStateInput {
  uiTree: Record<string, unknown>;
  screenshot: Buffer;
  tsMs: number;
}

export class CaptureSession {
  private readonly _actions: ActionV1[] = [];
  private readonly _states: StateSnapshotV1[] = [];
  private readonly _screenshots: Buffer[] = [];
  private readonly _logs: LogLineV1[] = [];

  constructor(private readonly opts: CaptureSessionOpts) {}

  get flowName(): string { return this.opts.flowName; }
  get startedAtMs(): number { return this.opts.startedAtMs; }
  get screenshots(): readonly Buffer[] { return this._screenshots; }
  get actionCount(): number { return this._actions.length; }

  recordAction(input: RecordActionInput): void {
    this._actions.push({
      type: input.type,
      target: input.target,
      value: input.value,
      timestamp_ms: input.tsMs - this.opts.startedAtMs,
    });
  }

  recordState(input: RecordStateInput): void {
    const idx = this._screenshots.length;
    this._screenshots.push(input.screenshot);
    this._states.push({
      after_action_index: this._actions.length - 1,
      screenshot_path: `screens/${idx}.png`,
      ui_tree: input.uiTree,
      timestamp_ms: input.tsMs - this.opts.startedAtMs,
    });
  }

  appendLogs(logs: LogLineV1[]): void {
    for (const l of logs) this._logs.push(l);
  }

  toBundle(): TraceBundleV1 {
    return {
      version: 1,
      recorded_at: new Date(this.opts.startedAtMs).toISOString(),
      flow_name: this.opts.flowName,
      intent: this.opts.intent,
      actions: this._actions,
      states: this._states,
      logs: this._logs.length > 0 ? this._logs : undefined,
    };
  }
}
```

- [ ] **Step 4: Verify pass (4 tests)**

```bash
cd cli && npm test -- tests/capture/session.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add cli/src/capture/session.ts cli/tests/capture/session.test.ts
git commit -m "feat(cli): add CaptureSession for in-memory action+state log"
```

---

## Task 11: Bundle writer (TDD with tmp dir)

**Files:**
- Create: `cli/src/capture/bundle.ts`
- Create: `cli/tests/capture/bundle.test.ts`

`finalizeBundle()` writes `trace.json` + `screens/0.png`, `screens/1.png`, ... + `apk.apk` to a destination dir. Returns the dir path.

- [ ] **Step 1: Failing test**

Create `cli/tests/capture/bundle.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { makeTmpDir, removeTmpDir } from '../helpers/tmp-dir.js';
import { CaptureSession } from '../../src/capture/session.js';
import { finalizeBundle } from '../../src/capture/bundle.js';

describe('finalizeBundle', () => {
  let dir: string;
  beforeEach(async () => { dir = await makeTmpDir(); });
  afterEach(async () => { await removeTmpDir(dir); });

  it('writes trace.json, screens, and apk to destDir', async () => {
    const session = new CaptureSession({ flowName: 'checkout', startedAtMs: 1000 });
    session.recordAction({ type: 'launch', tsMs: 1000 });
    session.recordState({ uiTree: { x: 1 }, screenshot: Buffer.from('PNG0'), tsMs: 1100 });
    session.recordAction({ type: 'tap', tsMs: 1500 });
    session.recordState({ uiTree: { x: 2 }, screenshot: Buffer.from('PNG1'), tsMs: 1600 });

    const destDir = join(dir, 'recording');
    await finalizeBundle({ session, destDir, apk: Buffer.from('PKfake-apk') });

    const trace = JSON.parse(await readFile(join(destDir, 'trace.json'), 'utf-8'));
    expect(trace.version).toBe(1);
    expect(trace.actions).toHaveLength(2);
    expect(trace.states).toHaveLength(2);
    expect(trace.flow_name).toBe('checkout');

    const screen0 = await readFile(join(destDir, 'screens', '0.png'));
    expect(screen0.toString()).toBe('PNG0');
    const screen1 = await readFile(join(destDir, 'screens', '1.png'));
    expect(screen1.toString()).toBe('PNG1');

    const apk = await readFile(join(destDir, 'apk.apk'));
    expect(apk.toString()).toBe('PKfake-apk');

    const screens = await readdir(join(destDir, 'screens'));
    expect(screens.sort()).toEqual(['0.png', '1.png']);
  });

  it('omits apk if not provided', async () => {
    const session = new CaptureSession({ flowName: 'f', startedAtMs: 0 });
    session.recordAction({ type: 'launch', tsMs: 0 });
    session.recordState({ uiTree: {}, screenshot: Buffer.from('s'), tsMs: 1 });
    const destDir = join(dir, 'no-apk');
    await finalizeBundle({ session, destDir });
    const entries = await readdir(destDir);
    expect(entries.sort()).toEqual(['screens', 'trace.json']);
  });
});
```

- [ ] **Step 2: Confirm fail**

```bash
cd cli && npm test -- tests/capture/bundle.test.ts
```

- [ ] **Step 3: Implement**

Create `cli/src/capture/bundle.ts`:

```typescript
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CaptureSession } from './session.js';

export interface FinalizeBundleInput {
  session: CaptureSession;
  destDir: string;
  apk?: Buffer;
}

export interface FinalizeBundleResult {
  bundleDir: string;
  traceJsonPath: string;
  apkPath?: string;
}

export async function finalizeBundle(input: FinalizeBundleInput): Promise<FinalizeBundleResult> {
  await mkdir(join(input.destDir, 'screens'), { recursive: true });

  const trace = input.session.toBundle();
  const traceJsonPath = join(input.destDir, 'trace.json');
  await writeFile(traceJsonPath, JSON.stringify(trace, null, 2));

  for (let i = 0; i < input.session.screenshots.length; i++) {
    const png = input.session.screenshots[i]!;
    await writeFile(join(input.destDir, 'screens', `${i}.png`), png);
  }

  let apkPath: string | undefined;
  if (input.apk) {
    apkPath = join(input.destDir, 'apk.apk');
    await writeFile(apkPath, input.apk);
  }

  return { bundleDir: input.destDir, traceJsonPath, apkPath };
}
```

- [ ] **Step 4: Verify pass (2 tests)**

```bash
cd cli && npm test -- tests/capture/bundle.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add cli/src/capture/bundle.ts cli/tests/capture/bundle.test.ts
git commit -m "feat(cli): add bundle finalize writer (trace + screenshots + apk)"
```

---

## Task 12: Recorder — interactive loop (TDD with mock event source)

**Files:**
- Create: `cli/src/capture/recorder.ts`
- Create: `cli/tests/capture/recorder.test.ts`

The Recorder runs the capture loop:
1. Launch the app (one `launch` action + state capture)
2. Wait for events from an EventSource
3. For each `capture` event: dump UI tree + screenshot + recent logs, record state
4. For `quit`: stop

The EventSource abstraction lets us test with a scripted sequence; the real source (Task 13) reads from stdin.

- [ ] **Step 1: Failing test**

Create `cli/tests/capture/recorder.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Recorder, type RecorderEvent, type RecorderEventSource } from '../../src/capture/recorder.js';
import { FakeAdbClient } from '../helpers/fake-adb.js';

class ScriptedEvents implements RecorderEventSource {
  private idx = 0;
  constructor(private readonly events: RecorderEvent[]) {}
  async next(): Promise<RecorderEvent> {
    if (this.idx >= this.events.length) return { type: 'quit' };
    return this.events[this.idx++]!;
  }
}

describe('Recorder', () => {
  it('records launch + 2 captures + quit', async () => {
    const adb = new FakeAdbClient();
    const events = new ScriptedEvents([
      { type: 'capture', actionType: 'tap' },
      { type: 'capture', actionType: 'input', value: 'hello@example.com' },
      { type: 'quit' },
    ]);
    const r = new Recorder({
      adb,
      serial: 'emulator-5554',
      packageName: 'com.example.app',
      flowName: 'login',
      events,
      now: () => 1000,
    });
    const session = await r.run();
    expect(session.actionCount).toBe(3); // launch + tap + input
    expect(session.screenshots.length).toBe(3); // initial + after-tap + after-input
    expect(session.flowName).toBe('login');

    // Verify it called launchApp once
    const launches = adb.calls.filter((c) => c.method === 'launchApp');
    expect(launches).toHaveLength(1);
    expect(launches[0]?.args).toEqual(['emulator-5554', 'com.example.app']);
  });

  it('quit-immediately produces just launch action+state', async () => {
    const adb = new FakeAdbClient();
    const events = new ScriptedEvents([{ type: 'quit' }]);
    const r = new Recorder({
      adb,
      serial: 'emulator-5554',
      packageName: 'com.example.app',
      flowName: 'empty',
      events,
      now: () => 0,
    });
    const session = await r.run();
    expect(session.actionCount).toBe(1);
    expect(session.screenshots.length).toBe(1);
  });

  it('input action carries value', async () => {
    const adb = new FakeAdbClient();
    const events = new ScriptedEvents([
      { type: 'capture', actionType: 'input', value: 'test@x.com' },
      { type: 'quit' },
    ]);
    const r = new Recorder({
      adb,
      serial: 'e',
      packageName: 'p',
      flowName: 'i',
      events,
      now: () => 0,
    });
    const session = await r.run();
    const bundle = session.toBundle();
    expect(bundle.actions[1]?.type).toBe('input');
    expect(bundle.actions[1]?.value).toBe('test@x.com');
  });
});
```

- [ ] **Step 2: Confirm fail**

```bash
cd cli && npm test -- tests/capture/recorder.test.ts
```

- [ ] **Step 3: Implement**

Create `cli/src/capture/recorder.ts`:

```typescript
import type { AdbClient } from '../adb/client.js';
import type { ActionType } from '../lib/trace-types.js';
import { CaptureSession } from './session.js';

export type RecorderEvent =
  | { type: 'capture'; actionType: ActionType; value?: string }
  | { type: 'quit' };

export interface RecorderEventSource {
  next(): Promise<RecorderEvent>;
}

export interface RecorderOpts {
  adb: AdbClient;
  serial: string;
  packageName: string;
  flowName: string;
  events: RecorderEventSource;
  intent?: string;
  now?: () => number;
}

export class Recorder {
  constructor(private readonly opts: RecorderOpts) {}

  async run(): Promise<CaptureSession> {
    const now = this.opts.now ?? (() => Date.now());
    const startedAtMs = now();
    const session = new CaptureSession({
      flowName: this.opts.flowName,
      startedAtMs,
      intent: this.opts.intent,
    });

    // 1) Launch + initial state capture
    await this.opts.adb.launchApp(this.opts.serial, this.opts.packageName);
    session.recordAction({ type: 'launch', tsMs: now() });
    await this.captureState(session, now);

    // 2) Loop
    while (true) {
      const ev = await this.opts.events.next();
      if (ev.type === 'quit') break;
      // Execute side-effects for non-tap actions where we can. tap/swipe require the
      // human's physical interaction with the emulator; the Recorder cannot replay
      // their tap. But "back", "home", and "input" can be issued by us.
      if (ev.actionType === 'back') {
        await this.opts.adb.pressKey(this.opts.serial, 'back');
      } else if (ev.actionType === 'home') {
        await this.opts.adb.pressKey(this.opts.serial, 'home');
      } else if (ev.actionType === 'input' && ev.value !== undefined) {
        await this.opts.adb.inputText(this.opts.serial, ev.value);
      }
      session.recordAction({
        type: ev.actionType,
        tsMs: now(),
        value: ev.value,
      });
      await this.captureState(session, now);
    }

    return session;
  }

  private async captureState(session: CaptureSession, now: () => number): Promise<void> {
    const [tree, screenshot, logs] = await Promise.all([
      this.opts.adb.uiautomatorDump(this.opts.serial),
      this.opts.adb.screencap(this.opts.serial),
      this.opts.adb.logcatSnapshot(this.opts.serial, session.startedAtMs),
    ]);
    session.recordState({
      uiTree: tree as unknown as Record<string, unknown>,
      screenshot,
      tsMs: now(),
    });
    if (logs.length > 0) session.appendLogs(logs);
  }
}
```

- [ ] **Step 4: Verify pass (3 tests)**

```bash
cd cli && npm test -- tests/capture/recorder.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add cli/src/capture/recorder.ts cli/tests/capture/recorder.test.ts
git commit -m "feat(cli): add Recorder for interactive capture loop"
```

---

## Task 13: Real stdin EventSource

**Files:**
- Create: `cli/src/capture/stdin-events.ts`

The interactive stdin reader. Translates keypresses into RecorderEvents.

- [ ] **Step 1: Implement**

Create `cli/src/capture/stdin-events.ts`:

```typescript
import * as readline from 'node:readline';
import type { RecorderEvent, RecorderEventSource } from './recorder.js';
import type { ActionType } from '../lib/trace-types.js';

const KEY_TO_ACTION: Record<string, ActionType> = {
  t: 'tap',
  s: 'swipe',
  w: 'wait',
  b: 'back',
  h: 'home',
};

export interface StdinEventSourceOpts {
  // function for printing user-visible prompts (so tests can mute)
  log: (msg: string) => void;
  // input stream — default process.stdin
  input?: NodeJS.ReadStream;
  // for prompting the input value when actionType is 'input'
  promptForInput: (question: string) => Promise<string>;
}

export class StdinEventSource implements RecorderEventSource {
  private readonly input: NodeJS.ReadStream;
  private resolver: ((ev: RecorderEvent) => void) | null = null;
  private readonly buffer: RecorderEvent[] = [];
  private pendingActionType: ActionType | null = null;
  private rl: readline.Interface | null = null;
  private setup = false;

  constructor(private readonly opts: StdinEventSourceOpts) {
    this.input = opts.input ?? process.stdin;
  }

  private ensureSetup(): void {
    if (this.setup) return;
    this.setup = true;
    readline.emitKeypressEvents(this.input);
    if (this.input.isTTY) this.input.setRawMode(true);

    this.input.on('keypress', async (_str: string, key: { name?: string; ctrl?: boolean; sequence?: string }) => {
      if (!key) return;
      if (key.ctrl && key.name === 'c') {
        this.emit({ type: 'quit' });
        return;
      }
      if (key.name === 'q') {
        this.emit({ type: 'quit' });
        return;
      }
      if (key.name === 'space') {
        const actionType = this.pendingActionType ?? 'tap';
        this.pendingActionType = null;
        if (actionType === 'input') {
          // Drop out of raw mode for the prompt
          if (this.input.isTTY) this.input.setRawMode(false);
          const value = await this.opts.promptForInput('value> ');
          if (this.input.isTTY) this.input.setRawMode(true);
          this.emit({ type: 'capture', actionType, value });
        } else {
          this.emit({ type: 'capture', actionType });
        }
        return;
      }
      const k = key.name ?? '';
      if (k === 'i') {
        this.pendingActionType = 'input';
        this.opts.log('  (next SPACE = input)');
        return;
      }
      const mapped = KEY_TO_ACTION[k];
      if (mapped) {
        this.pendingActionType = mapped;
        this.opts.log(`  (next SPACE = ${mapped})`);
      }
    });
  }

  private emit(ev: RecorderEvent): void {
    if (this.resolver) {
      const r = this.resolver;
      this.resolver = null;
      r(ev);
    } else {
      this.buffer.push(ev);
    }
  }

  async next(): Promise<RecorderEvent> {
    this.ensureSetup();
    if (this.buffer.length > 0) return this.buffer.shift()!;
    return await new Promise<RecorderEvent>((resolve) => {
      this.resolver = resolve;
    });
  }

  cleanup(): void {
    if (this.input.isTTY) this.input.setRawMode(false);
    this.rl?.close();
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd cli && npm run typecheck
```

(No unit test for this — it's tightly coupled to TTY raw mode. The manual e2e in Task 19 exercises it.)

- [ ] **Step 3: Commit**

```bash
git add cli/src/capture/stdin-events.ts
git commit -m "feat(cli): add StdinEventSource for interactive keypress capture"
```

---

## Task 14: CLI program skeleton + main.ts

**Files:**
- Create: `cli/src/program.ts`
- Create: `cli/src/main.ts`

- [ ] **Step 1: Create the program builder**

Create `cli/src/program.ts`:

```typescript
import { Command } from 'commander';
import kleur from 'kleur';
import { CliError } from './lib/errors.js';

export interface ProgramDeps {
  // Each command receives the deps it needs. Wired up via the buildProgram options.
  // Concrete commands are added by registerCommands().
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('scout')
    .description('Scout CLI — record happy-path flows on Android emulators and upload to the Scout backend.')
    .version('0.1.0');
  // Commands are registered by main.ts (lets it inject deps).
  return program;
}

export function reportError(err: unknown): number {
  if (err instanceof CliError) {
    console.error(kleur.red(`scout: ${err.code}: ${err.message}`));
    return err.exitCode;
  }
  console.error(kleur.red(`scout: unexpected error: ${(err as Error).message}`));
  return 1;
}
```

- [ ] **Step 2: Create main.ts**

Create `cli/src/main.ts`:

```typescript
#!/usr/bin/env node
import { buildProgram, reportError } from './program.js';

async function main(): Promise<void> {
  const program = buildProgram();
  // Commands will be registered in Tasks 15-18 by `registerCommands(program)`.
  // For now, the program just exposes --help / --version.
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    process.exit(reportError(err));
  }
}

await main();
```

- [ ] **Step 3: Typecheck and build**

```bash
cd cli && npm run typecheck && npm run build
```

Expected: clean. `dist/main.js` exists with shebang.

- [ ] **Step 4: Smoke test**

```bash
cd cli && node dist/main.js --help
# Expected: prints help with "scout" name + version 0.1.0
node dist/main.js --version
# Expected: 0.1.0
```

- [ ] **Step 5: Commit**

```bash
git add cli/src/program.ts cli/src/main.ts
git commit -m "feat(cli): add commander program skeleton + main entrypoint"
```

---

## Task 15: `scout init` command (TDD)

**Files:**
- Create: `cli/src/commands/init.ts`
- Create: `cli/tests/commands/init.test.ts`
- Modify: `cli/src/main.ts`

`scout init` prompts for project name + app package, POSTs to /projects, writes `scout.toml`.

- [ ] **Step 1: Failing test**

Create `cli/tests/commands/init.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeTmpDir, removeTmpDir } from '../helpers/tmp-dir.js';
import { startMockBackend, type MockBackend } from '../helpers/mock-backend.js';
import { runInit } from '../../src/commands/init.js';

describe('runInit', () => {
  let backend: MockBackend;
  const apiKey = 'init-test-1234';
  beforeAll(async () => { backend = await startMockBackend(apiKey); });
  afterAll(async () => { await backend.close(); });

  let dir: string;
  beforeEach(async () => { dir = await makeTmpDir(); });
  afterEach(async () => { await removeTmpDir(dir); });

  it('creates a project on the backend and writes scout.toml', async () => {
    await runInit({
      cwd: dir,
      env: { SCOUT_API_KEY: apiKey },
      projectName: 'demo-app',
      appPackage: 'com.example.demo',
      backendUrl: backend.url,
    });
    const toml = await readFile(join(dir, 'scout.toml'), 'utf-8');
    expect(toml).toContain('name = "demo-app"');
    expect(toml).toContain('app_package = "com.example.demo"');
    expect(toml).toMatch(/id = "[0-9a-f-]{36}"/);
    expect(toml).toContain('url = "' + backend.url + '"');
  });

  it('refuses to overwrite an existing scout.toml', async () => {
    // First run creates it
    await runInit({
      cwd: dir,
      env: { SCOUT_API_KEY: apiKey },
      projectName: 'a',
      appPackage: 'com.a',
      backendUrl: backend.url,
    });
    // Second run should error
    await expect(
      runInit({
        cwd: dir,
        env: { SCOUT_API_KEY: apiKey },
        projectName: 'b',
        appPackage: 'com.b',
        backendUrl: backend.url,
      }),
    ).rejects.toThrow(/already exists/i);
  });
});
```

- [ ] **Step 2: Confirm fail**

```bash
cd cli && npm test -- tests/commands/init.test.ts
```

- [ ] **Step 3: Implement**

Create `cli/src/commands/init.ts`:

```typescript
import { writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import toml from '@iarna/toml';
import { CliError } from '../lib/errors.js';
import { BackendClient } from '../upload/client.js';

export interface InitInput {
  cwd: string;
  env: Record<string, string | undefined>;
  projectName: string;
  appPackage: string;
  backendUrl: string;
}

export async function runInit(input: InitInput): Promise<void> {
  const tomlPath = resolve(input.cwd, 'scout.toml');
  try {
    await access(tomlPath);
    throw new CliError(1, 'config_exists', `scout.toml already exists at ${tomlPath}.`);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }

  const apiKey = input.env.SCOUT_API_KEY;
  if (!apiKey) {
    throw new CliError(1, 'no_api_key', 'SCOUT_API_KEY environment variable is required.');
  }

  const client = new BackendClient({ url: input.backendUrl, apiKey });
  const project = await client.createProject({ name: input.projectName });

  const config = {
    project: {
      id: project.id,
      name: input.projectName,
      app_package: input.appPackage,
    },
    backend: {
      url: input.backendUrl,
    },
  };
  await writeFile(tomlPath, toml.stringify(config as toml.JsonMap));
}
```

- [ ] **Step 4: Verify pass (2 tests)**

```bash
cd cli && npm test -- tests/commands/init.test.ts
```

- [ ] **Step 5: Wire into program**

REPLACE `cli/src/main.ts`:

```typescript
#!/usr/bin/env node
import { buildProgram, reportError } from './program.js';
import { runInit } from './commands/init.js';

async function main(): Promise<void> {
  const program = buildProgram();

  program
    .command('init')
    .description('Initialize a Scout project in the current directory.')
    .requiredOption('--name <name>', 'Project display name')
    .requiredOption('--app-package <pkg>', 'Android package id of the app under test (e.g. com.example.app)')
    .option('--backend-url <url>', 'Backend URL', 'http://localhost:3000')
    .action(async (opts: { name: string; appPackage: string; backendUrl: string }) => {
      await runInit({
        cwd: process.cwd(),
        env: process.env,
        projectName: opts.name,
        appPackage: opts.appPackage,
        backendUrl: opts.backendUrl,
      });
      console.log(`scout: initialized project "${opts.name}" — wrote scout.toml`);
    });

  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    process.exit(reportError(err));
  }
}

await main();
```

- [ ] **Step 6: Build + smoke**

```bash
cd cli && npm run build
node dist/main.js init --help
# Expected: shows --name, --app-package, --backend-url options
```

- [ ] **Step 7: Commit**

```bash
git add cli/src/commands/init.ts cli/src/main.ts cli/tests/commands/init.test.ts
git commit -m "feat(cli): add 'scout init' command"
```

---

## Task 16: `scout record` command

**Files:**
- Create: `cli/src/commands/record.ts`
- Modify: `cli/src/main.ts`

Orchestrates: load config → find emulator → pull APK → run Recorder with StdinEventSource → finalize bundle. The bundle goes to `.scout/recordings/<flow>/<isoTimestamp>/`.

No unit test in this task — the full chain is exercised by the manual e2e in Task 19. (Recorder + StdinEventSource + Adb are individually tested.)

- [ ] **Step 1: Implement**

Create `cli/src/commands/record.ts`:

```typescript
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import * as readline from 'node:readline/promises';
import kleur from 'kleur';
import { loadConfig } from '../config/load.js';
import { AdbClientImpl } from '../adb/exec.js';
import { Recorder } from '../capture/recorder.js';
import { StdinEventSource } from '../capture/stdin-events.js';
import { finalizeBundle } from '../capture/bundle.js';
import { CliError } from '../lib/errors.js';

export interface RecordInput {
  cwd: string;
  env: Record<string, string | undefined>;
  flowName: string;
  intent?: string;
  serial?: string;
}

export async function runRecord(input: RecordInput): Promise<string> {
  const config = await loadConfig({ cwd: input.cwd, env: input.env });
  if (!config.project.id) {
    throw new CliError(1, 'project_not_initialized', 'scout.toml is missing project.id — run "scout init" first.');
  }
  const adb = new AdbClientImpl();
  const devices = await adb.devices();
  const ready = devices.filter((d) => d.state === 'device');
  if (ready.length === 0) {
    throw new CliError(1, 'no_emulator', 'No connected Android emulator/device. Start an emulator first.');
  }
  const serial = input.serial ?? ready[0]!.serial;

  console.log(kleur.cyan(`scout: using device ${serial}`));
  console.log(kleur.cyan(`scout: pulling APK for ${config.project.appPackage}...`));
  const apkPath = resolve(input.cwd, '.scout', 'tmp', `${serial}.apk`);
  await adb.pullApk(serial, config.project.appPackage, apkPath);

  const apkBuffer = await readFile(apkPath);

  const startedAt = new Date();
  const bundleDir = resolve(
    input.cwd,
    '.scout', 'recordings', input.flowName, startedAt.toISOString().replace(/[:.]/g, '-'),
  );

  console.log();
  console.log(kleur.bold('Recording flow: ') + kleur.yellow(input.flowName));
  console.log('Tap on the emulator, then press SPACE to capture state.');
  console.log('Press a letter before SPACE for action type: t=tap (default), i=input, b=back, h=home, s=swipe, w=wait.');
  console.log('Press q (or Ctrl-C) when done.');
  console.log();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const eventSource = new StdinEventSource({
    log: (msg) => console.log(kleur.dim(msg)),
    promptForInput: async (q) => {
      rl.pause();
      const v = await rl.question(q);
      rl.resume();
      return v;
    },
  });

  const recorder = new Recorder({
    adb,
    serial,
    packageName: config.project.appPackage,
    flowName: input.flowName,
    events: eventSource,
    intent: input.intent,
  });

  const session = await recorder.run();
  eventSource.cleanup();
  rl.close();

  console.log();
  console.log(kleur.cyan(`scout: writing bundle to ${bundleDir}`));
  await finalizeBundle({ session, destDir: bundleDir, apk: apkBuffer });
  console.log(kleur.green(`scout: recorded ${session.actionCount} actions. Run "scout upload" to ship it.`));
  return bundleDir;
}
```

- [ ] **Step 2: Wire into main.ts**

UPDATE `cli/src/main.ts` to add the record command. Replace the existing file:

```typescript
#!/usr/bin/env node
import { buildProgram, reportError } from './program.js';
import { runInit } from './commands/init.js';
import { runRecord } from './commands/record.js';

async function main(): Promise<void> {
  const program = buildProgram();

  program
    .command('init')
    .description('Initialize a Scout project in the current directory.')
    .requiredOption('--name <name>', 'Project display name')
    .requiredOption('--app-package <pkg>', 'Android package id of the app under test (e.g. com.example.app)')
    .option('--backend-url <url>', 'Backend URL', 'http://localhost:3000')
    .action(async (opts: { name: string; appPackage: string; backendUrl: string }) => {
      await runInit({
        cwd: process.cwd(),
        env: process.env,
        projectName: opts.name,
        appPackage: opts.appPackage,
        backendUrl: opts.backendUrl,
      });
      console.log(`scout: initialized project "${opts.name}" — wrote scout.toml`);
    });

  program
    .command('record <flow>')
    .description('Record a happy-path flow against a connected emulator.')
    .option('--intent <text>', 'Optional intent annotation')
    .option('--serial <serial>', 'Specific emulator serial (default: first connected)')
    .action(async (flow: string, opts: { intent?: string; serial?: string }) => {
      await runRecord({
        cwd: process.cwd(),
        env: process.env,
        flowName: flow,
        intent: opts.intent,
        serial: opts.serial,
      });
    });

  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    process.exit(reportError(err));
  }
}

await main();
```

- [ ] **Step 3: Typecheck + build**

```bash
cd cli && npm run typecheck && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add cli/src/commands/record.ts cli/src/main.ts
git commit -m "feat(cli): add 'scout record' command"
```

---

## Task 17: `scout done` recovery command

**Files:**
- Create: `cli/src/commands/done.ts`
- Modify: `cli/src/main.ts`

If `scout record` crashed mid-flow before writing trace.json, `scout done` is a placeholder that informs the user to re-record. In a future Plan 2.5 it can actually recover a partial in-memory dump from a recovery file.

For Plan 2, `scout done` simply confirms the most recent recording dir is finalized (has `trace.json`). If not, it errors with guidance.

- [ ] **Step 1: Implement**

Create `cli/src/commands/done.ts`:

```typescript
import { resolve } from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { CliError } from '../lib/errors.js';

export interface DoneInput {
  cwd: string;
  flowName?: string;
}

export async function runDone(input: DoneInput): Promise<{ bundleDir: string; finalized: boolean }> {
  const recordingsRoot = resolve(input.cwd, '.scout', 'recordings');
  if (!existsSync(recordingsRoot)) {
    throw new CliError(1, 'no_recordings', 'No .scout/recordings/ directory found.');
  }
  const flow = input.flowName ?? (await findMostRecentFlow(recordingsRoot));
  if (!flow) {
    throw new CliError(1, 'no_recordings', 'No flows found under .scout/recordings/.');
  }
  const flowDir = resolve(recordingsRoot, flow);
  const sessionDir = await findMostRecentSession(flowDir);
  if (!sessionDir) {
    throw new CliError(1, 'no_recordings', `No sessions for flow ${flow}.`);
  }
  const traceJsonPath = resolve(sessionDir, 'trace.json');
  const finalized = existsSync(traceJsonPath);
  return { bundleDir: sessionDir, finalized };
}

async function findMostRecentFlow(root: string): Promise<string | null> {
  const entries = await readdir(root);
  let best: { name: string; mtime: number } | null = null;
  for (const name of entries) {
    const s = await stat(resolve(root, name));
    if (!s.isDirectory()) continue;
    if (!best || s.mtimeMs > best.mtime) best = { name, mtime: s.mtimeMs };
  }
  return best?.name ?? null;
}

async function findMostRecentSession(flowDir: string): Promise<string | null> {
  const entries = await readdir(flowDir);
  let best: { dir: string; mtime: number } | null = null;
  for (const name of entries) {
    const dir = resolve(flowDir, name);
    const s = await stat(dir);
    if (!s.isDirectory()) continue;
    if (!best || s.mtimeMs > best.mtime) best = { dir, mtime: s.mtimeMs };
  }
  return best?.dir ?? null;
}
```

- [ ] **Step 2: Wire into main.ts**

Add to `cli/src/main.ts` after the record command and before the `try`:

```typescript
  program
    .command('done')
    .description('Report the status of the most recent recording (recovery helper).')
    .option('--flow <name>', 'Specific flow name (default: most recent)')
    .action(async (opts: { flow?: string }) => {
      const r = await runDone({ cwd: process.cwd(), flowName: opts.flow });
      if (r.finalized) {
        console.log(`scout: bundle at ${r.bundleDir} is finalized.`);
      } else {
        console.log(`scout: bundle at ${r.bundleDir} is INCOMPLETE (no trace.json). Re-record the flow.`);
      }
    });
```

And add the import:

```typescript
import { runDone } from './commands/done.js';
```

- [ ] **Step 3: Typecheck + build**

```bash
cd cli && npm run typecheck && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add cli/src/commands/done.ts cli/src/main.ts
git commit -m "feat(cli): add 'scout done' recovery-check command"
```

---

## Task 18: `scout upload` command (TDD)

**Files:**
- Create: `cli/src/commands/upload.ts`
- Create: `cli/tests/commands/upload.test.ts`
- Modify: `cli/src/main.ts`

Reads the most-recent bundle, ships it to the backend, persists the returned run id to `<bundle>/run-id.txt`.

- [ ] **Step 1: Failing test**

Create `cli/tests/commands/upload.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeTmpDir, removeTmpDir } from '../helpers/tmp-dir.js';
import { startMockBackend, type MockBackend } from '../helpers/mock-backend.js';
import { runUpload } from '../../src/commands/upload.js';
import { runInit } from '../../src/commands/init.js';

describe('runUpload', () => {
  let backend: MockBackend;
  const apiKey = 'upload-test-1234';
  beforeAll(async () => { backend = await startMockBackend(apiKey); });
  afterAll(async () => { await backend.close(); });

  let dir: string;
  beforeEach(async () => { dir = await makeTmpDir(); });
  afterEach(async () => { await removeTmpDir(dir); });

  it('uploads the most recent bundle and writes run-id.txt', async () => {
    // Initialize a project
    await runInit({
      cwd: dir,
      env: { SCOUT_API_KEY: apiKey },
      projectName: 'upload-app',
      appPackage: 'com.x',
      backendUrl: backend.url,
    });

    // Lay down a fake bundle
    const bundleDir = join(dir, '.scout', 'recordings', 'flow1', '2026-05-13T10-00-00-000Z');
    await mkdir(join(bundleDir, 'screens'), { recursive: true });
    const trace = {
      version: 1,
      recorded_at: '2026-05-13T10:00:00.000Z',
      flow_name: 'flow1',
      actions: [{ type: 'launch', timestamp_ms: 0 }],
      states: [{ after_action_index: 0, screenshot_path: 'screens/0.png', ui_tree: {}, timestamp_ms: 100 }],
    };
    await writeFile(join(bundleDir, 'trace.json'), JSON.stringify(trace));
    await writeFile(join(bundleDir, 'screens', '0.png'), Buffer.from('PNG0'));
    await writeFile(join(bundleDir, 'apk.apk'), Buffer.from('PKfake'));

    const result = await runUpload({
      cwd: dir,
      env: { SCOUT_API_KEY: apiKey },
      personas: ['happy-rusher'],
    });

    expect(result.runId).toMatch(/^[0-9a-f-]{36}$/);
    const persisted = await readFile(join(bundleDir, 'run-id.txt'), 'utf-8');
    expect(persisted.trim()).toBe(result.runId);
    expect(backend.receivedRuns).toHaveLength(1);
    expect(backend.receivedRuns[0]?.apkSize).toBe(6); // "PKfake"
  });

  it('errors when there is no bundle', async () => {
    await runInit({
      cwd: dir,
      env: { SCOUT_API_KEY: apiKey },
      projectName: 'app',
      appPackage: 'com.x',
      backendUrl: backend.url,
    });
    await expect(
      runUpload({ cwd: dir, env: { SCOUT_API_KEY: apiKey }, personas: ['happy-rusher'] }),
    ).rejects.toThrow(/no recording/i);
  });
});
```

- [ ] **Step 2: Confirm fail**

```bash
cd cli && npm test -- tests/commands/upload.test.ts
```

- [ ] **Step 3: Implement**

Create `cli/src/commands/upload.ts`:

```typescript
import { resolve } from 'node:path';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { loadConfig } from '../config/load.js';
import { BackendClient } from '../upload/client.js';
import { CliError } from '../lib/errors.js';
import type { TraceBundleV1 } from '../lib/trace-types.js';

export interface UploadInput {
  cwd: string;
  env: Record<string, string | undefined>;
  flowName?: string;
  personas: string[];
  intent?: string;
}

export interface UploadResult {
  runId: string;
  bundleDir: string;
}

export async function runUpload(input: UploadInput): Promise<UploadResult> {
  const config = await loadConfig({ cwd: input.cwd, env: input.env });
  const bundleDir = await findBundle(input.cwd, input.flowName);

  const traceJsonPath = resolve(bundleDir, 'trace.json');
  const apkPath = resolve(bundleDir, 'apk.apk');
  if (!existsSync(traceJsonPath)) {
    throw new CliError(1, 'no_recording', `No trace.json in ${bundleDir}. Did "scout record" finish?`);
  }
  if (!existsSync(apkPath)) {
    throw new CliError(1, 'no_apk', `No apk.apk in ${bundleDir}.`);
  }
  const trace = JSON.parse(await readFile(traceJsonPath, 'utf-8')) as TraceBundleV1;
  const apk = await readFile(apkPath);

  const client = new BackendClient({ url: config.backend.url, apiKey: config.backend.apiKey });
  const result = await client.postRun({
    apk,
    trace,
    metadata: {
      project_id: config.project.id,
      mode: 'exploration',
      personas: input.personas,
      intent: input.intent,
    },
  });

  await writeFile(resolve(bundleDir, 'run-id.txt'), result.run.id + '\n');
  return { runId: result.run.id, bundleDir };
}

async function findBundle(cwd: string, flowName?: string): Promise<string> {
  const root = resolve(cwd, '.scout', 'recordings');
  if (!existsSync(root)) {
    throw new CliError(1, 'no_recording', 'No .scout/recordings/ directory. Record a flow first.');
  }
  const flow = flowName ?? (await mostRecent(root));
  if (!flow) {
    throw new CliError(1, 'no_recording', 'No flows in .scout/recordings/.');
  }
  const flowDir = resolve(root, flow);
  const session = await mostRecent(flowDir);
  if (!session) {
    throw new CliError(1, 'no_recording', `No sessions for flow ${flow}.`);
  }
  return resolve(flowDir, session);
}

async function mostRecent(dir: string): Promise<string | null> {
  const entries = await readdir(dir);
  let best: { name: string; mtime: number } | null = null;
  for (const name of entries) {
    const s = await stat(resolve(dir, name));
    if (!s.isDirectory()) continue;
    if (!best || s.mtimeMs > best.mtime) best = { name, mtime: s.mtimeMs };
  }
  return best?.name ?? null;
}
```

- [ ] **Step 4: Verify pass (2 tests)**

```bash
cd cli && npm test -- tests/commands/upload.test.ts
```

- [ ] **Step 5: Wire into main.ts**

Add to `cli/src/main.ts` after the done command:

```typescript
  program
    .command('upload')
    .description('Upload the most recent recording to the backend.')
    .option('--flow <name>', 'Specific flow name (default: most recent)')
    .option('--personas <list>', 'Comma-separated persona names', 'happy-rusher,low-vision,first-timer')
    .option('--intent <text>', 'Optional intent annotation')
    .action(async (opts: { flow?: string; personas: string; intent?: string }) => {
      const personas = opts.personas.split(',').map((s) => s.trim()).filter(Boolean);
      const r = await runUpload({
        cwd: process.cwd(),
        env: process.env,
        flowName: opts.flow,
        personas,
        intent: opts.intent,
      });
      console.log(`scout: uploaded ${r.bundleDir}`);
      console.log(`scout: run id ${r.runId}`);
    });
```

Add the import:

```typescript
import { runUpload } from './commands/upload.js';
```

- [ ] **Step 6: Typecheck + build**

```bash
cd cli && npm run typecheck && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add cli/src/commands/upload.ts cli/src/main.ts cli/tests/commands/upload.test.ts
git commit -m "feat(cli): add 'scout upload' command"
```

---

## Task 19: `scout status` command

**Files:**
- Create: `cli/src/commands/status.ts`
- Modify: `cli/src/main.ts`

Reports: configured project, last recording, last upload (if any).

- [ ] **Step 1: Implement**

Create `cli/src/commands/status.ts`:

```typescript
import { resolve } from 'node:path';
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { loadConfig } from '../config/load.js';

export interface StatusInput {
  cwd: string;
  env: Record<string, string | undefined>;
}

export interface StatusResult {
  project: { id: string; name: string; appPackage: string };
  backendUrl: string;
  lastBundleDir: string | null;
  lastRunId: string | null;
}

export async function runStatus(input: StatusInput): Promise<StatusResult> {
  const config = await loadConfig({ cwd: input.cwd, env: input.env });
  const recordingsRoot = resolve(input.cwd, '.scout', 'recordings');
  let lastBundleDir: string | null = null;
  let lastRunId: string | null = null;

  if (existsSync(recordingsRoot)) {
    const flow = await mostRecent(recordingsRoot);
    if (flow) {
      const flowDir = resolve(recordingsRoot, flow);
      const session = await mostRecent(flowDir);
      if (session) {
        lastBundleDir = resolve(flowDir, session);
        const runIdFile = resolve(lastBundleDir, 'run-id.txt');
        if (existsSync(runIdFile)) {
          lastRunId = (await readFile(runIdFile, 'utf-8')).trim();
        }
      }
    }
  }

  return {
    project: config.project,
    backendUrl: config.backend.url,
    lastBundleDir,
    lastRunId,
  };
}

async function mostRecent(dir: string): Promise<string | null> {
  const entries = await readdir(dir);
  let best: { name: string; mtime: number } | null = null;
  for (const name of entries) {
    const s = await stat(resolve(dir, name));
    if (!s.isDirectory()) continue;
    if (!best || s.mtimeMs > best.mtime) best = { name, mtime: s.mtimeMs };
  }
  return best?.name ?? null;
}
```

- [ ] **Step 2: Wire into main.ts**

Add the command and import:

```typescript
import { runStatus } from './commands/status.js';

// in main(), after upload command:
  program
    .command('status')
    .description('Show current project + last recording + last upload.')
    .action(async () => {
      const s = await runStatus({ cwd: process.cwd(), env: process.env });
      console.log(`project:   ${s.project.name} (${s.project.id})`);
      console.log(`package:   ${s.project.appPackage}`);
      console.log(`backend:   ${s.backendUrl}`);
      console.log(`last bundle: ${s.lastBundleDir ?? '(none)'}`);
      console.log(`last run:    ${s.lastRunId ?? '(not uploaded)'}`);
    });
```

- [ ] **Step 3: Typecheck + build**

```bash
cd cli && npm run typecheck && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add cli/src/commands/status.ts cli/src/main.ts
git commit -m "feat(cli): add 'scout status' command"
```

---

## Task 20: README + smoke walkthrough + final manual e2e

**Files:**
- Create: `cli/README.md`
- Create: `cli/docs/smoke-test.md`

The acceptance gate: end-to-end against a real backend + real emulator.

- [ ] **Step 1: README**

Create `cli/README.md`:

```markdown
# Scout CLI

`scout` records happy-path flows against a local Android emulator and uploads them to the Scout backend (Plan 1).

## Prerequisites

- Node.js 22+
- Android SDK platform-tools (`adb` in PATH)
- A running Android emulator with the app under test installed
- The Scout backend running and reachable

## Install (from this repo)

```bash
cd cli && npm install && npm run build
npm link  # exposes `scout` on PATH
```

## First-time setup

```bash
export SCOUT_API_KEY=<your-key>
scout init --name "My App" --app-package com.example.app
# writes scout.toml in the current directory
```

## Recording a flow

```bash
scout record checkout
# Connects to first available emulator.
# Pulls the APK from the emulator.
# Launches the app.
# Interactive loop:
#   - Tap on emulator → press SPACE to capture state (default action: tap)
#   - Press a letter before SPACE for action type: t/i/b/h/s/w
#   - Press q to finish.
```

The bundle is written to `.scout/recordings/<flow>/<timestamp>/`.

## Uploading

```bash
scout upload
# Sends the most recent bundle (apk + trace.json) to the backend.
# Writes the returned run id to <bundle>/run-id.txt.
```

## Status

```bash
scout status
# Shows project, last bundle, last run id.
```

## Recovery

```bash
scout done
# Checks whether the most recent recording was finalized.
```

## Project layout

- `src/adb/` — adb wrapper + UI tree / logcat parsers
- `src/capture/` — CaptureSession + Recorder + bundle writer
- `src/upload/` — BackendClient
- `src/commands/` — init / record / done / upload / status
- `src/config/` — scout.toml loader

See `docs/smoke-test.md` for the manual end-to-end test.
```

- [ ] **Step 2: Smoke test doc**

Create `cli/docs/smoke-test.md`:

```markdown
# CLI smoke test

End-to-end manual verification against a real backend + real Android emulator.

## Prerequisites

1. Backend running (`cd ../backend && npm run dev`)
2. Android emulator running with a sample app installed (any app — for the smoke test we use `com.android.settings`)
3. `adb devices` shows the emulator

## 1. Initialize

```bash
mkdir /tmp/scout-smoke && cd /tmp/scout-smoke
export SCOUT_API_KEY=<your-key>
scout init --name smoke-app --app-package com.android.settings
cat scout.toml
```

Should show the project id from the backend and the package.

## 2. Record

```bash
scout record smoke
```

Follow the prompts:
- Press SPACE once (captures initial settings screen)
- Tap a Settings row on the emulator
- Press SPACE (captures the result)
- Press "b" then SPACE to record a back-press (CLI also issues the back via adb)
- Press SPACE one more time (captures the result of going back)
- Press q

Verify:
- `ls .scout/recordings/smoke/` shows one directory
- That directory contains `trace.json`, `apk.apk`, and `screens/0.png` through `screens/3.png`
- `screens/0.png` opens as a valid PNG

## 3. Upload

```bash
scout upload --personas happy-rusher,first-timer
```

Should print `scout: uploaded ...` and `scout: run id <uuid>`.

Verify on the backend:
```bash
curl -s http://localhost:3000/runs/<run-id> -H "x-scout-api-key: $SCOUT_API_KEY" | jq .
# Should show run.status: "queued" and 2 sessions
```

## 4. Status

```bash
scout status
# Shows project, last bundle, last run id matching what was just uploaded
```

## 5. Cleanup

```bash
rm -rf /tmp/scout-smoke
```

If all 5 steps succeed, Plan 2 is COMPLETE.
```

- [ ] **Step 3: Run the full test suite one more time**

```bash
cd cli && npm test
```

Expected: all CLI tests pass.

- [ ] **Step 4: Run typecheck + build**

```bash
cd cli && npm run typecheck && npm run build
```

- [ ] **Step 5: Commit the docs**

```bash
git add cli/README.md cli/docs/smoke-test.md
git commit -m "docs(cli): README + smoke test walkthrough"
```

- [ ] **Step 6: MANUAL END-TO-END SMOKE TEST**

This is the acceptance gate. You will:
1. Start the backend
2. Start an Android emulator
3. Install + link the CLI
4. Run init → record → upload → status against real emulator + real backend
5. Confirm each step works

a) Start backend (run in a separate terminal or background):

```bash
docker run -d --name scout-pg-cli-smoke \
  -e POSTGRES_USER=scout -e POSTGRES_PASSWORD=scout -e POSTGRES_DB=scout \
  -p 5432:5432 postgres:16-alpine
sleep 5
cd backend
cat > .env <<EOF
DATABASE_URL=postgres://scout:scout@localhost:5432/scout
SCOUT_API_KEY=cli-smoke-key-1234
STORAGE_DIR=./storage
PORT=3000
EOF
npm run db:migrate
npm run dev > /tmp/scout-backend-cli-smoke.log 2>&1 &
BACKEND_PID=$!
sleep 3
curl -s http://localhost:3000/health   # expect {"status":"ok"}
```

b) Start an Android emulator from Android Studio (any AVD with API ≥ 30). Wait until `adb devices` shows it as "device" state.

If you don't have an emulator running, skip the manual e2e — verify only that all tests pass and the build is clean. Document this in your report.

c) Link the CLI and run the smoke test:

```bash
cd cli && npm link
mkdir /tmp/scout-cli-smoke && cd /tmp/scout-cli-smoke
export SCOUT_API_KEY=cli-smoke-key-1234

scout init --name "smoke" --app-package com.android.settings
ls scout.toml && cat scout.toml

scout record smoke
# Interactive — see docs/smoke-test.md for steps. Press q when done.

ls .scout/recordings/smoke/*
scout upload --personas happy-rusher
scout status
```

d) Cleanup:

```bash
kill $BACKEND_PID || true
docker rm -f scout-pg-cli-smoke || true
cd cli && npm unlink -g @scout/cli || true
rm -rf /tmp/scout-cli-smoke
```

e) Confirm git tree is clean:

```bash
git status --short
```

(The `.scout/` directories under `/tmp` are outside the repo; `cli/.scout/` is gitignored.)

## Self-Review

- All commits in order (T1 through T20 + this final docs/verify commit).
- All Vitest tests pass.
- `npm run typecheck` + `npm run build` clean.
- Manual e2e exercised: init / record / upload / status against a real backend + real emulator. If no emulator was available, all unit + integration tests still cover the wiring; flag this in your report.
- Working tree clean.

## Report

- Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- All commit SHAs (T1-T20)
- Final `npm test` count
- Manual e2e: ran / skipped (with reason)
- Any concerns

Under 300 words.
