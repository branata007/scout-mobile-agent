import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

export interface TestDb {
  container: StartedPostgreSqlContainer;
  url: string;
  sql: ReturnType<typeof postgres>;
  db: PostgresJsDatabase;
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
  const db = drizzle(sql);

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
