import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { registerApiKeyAuth } from '../../src/auth/api-key.js';

async function makeApp(apiKey: string) {
  const app = Fastify({ logger: false });
  await registerApiKeyAuth(app, { apiKey });
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/protected', async () => ({ ok: true }));
  return app;
}

describe('api key auth', () => {
  it('allows /health without a key', async () => {
    const app = await makeApp('secret');
    const r = await app.inject({ method: 'GET', url: '/health' });
    expect(r.statusCode).toBe(200);
    await app.close();
  });

  it('rejects protected route with no key', async () => {
    const app = await makeApp('secret');
    const r = await app.inject({ method: 'GET', url: '/protected' });
    expect(r.statusCode).toBe(401);
    expect(r.json()).toMatchObject({ error: 'unauthorized' });
    await app.close();
  });

  it('rejects protected route with wrong key', async () => {
    const app = await makeApp('secret');
    const r = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { 'x-scout-api-key': 'wrong' },
    });
    expect(r.statusCode).toBe(401);
    await app.close();
  });

  it('allows protected route with correct key', async () => {
    const app = await makeApp('secret');
    const r = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { 'x-scout-api-key': 'secret' },
    });
    expect(r.statusCode).toBe(200);
    await app.close();
  });
});
