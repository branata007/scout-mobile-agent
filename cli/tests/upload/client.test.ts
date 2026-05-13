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
