import Fastify, { type FastifyInstance } from 'fastify';
import { registerApiKeyAuth } from './auth/api-key.js';
import { healthRoutes } from './routes/health.js';
import { projectsRoutes } from './routes/projects.js';
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
  app.decorate('db', deps.db);
  app.decorate('storage', deps.storage);
  await app.register(healthRoutes);
  await app.register(projectsRoutes);
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    storage: StorageAdapter;
  }
}
