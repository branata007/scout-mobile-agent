import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('returns parsed config when all env vars are present', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/scout',
      SCOUT_API_KEY: 'secret-key',
      STORAGE_DIR: './storage',
      PORT: '3000',
    });
    expect(config.databaseUrl).toBe('postgres://user:pass@localhost:5432/scout');
    expect(config.apiKey).toBe('secret-key');
    expect(config.storageDir).toBe('./storage');
    expect(config.port).toBe(3000);
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() => loadConfig({ SCOUT_API_KEY: 'test-key-1234', STORAGE_DIR: './s', PORT: '3000' }))
      .toThrow(/DATABASE_URL/);
  });

  it('defaults PORT to 3000 when unset', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgres://u:p@l/d',
      SCOUT_API_KEY: 'test-key-1234',
      STORAGE_DIR: './s',
    });
    expect(config.port).toBe(3000);
  });

  it('throws when SCOUT_API_KEY is too short', () => {
    expect(() => loadConfig({
      DATABASE_URL: 'postgres://u:p@l/d',
      SCOUT_API_KEY: 'short',
      STORAGE_DIR: './s',
      PORT: '3000',
    })).toThrow(/at least 8 characters/);
  });
});
