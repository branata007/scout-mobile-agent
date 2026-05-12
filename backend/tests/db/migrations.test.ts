import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestDb, type TestDb } from '../helpers/test-db.js';
import { projects } from '../../src/db/schema.js';

describe('migrations', () => {
  let tdb: TestDb;
  beforeAll(async () => { tdb = await startTestDb(); }, 90000);
  afterAll(async () => { await tdb.stop(); });

  it('creates all tables and accepts an insert into projects', async () => {
    const inserted = await tdb.db.insert(projects).values({ name: 'demo' }).returning();
    expect(inserted[0]?.name).toBe('demo');
    expect(inserted[0]?.defaultPersonas).toEqual([]);
  });
});
