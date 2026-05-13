import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeTmpDir, removeTmpDir } from '../helpers/tmp-dir.js';
import { loadConfig } from '../../src/config/load.js';

describe('loadConfig', () => {
  let dir: string;

  beforeEach(async () => { dir = await makeTmpDir(); });
  afterEach(async () => { await removeTmpDir(dir); });

  it('reads scout.toml and overlays env', async () => {
    await writeFile(
      join(dir, 'scout.toml'),
      `[project]
id = "550e8400-e29b-41d4-a716-446655440000"
name = "my-app"
app_package = "com.example.app"

[backend]
url = "http://localhost:3000"
`,
    );
    const config = await loadConfig({ cwd: dir, env: { SCOUT_API_KEY: 'k-12345678' } });
    expect(config.project.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(config.project.name).toBe('my-app');
    expect(config.project.appPackage).toBe('com.example.app');
    expect(config.backend.url).toBe('http://localhost:3000');
    expect(config.backend.apiKey).toBe('k-12345678');
  });

  it('throws CliError if scout.toml is missing', async () => {
    await expect(loadConfig({ cwd: dir, env: {} })).rejects.toThrow(/scout\.toml not found/);
  });

  it('throws CliError if SCOUT_API_KEY is missing', async () => {
    await writeFile(
      join(dir, 'scout.toml'),
      `[project]
id = ""
name = "x"
app_package = "com.x"

[backend]
url = "http://localhost:3000"
`,
    );
    await expect(loadConfig({ cwd: dir, env: {} })).rejects.toThrow(/SCOUT_API_KEY/);
  });
});
