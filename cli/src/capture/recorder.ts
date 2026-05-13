import type { AdbClient } from '../adb/client.js';
import type { ActionType } from '../lib/trace-types.js';
import { CaptureSession } from './session.js';

export type RecorderEvent =
  | { type: 'capture'; actionType: ActionType; value?: string }
  | { type: 'quit' };

export interface RecorderEventSource {
  next(): Promise<RecorderEvent>;
}

export interface RecorderOpts {
  adb: AdbClient;
  serial: string;
  packageName: string;
  flowName: string;
  events: RecorderEventSource;
  intent?: string;
  now?: () => number;
}

export class Recorder {
  constructor(private readonly opts: RecorderOpts) {}

  async run(): Promise<CaptureSession> {
    const now = this.opts.now ?? (() => Date.now());
    const startedAtMs = now();
    const session = new CaptureSession({
      flowName: this.opts.flowName,
      startedAtMs,
      intent: this.opts.intent,
    });

    await this.opts.adb.launchApp(this.opts.serial, this.opts.packageName);
    session.recordAction({ type: 'launch', tsMs: now() });
    await this.captureState(session, now);

    while (true) {
      const ev = await this.opts.events.next();
      if (ev.type === 'quit') break;
      if (ev.actionType === 'back') {
        await this.opts.adb.pressKey(this.opts.serial, 'back');
      } else if (ev.actionType === 'home') {
        await this.opts.adb.pressKey(this.opts.serial, 'home');
      } else if (ev.actionType === 'input' && ev.value !== undefined) {
        await this.opts.adb.inputText(this.opts.serial, ev.value);
      }
      session.recordAction({
        type: ev.actionType,
        tsMs: now(),
        value: ev.value,
      });
      await this.captureState(session, now);
    }

    return session;
  }

  private async captureState(session: CaptureSession, now: () => number): Promise<void> {
    const [tree, screenshot, logs] = await Promise.all([
      this.opts.adb.uiautomatorDump(this.opts.serial),
      this.opts.adb.screencap(this.opts.serial),
      this.opts.adb.logcatSnapshot(this.opts.serial, session.startedAtMs),
    ]);
    session.recordState({
      uiTree: tree as unknown as Record<string, unknown>,
      screenshot,
      tsMs: now(),
    });
    if (logs.length > 0) session.appendLogs(logs);
  }
}
