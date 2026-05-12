import { pgEnum, pgTable, uuid, text, timestamp, integer, jsonb, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const runModeEnum = pgEnum('run_mode', ['exploration', 'verification']);
export const runStatusEnum = pgEnum('run_status', [
  'queued',
  'running',
  'completed',
  'failed',
  'budget_exhausted',
]);
export const sessionStatusEnum = pgEnum('session_status', ['running', 'completed', 'failed', 'stuck']);
export const findingTypeEnum = pgEnum('finding_type', ['perf', 'a11y', 'ux', 'polish', 'bug']);
export const findingSeverityEnum = pgEnum('finding_severity', ['low', 'med', 'high', 'critical']);
export const findingStatusEnum = pgEnum('finding_status', ['open', 'fixed', 'wontfix', 'duplicate']);
export const findingScopeEnum = pgEnum('finding_scope', ['state', 'session', 'edge']);
export const scorecardScopeEnum = pgEnum('scorecard_scope', ['state', 'session']);
export const pairResolutionEnum = pgEnum('pair_resolution', ['merged', 'split-confirmed']);

export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  defaultPersonas: text('default_personas').array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const runs = pgTable('runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  apkUrl: text('apk_url').notNull(),
  traceUrl: text('trace_url').notNull(),
  intent: text('intent'),
  personas: text('personas').array().notNull().default(sql`'{}'::text[]`),
  mode: runModeEnum('mode').notNull().default('exploration'),
  status: runStatusEnum('status').notNull().default('queued'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: uuid('run_id')
    .notNull()
    .references(() => runs.id, { onDelete: 'cascade' }),
  personaId: text('persona_id').notNull(),
  startedStateId: uuid('started_state_id'), // FK added once states table exists
  endedStateId: uuid('ended_state_id'),
  budgetUsed: integer('budget_used').notNull().default(0),
  status: sessionStatusEnum('status').notNull().default('running'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export const states = pgTable('states', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  perceptualHash: text('perceptual_hash').notNull(),
  uiTreeFingerprint: text('ui_tree_fingerprint').notNull(),
  inferredTitle: text('inferred_title'),
  sampleScreenshotUrl: text('sample_screenshot_url').notNull(),
  sampleUiTree: jsonb('sample_ui_tree').notNull(),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  visitCount: integer('visit_count').notNull().default(0),
});

export const edges = pgTable('edges', {
  id: uuid('id').defaultRandom().primaryKey(),
  fromStateId: uuid('from_state_id')
    .notNull()
    .references(() => states.id, { onDelete: 'cascade' }),
  toStateId: uuid('to_state_id')
    .notNull()
    .references(() => states.id, { onDelete: 'cascade' }),
  action: jsonb('action').notNull(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  durationMs: integer('duration_ms').notNull().default(0),
  networkCalls: jsonb('network_calls').notNull().default(sql`'[]'::jsonb`),
  beforeScreenshotUrl: text('before_screenshot_url'),
  afterScreenshotUrl: text('after_screenshot_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type StateRow = typeof states.$inferSelect;
export type NewStateRow = typeof states.$inferInsert;
export type Edge = typeof edges.$inferSelect;
export type NewEdge = typeof edges.$inferInsert;
