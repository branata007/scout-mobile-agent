import Fastify, { type FastifyInstance } from 'fastify';
import { healthRoutes } from './routes/health.js';

export interface ServerOptions {
  apiKey: string;
}

export async function buildServer(_opts: ServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(healthRoutes);
  return app;
}
