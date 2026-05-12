import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { runs, sessions, type Run, type Session } from '../db/schema.js';

export interface CreateRunInput {
  projectId: string;
  apkUrl: string;
  traceUrl: string;
  intent?: string;
  personas: string[];
  mode: 'exploration' | 'verification';
}

export interface RunWithSessions {
  run: Run;
  sessions: Session[];
}

export async function createRun(db: Db, input: CreateRunInput): Promise<RunWithSessions> {
  return await db.transaction(async (tx) => {
    const runRows = await tx
      .insert(runs)
      .values({
        projectId: input.projectId,
        apkUrl: input.apkUrl,
        traceUrl: input.traceUrl,
        intent: input.intent,
        personas: input.personas,
        mode: input.mode,
        status: 'queued',
      })
      .returning();
    const run = runRows[0];
    if (!run) throw new Error('createRun: insert returned no rows');

    const sessionRows =
      input.personas.length === 0
        ? []
        : await tx
            .insert(sessions)
            .values(
              input.personas.map((personaId) => ({
                runId: run.id,
                personaId,
                status: 'running' as const,
              })),
            )
            .returning();

    return { run, sessions: sessionRows };
  });
}

export async function getRunById(db: Db, id: string): Promise<RunWithSessions | null> {
  const runRow = (await db.select().from(runs).where(eq(runs.id, id)).limit(1))[0];
  if (!runRow) return null;
  const sessionRows = await db.select().from(sessions).where(eq(sessions.runId, runRow.id));
  return { run: runRow, sessions: sessionRows };
}
