import { loadConfig } from './config.js';
import { createDbHandle } from './db/client.js';
import { LocalStorageAdapter } from './storage/local.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const { db, close } = createDbHandle(config.databaseUrl);
  const storage = new LocalStorageAdapter(config.storageDir);
  const app = await buildServer({ apiKey: config.apiKey, db, storage });

  await app.listen({ host: '0.0.0.0', port: config.port });
  console.log(`scout backend listening on :${config.port}`);

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`received ${signal}, shutting down`);
    await app.close();
    await close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('fatal error', err);
  process.exit(1);
});
