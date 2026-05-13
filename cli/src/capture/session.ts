import type { ActionType, ActionV1, LogLineV1, StateSnapshotV1, TraceBundleV1 } from '../lib/trace-types.js';

export interface CaptureSessionOpts {
  flowName: string;
  startedAtMs: number;
  intent?: string;
}

export interface RecordActionInput {
  type: ActionType;
  tsMs: number;
  target?: Record<string, unknown>;
  value?: string;
}

export interface RecordStateInput {
  uiTree: Record<string, unknown>;
  screenshot: Buffer;
  tsMs: number;
}

export class CaptureSession {
  private readonly _actions: ActionV1[] = [];
  private readonly _states: StateSnapshotV1[] = [];
  private readonly _screenshots: Buffer[] = [];
  private readonly _logs: LogLineV1[] = [];

  constructor(private readonly opts: CaptureSessionOpts) {}

  get flowName(): string { return this.opts.flowName; }
  get startedAtMs(): number { return this.opts.startedAtMs; }
  get screenshots(): readonly Buffer[] { return this._screenshots; }
  get actionCount(): number { return this._actions.length; }

  recordAction(input: RecordActionInput): void {
    this._actions.push({
      type: input.type,
      target: input.target,
      value: input.value,
      timestamp_ms: input.tsMs - this.opts.startedAtMs,
    });
  }

  recordState(input: RecordStateInput): void {
    const idx = this._screenshots.length;
    this._screenshots.push(input.screenshot);
    this._states.push({
      after_action_index: this._actions.length - 1,
      screenshot_path: `screens/${idx}.png`,
      ui_tree: input.uiTree,
      timestamp_ms: input.tsMs - this.opts.startedAtMs,
    });
  }

  appendLogs(logs: LogLineV1[]): void {
    for (const l of logs) this._logs.push(l);
  }

  toBundle(): TraceBundleV1 {
    return {
      version: 1,
      recorded_at: new Date(this.opts.startedAtMs).toISOString(),
      flow_name: this.opts.flowName,
      intent: this.opts.intent,
      actions: this._actions,
      states: this._states,
      logs: this._logs.length > 0 ? this._logs : undefined,
    };
  }
}
