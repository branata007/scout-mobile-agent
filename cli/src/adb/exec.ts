import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AdbClient, AdbDevice } from './client.js';
import type { UiTree } from './parse-uitree.js';
import type { LogLineV1 } from '../lib/trace-types.js';
import { parseUiTreeXml } from './parse-uitree.js';
import { parseLogcat } from './parse-logcat.js';
import { CliError } from '../lib/errors.js';

const execFileP = promisify(execFile);

async function run(args: string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileP('adb', args, {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
    });
    return { stdout: stdout.toString(), stderr: stderr.toString() };
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw new CliError(1, 'adb_not_found', 'adb binary not found. Install Android SDK platform-tools.');
    }
    throw err;
  }
}

async function runBuffer(args: string[]): Promise<Buffer> {
  return await new Promise<Buffer>((resolveFn, rejectFn) => {
    execFile('adb', args, { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        const e = err as NodeJS.ErrnoException;
        if (e.code === 'ENOENT') {
          rejectFn(new CliError(1, 'adb_not_found', 'adb binary not found.'));
          return;
        }
        rejectFn(err);
        return;
      }
      resolveFn(stdout as Buffer);
    });
  });
}

export class AdbClientImpl implements AdbClient {
  async devices(): Promise<AdbDevice[]> {
    const { stdout } = await run(['devices']);
    const out: AdbDevice[] = [];
    for (const line of stdout.split('\n').slice(1)) {
      const m = /^(\S+)\s+(\S+)$/.exec(line.trim());
      if (!m) continue;
      const serial = m[1]!;
      const state = (m[2] as AdbDevice['state']) ?? 'offline';
      out.push({ serial, type: serial.startsWith('emulator-') ? 'emulator' : 'device', state });
    }
    return out;
  }

  async launchApp(serial: string, packageName: string): Promise<void> {
    await run(['-s', serial, 'shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1']);
  }

  async screencap(serial: string): Promise<Buffer> {
    return await runBuffer(['-s', serial, 'exec-out', 'screencap', '-p']);
  }

  async uiautomatorDump(serial: string): Promise<UiTree> {
    await run(['-s', serial, 'shell', 'uiautomator', 'dump', '/sdcard/window_dump.xml']);
    const { stdout } = await run(['-s', serial, 'shell', 'cat', '/sdcard/window_dump.xml']);
    return parseUiTreeXml(stdout);
  }

  async currentActivity(serial: string): Promise<string> {
    const { stdout } = await run(['-s', serial, 'shell', "dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'"]);
    const m = /\s([\w.]+\/[\w.]+)\b/.exec(stdout);
    return m?.[1] ?? '';
  }

  async logcatSnapshot(serial: string, sinceMs: number): Promise<LogLineV1[]> {
    const { stdout } = await run(['-s', serial, 'logcat', '-d', '-t', '200']);
    return parseLogcat(stdout, new Date(sinceMs));
  }

  async pullApk(serial: string, packageName: string, destPath: string): Promise<void> {
    const { stdout: pathOut } = await run(['-s', serial, 'shell', 'pm', 'path', packageName]);
    const apkPath = pathOut.trim().replace(/^package:/, '').split('\n')[0]?.trim();
    if (!apkPath) {
      throw new CliError(1, 'apk_not_found', `Could not find APK path for ${packageName} on ${serial}.`);
    }
    await mkdir(dirname(destPath), { recursive: true });
    await run(['-s', serial, 'pull', apkPath, destPath]);
  }

  async pressKey(serial: string, key: 'back' | 'home'): Promise<void> {
    const code = key === 'back' ? '4' : '3';
    await run(['-s', serial, 'shell', 'input', 'keyevent', code]);
  }

  async inputText(serial: string, text: string): Promise<void> {
    const escaped = text.replace(/ /g, '%s');
    await run(['-s', serial, 'shell', 'input', 'text', escaped]);
  }
}

export async function writeScreenshot(destPath: string, png: Buffer): Promise<void> {
  await mkdir(dirname(destPath), { recursive: true });
  await writeFile(destPath, png);
}
