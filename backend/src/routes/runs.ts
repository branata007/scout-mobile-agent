import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { traceBundleV1Schema } from '../lib/trace-schema.js';
import { createRun, getRunById } from '../models/runs.js';
import { getProjectById } from '../models/projects.js';

const metadataSchema = z.object({
  project_id: z.string().uuid(),
  mode: z.enum(['exploration', 'verification']),
  personas: z.array(z.string().min(1)).min(1),
  intent: z.string().optional(),
});

const idParam = z.object({ id: z.string().uuid() });

export async function runsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/runs', async (req, reply) => {
    if (!req.isMultipart()) {
      return reply.code(400).send({ error: 'bad_request', detail: 'multipart required' });
    }

    let apkBuffer: Buffer | undefined;
    let traceRaw: string | undefined;
    let metadataRaw: string | undefined;

    for await (const part of req.parts()) {
      if (part.type === 'file' && part.fieldname === 'apk') {
        apkBuffer = await part.toBuffer();
      } else if (part.type === 'field' && part.fieldname === 'trace') {
        // @fastify/multipart may auto-parse JSON fields into objects — handle both
        const v = part.value;
        traceRaw = typeof v === 'string' ? v : JSON.stringify(v);
      } else if (part.type === 'field' && part.fieldname === 'metadata') {
        const v = part.value;
        metadataRaw = typeof v === 'string' ? v : JSON.stringify(v);
      } else if (part.type === 'file' && part.fieldname === 'trace') {
        traceRaw = (await part.toBuffer()).toString('utf-8');
      } else if (part.type === 'file' && part.fieldname === 'metadata') {
        metadataRaw = (await part.toBuffer()).toString('utf-8');
      }
    }

    if (!apkBuffer || !traceRaw || !metadataRaw) {
      return reply
        .code(400)
        .send({ error: 'bad_request', detail: 'apk, trace, and metadata parts are all required' });
    }

    let metadataJson: unknown;
    let traceJson: unknown;
    try {
      metadataJson = JSON.parse(metadataRaw);
      traceJson = JSON.parse(traceRaw);
    } catch {
      return reply.code(400).send({ error: 'bad_request', detail: 'metadata or trace not valid JSON' });
    }

    const metadata = metadataSchema.safeParse(metadataJson);
    if (!metadata.success) {
      return reply.code(400).send({ error: 'bad_request', issues: metadata.error.issues });
    }

    const trace = traceBundleV1Schema.safeParse(traceJson);
    if (!trace.success) {
      return reply.code(400).send({ error: 'invalid_trace', issues: trace.error.issues });
    }

    const project = await getProjectById(app.db, metadata.data.project_id);
    if (!project) {
      return reply.code(404).send({ error: 'project_not_found' });
    }

    const runId = randomUUID();
    const apkUrl = await app.storage.saveApk(runId, apkBuffer);
    const traceUrl = await app.storage.saveTrace(runId, trace.data);

    const result = await createRun(app.db, {
      projectId: project.id,
      apkUrl,
      traceUrl,
      intent: metadata.data.intent,
      personas: metadata.data.personas,
      mode: metadata.data.mode,
    });

    return reply.code(201).send({
      run: {
        id: result.run.id,
        project_id: result.run.projectId,
        apk_url: result.run.apkUrl,
        trace_url: result.run.traceUrl,
        intent: result.run.intent,
        personas: result.run.personas,
        mode: result.run.mode,
        status: result.run.status,
        created_at: result.run.createdAt.toISOString(),
      },
      sessions: result.sessions.map((s) => ({
        id: s.id,
        persona_id: s.personaId,
        status: s.status,
      })),
    });
  });

  app.get('/runs/:id', async (req, reply) => {
    const parsed = idParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const result = await getRunById(app.db, parsed.data.id);
    if (!result) return reply.code(404).send({ error: 'not_found' });
    return reply.send({
      run: {
        id: result.run.id,
        project_id: result.run.projectId,
        apk_url: result.run.apkUrl,
        trace_url: result.run.traceUrl,
        intent: result.run.intent,
        personas: result.run.personas,
        mode: result.run.mode,
        status: result.run.status,
        created_at: result.run.createdAt.toISOString(),
      },
      sessions: result.sessions.map((s) => ({
        id: s.id,
        persona_id: s.personaId,
        status: s.status,
      })),
    });
  });
}
