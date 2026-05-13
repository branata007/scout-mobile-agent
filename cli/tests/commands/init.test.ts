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
    await runInit({
      cwd: dir,
      env: { SCOUT_API_KEY: apiKey },
      projectName: 'a',
      appPackage: 'com.a',
      backendUrl: backend.url,
    });
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
