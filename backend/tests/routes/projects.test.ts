import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestApp, type TestApp } from '../helpers/test-app.js';

describe('projects routes', () => {
  let t: TestApp;
  beforeAll(async () => { t = await startTestApp(); }, 90000);
  afterAll(async () => { await t.close(); });

  it('POST /projects creates and returns a project', async () => {
    const r = await t.app.inject({
      method: 'POST',
      url: '/projects',
      headers: { 'x-scout-api-key': t.apiKey, 'content-type': 'application/json' },
      payload: { name: 'demo-app', default_personas: ['happy-rusher'] },
    });
    expect(r.statusCode).toBe(201);
    const body = r.json();
    expect(body.name).toBe('demo-app');
    expect(body.default_personas).toEqual(['happy-rusher']);
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('POST /projects rejects missing name', async () => {
    const r = await t.app.inject({
      method: 'POST',
      url: '/projects',
      headers: { 'x-scout-api-key': t.apiKey, 'content-type': 'application/json' },
      payload: { default_personas: [] },
    });
    expect(r.statusCode).toBe(400);
  });

  it('GET /projects/:id returns 404 for missing', async () => {
    const r = await t.app.inject({
      method: 'GET',
      url: '/projects/00000000-0000-0000-0000-000000000000',
      headers: { 'x-scout-api-key': t.apiKey },
    });
    expect(r.statusCode).toBe(404);
  });

  it('GET /projects/:id returns the project for existing', async () => {
    const created = await t.app.inject({
      method: 'POST',
      url: '/projects',
      headers: { 'x-scout-api-key': t.apiKey, 'content-type': 'application/json' },
      payload: { name: 'fetchable' },
    });
    const { id } = created.json();
    const r = await t.app.inject({
      method: 'GET',
      url: `/projects/${id}`,
      headers: { 'x-scout-api-key': t.apiKey },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().name).toBe('fetchable');
  });

  it('GET /projects/:id without api key returns 401', async () => {
    const r = await t.app.inject({
      method: 'GET',
      url: '/projects/00000000-0000-0000-0000-000000000000',
    });
    expect(r.statusCode).toBe(401);
  });
});
