import Fastify, { type FastifyInstance } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import { registerApiKeyAuth } from './auth/api-key.js';
import { healthRoutes } from './routes/health.js';
import { projectsRoutes } from './routes/projects.js';
import { runsRoutes } from './routes/runs.js';
import type { Db } from './db/client.js';
import type { StorageAdapter } from './storage/adapter.js';

export interface ServerDeps {
  apiKey: string;
  db: Db;
  storage: StorageAdapter;
}

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 500 * 1024 * 1024, // 500MB cap for APK
      files: 5,
    },
  });
  await registerApiKeyAuth(app, { apiKey: deps.apiKey });
  app.decorate('db', deps.db);
  app.decorate('storage', deps.storage);
  await app.register(healthRoutes);
  await app.register(projectsRoutes);
  await app.register(runsRoutes);
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    storage: StorageAdapter;
  }
}
