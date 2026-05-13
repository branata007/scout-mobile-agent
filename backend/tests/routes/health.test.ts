import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestApp, type TestApp } from '../helpers/test-app.js';

describe('GET /health', () => {
  let t: TestApp;
  beforeAll(async () => { t = await startTestApp(); }, 90000);
  afterAll(async () => { await t.close(); });

  it('returns 200 with status ok and does not require auth', async () => {
    const r = await t.app.inject({ method: 'GET', url: '/health' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ status: 'ok' });
  });
});
