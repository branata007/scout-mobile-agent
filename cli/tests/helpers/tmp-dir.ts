import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function makeTmpDir(prefix = 'scout-cli-'): Promise<string> {
  return await mkdtemp(join(tmpdir(), prefix));
}

export async function removeTmpDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
