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
