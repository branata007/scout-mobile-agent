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
    await runInit({
      cwd: dir,
      env: { SCOUT_API_KEY: apiKey },
      projectName: 'upload-app',
      appPackage: 'com.x',
      backendUrl: backend.url,
    });

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
