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
