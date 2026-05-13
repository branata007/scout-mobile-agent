import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

const ALLOWLIST = new Set(['/health']);

export interface ApiKeyAuthOptions {
  apiKey: string;
}

export async function registerApiKeyAuth(
  app: FastifyInstance,
  opts: ApiKeyAuthOptions,
): Promise<void> {
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (ALLOWLIST.has(req.url.split('?')[0]!)) return;
    const provided = req.headers['x-scout-api-key'];
    if (typeof provided !== 'string' || provided !== opts.apiKey) {
      await reply.code(401).send({ error: 'unauthorized' });
    }
  });
}
