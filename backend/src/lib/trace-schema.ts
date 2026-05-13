import { z } from 'zod';

export const actionTypeSchema = z.enum([
  'launch',
  'tap',
  'swipe',
  'input',
  'wait',
  'back',
  'home',
]);

export const actionSchema = z.object({
  type: actionTypeSchema,
  target: z.record(z.unknown()).optional(),
  value: z.string().optional(),
  timestamp_ms: z.number().int().nonnegative(),
});

export const stateSnapshotSchema = z.object({
  after_action_index: z.number().int().nonnegative(),
  screenshot_path: z.string().min(1),
  ui_tree: z.record(z.unknown()),
  timestamp_ms: z.number().int().nonnegative(),
});

export const logLineSchema = z.object({
  level: z.enum(['verbose', 'debug', 'info', 'warn', 'error', 'fatal']),
  tag: z.string(),
  message: z.string(),
  timestamp_ms: z.number().int().nonnegative(),
});

export const traceBundleV1Schema = z.object({
  version: z.literal(1),
  recorded_at: z.string().datetime(),
  flow_name: z.string().min(1),
  intent: z.string().optional(),
  actions: z.array(actionSchema),
  states: z.array(stateSnapshotSchema),
  logs: z.array(logLineSchema).optional(),
});

export type TraceBundleV1 = z.infer<typeof traceBundleV1Schema>;
export type ActionV1 = z.infer<typeof actionSchema>;
export type StateSnapshotV1 = z.infer<typeof stateSnapshotSchema>;
