import { describe, it, expect } from 'vitest';
import { buildServer } from '../../src/server.js';

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const app = await buildServer({ apiKey: 'test-key' });
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});
