import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createProject, getProjectById } from '../models/projects.js';

const createProjectBody = z.object({
  name: z.string().min(1),
  default_personas: z.array(z.string()).optional(),
});

const idParam = z.object({ id: z.string().uuid() });

export async function projectsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/projects', async (req, reply) => {
    const parsed = createProjectBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'bad_request', issues: parsed.error.issues });
    }
    const project = await createProject(app.db, {
      name: parsed.data.name,
      defaultPersonas: parsed.data.default_personas,
    });
    return reply.code(201).send({
      id: project.id,
      name: project.name,
      default_personas: project.defaultPersonas,
      created_at: project.createdAt.toISOString(),
    });
  });

  app.get('/projects/:id', async (req, reply) => {
    const parsed = idParam.safeParse(req.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'bad_request' });
    }
    const project = await getProjectById(app.db, parsed.data.id);
    if (!project) return reply.code(404).send({ error: 'not_found' });
    return reply.code(200).send({
      id: project.id,
      name: project.name,
      default_personas: project.defaultPersonas,
      created_at: project.createdAt.toISOString(),
    });
  });
}
