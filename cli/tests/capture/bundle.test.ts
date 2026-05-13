import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { makeTmpDir, removeTmpDir } from '../helpers/tmp-dir.js';
import { CaptureSession } from '../../src/capture/session.js';
import { finalizeBundle } from '../../src/capture/bundle.js';

describe('finalizeBundle', () => {
  let dir: string;
  beforeEach(async () => { dir = await makeTmpDir(); });
  afterEach(async () => { await removeTmpDir(dir); });

  it('writes trace.json, screens, and apk to destDir', async () => {
    const session = new CaptureSession({ flowName: 'checkout', startedAtMs: 1000 });
    session.recordAction({ type: 'launch', tsMs: 1000 });
    session.recordState({ uiTree: { x: 1 }, screenshot: Buffer.from('PNG0'), tsMs: 1100 });
    session.recordAction({ type: 'tap', tsMs: 1500 });
    session.recordState({ uiTree: { x: 2 }, screenshot: Buffer.from('PNG1'), tsMs: 1600 });

    const destDir = join(dir, 'recording');
    await finalizeBundle({ session, destDir, apk: Buffer.from('PKfake-apk') });

    const trace = JSON.parse(await readFile(join(destDir, 'trace.json'), 'utf-8'));
    expect(trace.version).toBe(1);
    expect(trace.actions).toHaveLength(2);
    expect(trace.states).toHaveLength(2);
    expect(trace.flow_name).toBe('checkout');

    const screen0 = await readFile(join(destDir, 'screens', '0.png'));
    expect(screen0.toString()).toBe('PNG0');
    const screen1 = await readFile(join(destDir, 'screens', '1.png'));
    expect(screen1.toString()).toBe('PNG1');

    const apk = await readFile(join(destDir, 'apk.apk'));
    expect(apk.toString()).toBe('PKfake-apk');

    const screens = await readdir(join(destDir, 'screens'));
    expect(screens.sort()).toEqual(['0.png', '1.png']);
  });

  it('omits apk if not provided', async () => {
    const session = new CaptureSession({ flowName: 'f', startedAtMs: 0 });
    session.recordAction({ type: 'launch', tsMs: 0 });
    session.recordState({ uiTree: {}, screenshot: Buffer.from('s'), tsMs: 1 });
    const destDir = join(dir, 'no-apk');
    await finalizeBundle({ session, destDir });
    const entries = await readdir(destDir);
    expect(entries.sort()).toEqual(['screens', 'trace.json']);
  });
});
