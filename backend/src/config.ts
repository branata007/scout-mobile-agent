import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  SCOUT_API_KEY: z.string().min(8, 'SCOUT_API_KEY must be at least 8 characters'),
  STORAGE_DIR: z.string().default('./storage'),
  PORT: z
    .string()
    .default('3000')
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().positive()),
});

export interface Config {
  databaseUrl: string;
  apiKey: string;
  storageDir: string;
  port: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.parse(env);
  return {
    databaseUrl: parsed.DATABASE_URL,
    apiKey: parsed.SCOUT_API_KEY,
    storageDir: parsed.STORAGE_DIR,
    port: parsed.PORT,
  };
}
