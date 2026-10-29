ALTER TYPE "notification_event_type" ADD VALUE 'audit_complete';

ALTER TABLE "documents" ADD COLUMN "extracted_text" text;
ALTER TABLE "documents" ADD COLUMN "extracted_at" timestamptz;

CREATE TYPE "audit_run_status" AS ENUM ('queued', 'running', 'complete', 'failed');
CREATE TYPE "audit_verdict" AS ENUM ('likely_compliant', 'at_risk', 'likely_non_compliant', 'not_applicable', 'insufficient_evidence');

CREATE TABLE "audit_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE cascade,
  "standard_version_id" uuid NOT NULL REFERENCES "standard_versions"("id") ON DELETE cascade,
  "requested_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "status" "audit_run_status" DEFAULT 'queued' NOT NULL,
  "progress" jsonb DEFAULT '{"done":0,"total":0}'::jsonb NOT NULL,
  "model" text,
  "summary" text,
  "recommendations" jsonb,
  "counts" jsonb,
  "readiness_snapshot" jsonb,
  "prompt_tokens" integer,
  "completion_tokens" integer,
  "duration_ms" integer,
  "error" text,
  "started_at" timestamptz,
  "finished_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "audit_runs_site_version_idx" ON "audit_runs" ("site_id", "standard_version_id", "created_at");

CREATE TABLE "audit_run_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "audit_run_id" uuid NOT NULL REFERENCES "audit_runs"("id") ON DELETE cascade,
  "requirement_version_id" uuid NOT NULL REFERENCES "requirement_versions"("id") ON DELETE cascade,
  "verdict" "audit_verdict" NOT NULL,
  "rationale" text DEFAULT '' NOT NULL,
  "recommendation" text DEFAULT '' NOT NULL,
  "suggested_severity" "finding_severity",
  "cited_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "ungrounded" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "confidence" double precision,
  "accepted_at" timestamptz,
  "accepted_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "finding_id" uuid REFERENCES "findings"("id") ON DELETE set null,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "audit_run_items_key" ON "audit_run_items" ("audit_run_id", "requirement_version_id");
CREATE INDEX "audit_run_items_run_idx" ON "audit_run_items" ("audit_run_id");
