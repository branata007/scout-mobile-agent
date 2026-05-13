import { CliError } from '../lib/errors.js';
import type { TraceBundleV1 } from '../lib/trace-types.js';

export interface BackendClientOpts {
  url: string;
  apiKey: string;
}

export interface CreateProjectInput {
  name: string;
  defaultPersonas?: string[];
}

export interface ProjectResponse {
  id: string;
  name: string;
  default_personas: string[];
  created_at: string;
}

export interface RunMetadata {
  project_id: string;
  mode: 'exploration' | 'verification';
  personas: string[];
  intent?: string;
}

export interface PostRunInput {
  apk: Buffer;
  trace: TraceBundleV1;
  metadata: RunMetadata;
}

export interface RunResponse {
  run: {
    id: string;
    project_id?: string;
    status: string;
    mode: string;
    created_at: string;
  };
  sessions: Array<{ id: string; persona_id: string; status: string }>;
}

export class BackendClient {
  constructor(private readonly opts: BackendClientOpts) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { 'x-scout-api-key': this.opts.apiKey, ...extra };
  }

  async createProject(input: CreateProjectInput): Promise<ProjectResponse> {
    const res = await fetch(`${this.opts.url}/projects`, {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ name: input.name, default_personas: input.defaultPersonas }),
    });
    if (res.status === 401) {
      throw new CliError(1, 'unauthorized', 'Backend rejected the API key (401 unauthorized).');
    }
    if (!res.ok) {
      throw new CliError(1, 'backend_error', `Backend returned ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as ProjectResponse;
  }

  async postRun(input: PostRunInput): Promise<RunResponse> {
    const form = new FormData();
    const apkBlob = new Blob([new Uint8Array(input.apk)], {
      type: 'application/vnd.android.package-archive',
    });
    form.append('apk', apkBlob, 'app.apk');
    form.append('trace', JSON.stringify(input.trace));
    form.append('metadata', JSON.stringify(input.metadata));

    const res = await fetch(`${this.opts.url}/runs`, {
      method: 'POST',
      headers: this.headers(),
      body: form,
    });
    if (res.status === 401) {
      throw new CliError(1, 'unauthorized', 'Backend rejected the API key (401 unauthorized).');
    }
    if (res.status === 404) {
      const body = (await res.json()) as { error: string };
      throw new CliError(1, body.error, `Backend 404: ${body.error}`);
    }
    if (!res.ok) {
      throw new CliError(1, 'backend_error', `Backend returned ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as RunResponse;
  }

  async getRun(id: string): Promise<RunResponse> {
    const res = await fetch(`${this.opts.url}/runs/${encodeURIComponent(id)}`, {
      headers: this.headers(),
    });
    if (res.status === 401) {
      throw new CliError(1, 'unauthorized', 'Backend rejected the API key (401 unauthorized).');
    }
    if (res.status === 404) {
      throw new CliError(1, 'not_found', `Run ${id} not found.`);
    }
    if (!res.ok) {
      throw new CliError(1, 'backend_error', `Backend returned ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as RunResponse;
  }
}
