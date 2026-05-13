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
