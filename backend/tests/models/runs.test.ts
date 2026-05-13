import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestDb, type TestDb } from '../helpers/test-db.js';
import { createProject } from '../../src/models/projects.js';
import { createRun, getRunById } from '../../src/models/runs.js';

describe('runs model', () => {
  let tdb: TestDb;
  beforeAll(async () => { tdb = await startTestDb(); }, 90000);
  afterAll(async () => { await tdb.stop(); });

  it('createRun persists the run and one session per persona', async () => {
    const project = await createProject(tdb.db, { name: 'r-app' });
    const run = await createRun(tdb.db, {
      projectId: project.id,
      apkUrl: 'file:///tmp/x.apk',
      traceUrl: 'file:///tmp/x.json',
      intent: 'check checkout',
      personas: ['happy-rusher', 'low-vision'],
      mode: 'exploration',
    });

    expect(run.run.projectId).toBe(project.id);
    expect(run.run.status).toBe('queued');
    expect(run.run.mode).toBe('exploration');
    expect(run.sessions).toHaveLength(2);
    const personaIds = run.sessions.map((s) => s.personaId).sort();
    expect(personaIds).toEqual(['happy-rusher', 'low-vision']);
    expect(run.sessions.every((s) => s.status === 'running')).toBe(true);
  });

  it('getRunById returns the run with its sessions', async () => {
    const project = await createProject(tdb.db, { name: 'r-app-2' });
    const created = await createRun(tdb.db, {
      projectId: project.id,
      apkUrl: 'file:///a.apk',
      traceUrl: 'file:///t.json',
      personas: ['first-timer'],
      mode: 'exploration',
    });
    const fetched = await getRunById(tdb.db, created.run.id);
    expect(fetched?.run.id).toBe(created.run.id);
    expect(fetched?.sessions).toHaveLength(1);
    expect(fetched?.sessions[0]?.personaId).toBe('first-timer');
  });

  it('getRunById returns null for missing id', async () => {
    const fetched = await getRunById(tdb.db, '00000000-0000-0000-0000-000000000000');
    expect(fetched).toBeNull();
  });
});
