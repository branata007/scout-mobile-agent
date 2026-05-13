import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from '../../src/db/schema.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(here, '../../migrations');

export interface TestDb {
  container: StartedPostgreSqlContainer;
  url: string;
  sql: ReturnType<typeof postgres>;
  db: PostgresJsDatabase<typeof schema>;
  stop: () => Promise<void>;
}

export async function startTestDb(): Promise<TestDb> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('scout_test')
    .withUsername('scout')
    .withPassword('scout')
    .start();

  const url = container.getConnectionUri();
  const sql = postgres(url, { max: 4 });
  const db = drizzle(sql, { schema });

  await migrate(db, { migrationsFolder });

  return {
    container,
    url,
    sql,
    db,
    stop: async () => {
      await sql.end({ timeout: 5 });
      await container.stop();
    },
  };
}
