import type { UiTree } from './parse-uitree.js';
import type { LogLineV1 } from '../lib/trace-types.js';

export interface AdbDevice {
  serial: string;
  type: 'device' | 'emulator';
  state: 'device' | 'offline' | 'unauthorized';
}

export interface AdbClient {
  devices(): Promise<AdbDevice[]>;
  launchApp(serial: string, packageName: string): Promise<void>;
  screencap(serial: string): Promise<Buffer>;
  uiautomatorDump(serial: string): Promise<UiTree>;
  currentActivity(serial: string): Promise<string>;
  logcatSnapshot(serial: string, sinceMs: number): Promise<LogLineV1[]>;
  pullApk(serial: string, packageName: string, destPath: string): Promise<void>;
  pressKey(serial: string, key: 'back' | 'home'): Promise<void>;
  inputText(serial: string, text: string): Promise<void>;
}
