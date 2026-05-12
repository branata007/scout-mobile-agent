import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { projects, type Project } from '../db/schema.js';

export interface CreateProjectInput {
  name: string;
  defaultPersonas?: string[];
}

export async function createProject(db: Db, input: CreateProjectInput): Promise<Project> {
  const rows = await db
    .insert(projects)
    .values({
      name: input.name,
      defaultPersonas: input.defaultPersonas ?? [],
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('createProject returned no rows');
  return row;
}

export async function getProjectById(db: Db, id: string): Promise<Project | null> {
  const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return rows[0] ?? null;
}
