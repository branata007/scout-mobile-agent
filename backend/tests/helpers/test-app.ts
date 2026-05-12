import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../../src/server.js';
import { LocalStorageAdapter } from '../../src/storage/local.js';
import { startTestDb, type TestDb } from './test-db.js';
import type { FastifyInstance } from 'fastify';

export interface TestApp {
  app: FastifyInstance;
  tdb: TestDb;
  storageDir: string;
  apiKey: string;
  close: () => Promise<void>;
}

export async function startTestApp(): Promise<TestApp> {
  const tdb = await startTestDb();
  const storageDir = await mkdtemp(join(tmpdir(), 'scout-storage-'));
  const storage = new LocalStorageAdapter(storageDir);
  const apiKey = 'test-api-key';
  const app = await buildServer({ apiKey, db: tdb.db, storage });

  return {
    app,
    tdb,
    storageDir,
    apiKey,
    close: async () => {
      await app.close();
      await tdb.stop();
      await rm(storageDir, { recursive: true, force: true });
    },
  };
}
