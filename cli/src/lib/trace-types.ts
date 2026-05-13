// Types mirror backend/src/lib/trace-schema.ts. The CLI builds against types;
// the backend validates with Zod on receipt.

export type ActionType = 'launch' | 'tap' | 'swipe' | 'input' | 'wait' | 'back' | 'home';

export interface ActionV1 {
  type: ActionType;
  target?: Record<string, unknown>;
  value?: string;
  timestamp_ms: number;
}

export interface StateSnapshotV1 {
  after_action_index: number;
  screenshot_path: string;
  ui_tree: Record<string, unknown>;
  timestamp_ms: number;
}

export type LogLevel = 'verbose' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogLineV1 {
  level: LogLevel;
  tag: string;
  message: string;
  timestamp_ms: number;
}

export interface TraceBundleV1 {
  version: 1;
  recorded_at: string; // ISO datetime
  flow_name: string;
  intent?: string;
  actions: ActionV1[];
  states: StateSnapshotV1[];
  logs?: LogLineV1[];
}
