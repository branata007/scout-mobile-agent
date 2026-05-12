import Fastify, { type FastifyInstance } from 'fastify';
import { registerApiKeyAuth } from './auth/api-key.js';
import { healthRoutes } from './routes/health.js';
import type { Db } from './db/client.js';
import type { StorageAdapter } from './storage/adapter.js';

export interface ServerDeps {
  apiKey: string;
  db: Db;
  storage: StorageAdapter;
}

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await registerApiKeyAuth(app, { apiKey: deps.apiKey });
  await app.register(healthRoutes);

  // Make deps available to routes through decorators.
  app.decorate('db', deps.db);
  app.decorate('storage', deps.storage);

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    storage: StorageAdapter;
  }
}
