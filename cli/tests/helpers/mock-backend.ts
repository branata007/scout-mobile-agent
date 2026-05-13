import Fastify, { type FastifyInstance } from 'fastify';

export interface MockBackend {
  url: string;
  app: FastifyInstance;
  receivedRuns: Array<{
    apkSize: number;
    trace: unknown;
    metadata: unknown;
  }>;
  close: () => Promise<void>;
}

export async function startMockBackend(apiKey: string): Promise<MockBackend> {
  const app = Fastify({ logger: false });
  await app.register(import('@fastify/multipart'), { limits: { fileSize: 100 * 1024 * 1024 } });

  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/health') return;
    if (req.headers['x-scout-api-key'] !== apiKey) {
      await reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.get('/health', async () => ({ status: 'ok' }));

  const projects = new Map<string, { id: string; name: string }>();

  app.post('/projects', async (req, reply) => {
    const body = req.body as { name?: string };
    if (!body?.name) return reply.code(400).send({ error: 'bad_request' });
    const id = crypto.randomUUID();
    projects.set(id, { id, name: body.name });
    return reply.code(201).send({ id, name: body.name, default_personas: [], created_at: new Date().toISOString() });
  });

  app.get('/projects/:id', async (req, reply) => {
    const p = projects.get((req.params as { id: string }).id);
    if (!p) return reply.code(404).send({ error: 'not_found' });
    return reply.send({ ...p, default_personas: [], created_at: new Date().toISOString() });
  });

  const received: MockBackend['receivedRuns'] = [];

  app.post('/runs', async (req, reply) => {
    if (!req.isMultipart()) return reply.code(400).send({ error: 'bad_request' });
    let apkSize = 0;
    let trace: unknown;
    let metadata: unknown;
    for await (const part of req.parts()) {
      if (part.type === 'file' && part.fieldname === 'apk') {
        const buf = await part.toBuffer();
        apkSize = buf.length;
      } else if (part.type === 'field') {
        const v = (part as { value: unknown }).value;
        const s = typeof v === 'string' ? v : JSON.stringify(v);
        if (part.fieldname === 'trace') trace = JSON.parse(s);
        if (part.fieldname === 'metadata') metadata = JSON.parse(s);
      }
    }
    received.push({ apkSize, trace, metadata });
    const runId = crypto.randomUUID();
    return reply.code(201).send({
      run: { id: runId, project_id: (metadata as { project_id: string }).project_id, status: 'queued', mode: 'exploration', created_at: new Date().toISOString() },
      sessions: ((metadata as { personas: string[] }).personas).map((p) => ({ id: crypto.randomUUID(), persona_id: p, status: 'running' })),
    });
  });

  app.get('/runs/:id', async (_req, reply) => {
    return reply.send({
      run: { id: 'fake-run-id', status: 'queued', mode: 'exploration', created_at: new Date().toISOString() },
      sessions: [],
    });
  });

  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('mock backend listen failed');

  return {
    url: `http://127.0.0.1:${address.port}`,
    app,
    receivedRuns: received,
    close: async () => { await app.close(); },
  };
}
