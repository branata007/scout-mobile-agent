import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestApp, type TestApp } from '../helpers/test-app.js';
import { readFile } from 'node:fs/promises';

async function createProjectFor(t: TestApp): Promise<string> {
  const r = await t.app.inject({
    method: 'POST',
    url: '/projects',
    headers: { 'x-scout-api-key': t.apiKey, 'content-type': 'application/json' },
    payload: { name: 'runs-test' },
  });
  return r.json().id;
}

function buildMultipart(parts: Array<{ name: string; data: Buffer; filename?: string; contentType?: string }>): { body: Buffer; contentType: string } {
  const boundary = '----scout-test-boundary-' + Math.random().toString(36).slice(2);
  const chunks: Buffer[] = [];
  for (const p of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    const disposition = p.filename
      ? `form-data; name="${p.name}"; filename="${p.filename}"`
      : `form-data; name="${p.name}"`;
    chunks.push(Buffer.from(`Content-Disposition: ${disposition}\r\n`));
    chunks.push(Buffer.from(`Content-Type: ${p.contentType ?? 'application/octet-stream'}\r\n\r\n`));
    chunks.push(p.data);
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe('POST /runs', () => {
  let t: TestApp;
  beforeAll(async () => { t = await startTestApp(); }, 90000);
  afterAll(async () => { await t.close(); });

  it('creates a run, persists APK + trace, returns run with sessions', async () => {
    const projectId = await createProjectFor(t);
    const trace = {
      version: 1,
      recorded_at: '2026-05-12T10:00:00.000Z',
      flow_name: 'checkout',
      actions: [{ type: 'launch', timestamp_ms: 0 }],
      states: [{ after_action_index: 0, screenshot_path: 's/0.png', ui_tree: {}, timestamp_ms: 100 }],
    };
    const metadata = {
      project_id: projectId,
      mode: 'exploration',
      personas: ['happy-rusher', 'low-vision'],
      intent: 'verify checkout',
    };
    const { body, contentType } = buildMultipart([
      { name: 'apk', data: Buffer.from('PKfake'), filename: 'app.apk', contentType: 'application/vnd.android.package-archive' },
      { name: 'trace', data: Buffer.from(JSON.stringify(trace)), contentType: 'application/json' },
      { name: 'metadata', data: Buffer.from(JSON.stringify(metadata)), contentType: 'application/json' },
    ]);

    const r = await t.app.inject({
      method: 'POST',
      url: '/runs',
      headers: { 'x-scout-api-key': t.apiKey, 'content-type': contentType },
      payload: body,
    });

    expect(r.statusCode).toBe(201);
    const json = r.json();
    expect(json.run.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(json.run.project_id).toBe(projectId);
    expect(json.run.status).toBe('queued');
    expect(json.run.mode).toBe('exploration');
    expect(json.sessions).toHaveLength(2);
    expect(json.run.apk_url).toMatch(/^file:\/\//);
    expect(json.run.trace_url).toMatch(/^file:\/\//);

    const apkPath = json.run.apk_url.replace('file://', '');
    const apkContent = await readFile(apkPath);
    expect(apkContent.toString()).toBe('PKfake');
  });

  it('rejects when metadata is missing', async () => {
    const projectId = await createProjectFor(t);
    const { body, contentType } = buildMultipart([
      { name: 'apk', data: Buffer.from('x'), filename: 'a.apk' },
      { name: 'trace', data: Buffer.from(JSON.stringify({
          version: 1, recorded_at: '2026-05-12T00:00:00.000Z', flow_name: 'f', actions: [], states: [],
        })), contentType: 'application/json' },
    ]);
    const r = await t.app.inject({
      method: 'POST', url: '/runs',
      headers: { 'x-scout-api-key': t.apiKey, 'content-type': contentType },
      payload: body,
    });
    expect(r.statusCode).toBe(400);
    void projectId;
  });

  it('rejects when trace bundle is invalid', async () => {
    const projectId = await createProjectFor(t);
    const { body, contentType } = buildMultipart([
      { name: 'apk', data: Buffer.from('x'), filename: 'a.apk' },
      { name: 'trace', data: Buffer.from(JSON.stringify({ version: 99 })), contentType: 'application/json' },
      { name: 'metadata', data: Buffer.from(JSON.stringify({ project_id: projectId, mode: 'exploration', personas: ['happy-rusher'] })), contentType: 'application/json' },
    ]);
    const r = await t.app.inject({
      method: 'POST', url: '/runs',
      headers: { 'x-scout-api-key': t.apiKey, 'content-type': contentType },
      payload: body,
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('invalid_trace');
  });

  it('rejects when project_id does not exist', async () => {
    const trace = { version: 1, recorded_at: '2026-05-12T00:00:00.000Z', flow_name: 'f', actions: [], states: [] };
    const { body, contentType } = buildMultipart([
      { name: 'apk', data: Buffer.from('x'), filename: 'a.apk' },
      { name: 'trace', data: Buffer.from(JSON.stringify(trace)), contentType: 'application/json' },
      { name: 'metadata', data: Buffer.from(JSON.stringify({ project_id: '00000000-0000-0000-0000-000000000000', mode: 'exploration', personas: ['happy-rusher'] })), contentType: 'application/json' },
    ]);
    const r = await t.app.inject({
      method: 'POST', url: '/runs',
      headers: { 'x-scout-api-key': t.apiKey, 'content-type': contentType },
      payload: body,
    });
    expect(r.statusCode).toBe(404);
    expect(r.json().error).toBe('project_not_found');
  });
});
