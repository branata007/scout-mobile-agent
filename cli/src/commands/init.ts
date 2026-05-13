import { writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import toml from '@iarna/toml';
import { CliError } from '../lib/errors.js';
import { BackendClient } from '../upload/client.js';

export interface InitInput {
  cwd: string;
  env: Record<string, string | undefined>;
  projectName: string;
  appPackage: string;
  backendUrl: string;
}

export async function runInit(input: InitInput): Promise<void> {
  const tomlPath = resolve(input.cwd, 'scout.toml');
  try {
    await access(tomlPath);
    throw new CliError(1, 'config_exists', `scout.toml already exists at ${tomlPath}.`);
  } catch (e) {
    if (e instanceof CliError) throw e;
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }

  const apiKey = input.env.SCOUT_API_KEY;
  if (!apiKey) {
    throw new CliError(1, 'no_api_key', 'SCOUT_API_KEY environment variable is required.');
  }

  const client = new BackendClient({ url: input.backendUrl, apiKey });
  const project = await client.createProject({ name: input.projectName });

  const config = {
    project: {
      id: project.id,
      name: input.projectName,
      app_package: input.appPackage,
    },
    backend: {
      url: input.backendUrl,
    },
  };
  await writeFile(tomlPath, toml.stringify(config as toml.JsonMap));
}
