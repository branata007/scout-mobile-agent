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
