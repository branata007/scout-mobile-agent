import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import toml from '@iarna/toml';
import { CliError } from '../lib/errors.js';
import type { ScoutConfig } from './types.js';

export interface LoadConfigInput {
  cwd: string;
  env: Record<string, string | undefined>;
}

interface RawScoutToml {
  project?: {
    id?: string;
    name?: string;
    app_package?: string;
  };
  backend?: {
    url?: string;
  };
}

export async function loadConfig(input: LoadConfigInput): Promise<ScoutConfig> {
  const tomlPath = resolve(input.cwd, 'scout.toml');
  let raw: string;
  try {
    raw = await readFile(tomlPath, 'utf-8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new CliError(1, 'config_missing', `scout.toml not found at ${tomlPath}. Run "scout init" first.`);
    }
    throw e;
  }

  const parsed = toml.parse(raw) as RawScoutToml;
  const apiKey = input.env.SCOUT_API_KEY;
  if (!apiKey) {
    throw new CliError(1, 'no_api_key', 'SCOUT_API_KEY environment variable is required.');
  }

  return {
    project: {
      id: parsed.project?.id ?? '',
      name: parsed.project?.name ?? '',
      appPackage: parsed.project?.app_package ?? '',
    },
    backend: {
      url: parsed.backend?.url ?? 'http://localhost:3000',
      apiKey,
    },
    cwd: input.cwd,
  };
}
