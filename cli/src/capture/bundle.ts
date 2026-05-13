import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CaptureSession } from './session.js';

export interface FinalizeBundleInput {
  session: CaptureSession;
  destDir: string;
  apk?: Buffer;
}

export interface FinalizeBundleResult {
  bundleDir: string;
  traceJsonPath: string;
  apkPath?: string;
}

export async function finalizeBundle(input: FinalizeBundleInput): Promise<FinalizeBundleResult> {
  await mkdir(join(input.destDir, 'screens'), { recursive: true });

  const trace = input.session.toBundle();
  const traceJsonPath = join(input.destDir, 'trace.json');
  await writeFile(traceJsonPath, JSON.stringify(trace, null, 2));

  for (let i = 0; i < input.session.screenshots.length; i++) {
    const png = input.session.screenshots[i]!;
    await writeFile(join(input.destDir, 'screens', `${i}.png`), png);
  }

  let apkPath: string | undefined;
  if (input.apk) {
    apkPath = join(input.destDir, 'apk.apk');
    await writeFile(apkPath, input.apk);
  }

  return { bundleDir: input.destDir, traceJsonPath, apkPath };
}
