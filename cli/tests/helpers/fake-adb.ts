import type { AdbClient, AdbDevice } from '../../src/adb/client.js';
import type { UiTree } from '../../src/adb/parse-uitree.js';
import type { LogLineV1 } from '../../src/lib/trace-types.js';

export interface FakeAdbScript {
  devices?: AdbDevice[];
  screencap?: Buffer;
  uiTree?: UiTree;
  activity?: string;
  logs?: LogLineV1[];
}

export class FakeAdbClient implements AdbClient {
  public calls: Array<{ method: string; args: unknown[] }> = [];
  constructor(private script: FakeAdbScript = {}) {}

  async devices(): Promise<AdbDevice[]> {
    this.calls.push({ method: 'devices', args: [] });
    return this.script.devices ?? [{ serial: 'emulator-5554', type: 'emulator', state: 'device' }];
  }

  async launchApp(serial: string, packageName: string): Promise<void> {
    this.calls.push({ method: 'launchApp', args: [serial, packageName] });
  }

  async screencap(serial: string): Promise<Buffer> {
    this.calls.push({ method: 'screencap', args: [serial] });
    return this.script.screencap ?? Buffer.from('PNGfake');
  }

  async uiautomatorDump(serial: string): Promise<UiTree> {
    this.calls.push({ method: 'uiautomatorDump', args: [serial] });
    return (
      this.script.uiTree ?? {
        rotation: 0,
        root: {
          index: 0,
          class: 'android.widget.FrameLayout',
          text: '',
          resourceId: '',
          package: 'com.example',
          contentDesc: '',
          clickable: false,
          enabled: true,
          focused: false,
          selected: false,
          bounds: { left: 0, top: 0, right: 1080, bottom: 1920 },
          children: [],
        },
      }
    );
  }

  async currentActivity(serial: string): Promise<string> {
    this.calls.push({ method: 'currentActivity', args: [serial] });
    return this.script.activity ?? 'com.example/.MainActivity';
  }

  async logcatSnapshot(serial: string, sinceMs: number): Promise<LogLineV1[]> {
    this.calls.push({ method: 'logcatSnapshot', args: [serial, sinceMs] });
    return this.script.logs ?? [];
  }

  async pullApk(serial: string, packageName: string, destPath: string): Promise<void> {
    this.calls.push({ method: 'pullApk', args: [serial, packageName, destPath] });
  }

  async pressKey(serial: string, key: 'back' | 'home'): Promise<void> {
    this.calls.push({ method: 'pressKey', args: [serial, key] });
  }

  async inputText(serial: string, text: string): Promise<void> {
    this.calls.push({ method: 'inputText', args: [serial, text] });
  }
}
