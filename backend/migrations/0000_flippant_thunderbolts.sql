CREATE TYPE "public"."finding_scope" AS ENUM('state', 'session', 'edge');--> statement-breakpoint
CREATE TYPE "public"."finding_severity" AS ENUM('low', 'med', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."finding_status" AS ENUM('open', 'fixed', 'wontfix', 'duplicate');--> statement-breakpoint
CREATE TYPE "public"."finding_type" AS ENUM('perf', 'a11y', 'ux', 'polish', 'bug');--> statement-breakpoint
CREATE TYPE "public"."pair_resolution" AS ENUM('merged', 'split-confirmed');--> statement-breakpoint
CREATE TYPE "public"."run_mode" AS ENUM('exploration', 'verification');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'completed', 'failed', 'budget_exhausted');--> statement-breakpoint
CREATE TYPE "public"."scorecard_scope" AS ENUM('state', 'session');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('running', 'completed', 'failed', 'stuck');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candidate_similar_pairs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_a_id" uuid NOT NULL,
	"state_b_id" uuid NOT NULL,
	"phash_match" boolean NOT NULL,
	"tree_match" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution" "pair_resolution"
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_state_id" uuid NOT NULL,
	"to_state_id" uuid NOT NULL,
	"action" jsonb NOT NULL,
	"session_id" uuid NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"network_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"before_screenshot_url" text,
	"after_screenshot_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"scope" "finding_scope" NOT NULL,
	"subject_id" uuid NOT NULL,
	"type" "finding_type" NOT NULL,
	"severity" "finding_severity" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"suggested_fix" text,
	"persona_id" text,
	"session_id" uuid,
	"status" "finding_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "persona_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"persona_id" text NOT NULL,
	"summary" text NOT NULL,
	"pain_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"highlights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"default_personas" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"apk_url" text NOT NULL,
	"trace_url" text NOT NULL,
	"intent" text,
	"personas" text[] DEFAULT '{}'::text[] NOT NULL,
	"mode" "run_mode" DEFAULT 'exploration' NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scorecards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "scorecard_scope" NOT NULL,
	"subject_id" uuid NOT NULL,
	"perf" integer NOT NULL,
	"a11y" integer NOT NULL,
	"ux" integer NOT NULL,
	"polish" integer NOT NULL,
	"summary" text,
	"session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"persona_id" text NOT NULL,
	"started_state_id" uuid,
	"ended_state_id" uuid,
	"budget_used" integer DEFAULT 0 NOT NULL,
	"status" "session_status" DEFAULT 'running' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"perceptual_hash" text NOT NULL,
	"ui_tree_fingerprint" text NOT NULL,
	"inferred_title" text,
	"sample_screenshot_url" text NOT NULL,
	"sample_ui_tree" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"visit_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candidate_similar_pairs" ADD CONSTRAINT "candidate_similar_pairs_state_a_id_states_id_fk" FOREIGN KEY ("state_a_id") REFERENCES "public"."states"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candidate_similar_pairs" ADD CONSTRAINT "candidate_similar_pairs_state_b_id_states_id_fk" FOREIGN KEY ("state_b_id") REFERENCES "public"."states"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "edges" ADD CONSTRAINT "edges_from_state_id_states_id_fk" FOREIGN KEY ("from_state_id") REFERENCES "public"."states"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "edges" ADD CONSTRAINT "edges_to_state_id_states_id_fk" FOREIGN KEY ("to_state_id") REFERENCES "public"."states"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "edges" ADD CONSTRAINT "edges_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "findings" ADD CONSTRAINT "findings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "findings" ADD CONSTRAINT "findings_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "persona_reports" ADD CONSTRAINT "persona_reports_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "runs" ADD CONSTRAINT "runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "states" ADD CONSTRAINT "states_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
