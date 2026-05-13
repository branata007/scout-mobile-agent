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
    throw new CliError(1, 'no_recording', 'No recording found: .scout/recordings/ does not exist. Record a flow first.');
  }
  const flow = flowName ?? (await mostRecent(root));
  if (!flow) {
    throw new CliError(1, 'no_recording', 'No recording found in .scout/recordings/.');
  }
  const flowDir = resolve(root, flow);
  const session = await mostRecent(flowDir);
  if (!session) {
    throw new CliError(1, 'no_recording', `No recording sessions for flow ${flow}.`);
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
