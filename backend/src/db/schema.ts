import { pgEnum } from 'drizzle-orm/pg-core';

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
