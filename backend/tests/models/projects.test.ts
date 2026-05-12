import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestDb, type TestDb } from '../helpers/test-db.js';
import { createProject, getProjectById } from '../../src/models/projects.js';

describe('projects model', () => {
  let tdb: TestDb;
  beforeAll(async () => { tdb = await startTestDb(); }, 90000);
  afterAll(async () => { await tdb.stop(); });

  it('createProject persists and returns the row', async () => {
    const p = await createProject(tdb.db, { name: 'my-app', defaultPersonas: ['happy-rusher'] });
    expect(p.name).toBe('my-app');
    expect(p.defaultPersonas).toEqual(['happy-rusher']);
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('getProjectById returns null for a missing id', async () => {
    const p = await getProjectById(tdb.db, '00000000-0000-0000-0000-000000000000');
    expect(p).toBeNull();
  });

  it('getProjectById returns the row for an existing id', async () => {
    const created = await createProject(tdb.db, { name: 'another' });
    const fetched = await getProjectById(tdb.db, created.id);
    expect(fetched?.name).toBe('another');
  });
});
