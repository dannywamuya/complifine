-- Multi-standard columns, tenancy, farm operations, control library.
-- edition and requirement level become text so SMETA (and later certs) do not
-- require a Postgres enum alteration per variant.
-- Enum values used below (`base_code`, etc.) were committed in 0003.

ALTER TABLE "standard_versions" ALTER COLUMN "edition" SET DATA TYPE text USING "edition"::text;
ALTER TABLE "standard_versions" ADD COLUMN IF NOT EXISTS "level_scheme" text NOT NULL DEFAULT 'globalgap_ifa';
ALTER TABLE "requirement_versions" ALTER COLUMN "level" SET DATA TYPE text USING "level"::text;

DO $$ BEGIN
  CREATE TYPE "source_channel" AS ENUM('http', 'mirror', 'local', 'member_gated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE "standard_documents" ADD COLUMN IF NOT EXISTS "channel" "source_channel" NOT NULL DEFAULT 'http';

DROP INDEX IF EXISTS "standard_documents_singular_key";
CREATE UNIQUE INDEX "standard_documents_singular_key" ON "standard_documents" USING btree ("standard_version_id","document_type","language") WHERE status <> 'superseded' AND document_type IN ('principles_and_criteria', 'checklist', 'base_code');

DO $$ BEGIN
  CREATE TYPE "user_kind" AS ENUM('member', 'operator');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "membership_role" AS ENUM('owner', 'compliance_manager', 'site_manager', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "site_type" AS ENUM('farm', 'packhouse', 'collection_centre', 'warehouse');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "control_type" AS ENUM('policy', 'procedure', 'training', 'inspection', 'record', 'physical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"kind" "user_kind" DEFAULT 'member' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users" USING btree ("email");
CREATE INDEX IF NOT EXISTS "users_kind_idx" ON "users" USING btree ("kind");

CREATE TABLE IF NOT EXISTS "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"country" text DEFAULT 'KE' NOT NULL,
	"sedex_zc" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "organizations_country_idx" ON "organizations" USING btree ("country");

CREATE TABLE IF NOT EXISTS "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" "membership_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "memberships_user_org_key" ON "memberships" USING btree ("user_id","organization_id");
CREATE INDEX IF NOT EXISTS "memberships_org_idx" ON "memberships" USING btree ("organization_id");

CREATE TABLE IF NOT EXISTS "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "refresh_tokens_hash_key" ON "refresh_tokens" USING btree ("token_hash");
CREATE INDEX IF NOT EXISTS "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");

CREATE TABLE IF NOT EXISTS "demo_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"company" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"interests" text DEFAULT 'both' NOT NULL,
	"message" text,
	"status" text DEFAULT 'new' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "demo_requests_status_idx" ON "demo_requests" USING btree ("status");
CREATE INDEX IF NOT EXISTS "demo_requests_created_idx" ON "demo_requests" USING btree ("created_at");

CREATE TABLE IF NOT EXISTS "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"site_type" "site_type" DEFAULT 'farm' NOT NULL,
	"location" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "sites_org_idx" ON "sites" USING btree ("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "sites_org_name_key" ON "sites" USING btree ("organization_id","name");

CREATE TABLE IF NOT EXISTS "organization_scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"standard_version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "organization_scopes_key" ON "organization_scopes" USING btree ("organization_id","standard_version_id");
CREATE INDEX IF NOT EXISTS "organization_scopes_org_idx" ON "organization_scopes" USING btree ("organization_id");

CREATE TABLE IF NOT EXISTS "site_scoping_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"answer" "scoping_answer" DEFAULT 'unanswered' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "site_scoping_answers_key" ON "site_scoping_answers" USING btree ("site_id","question_id");
CREATE INDEX IF NOT EXISTS "site_scoping_answers_site_idx" ON "site_scoping_answers" USING btree ("site_id");

CREATE TABLE IF NOT EXISTS "controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"objective" text,
	"control_type" "control_type" DEFAULT 'procedure' NOT NULL,
	"owner_role" text,
	"frequency" text,
	"implementation_guidance" text,
	"review_frequency" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "controls_slug_key" ON "controls" USING btree ("slug");

CREATE TABLE IF NOT EXISTS "evidence_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "evidence_types_slug_key" ON "evidence_types" USING btree ("slug");

CREATE TABLE IF NOT EXISTS "control_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"control_id" uuid NOT NULL,
	"requirement_version_id" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "control_requirements_key" ON "control_requirements" USING btree ("control_id","requirement_version_id");
CREATE INDEX IF NOT EXISTS "control_requirements_requirement_idx" ON "control_requirements" USING btree ("requirement_version_id");

CREATE TABLE IF NOT EXISTS "control_evidence_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"control_id" uuid NOT NULL,
	"evidence_type_id" uuid NOT NULL,
	"mandatory" boolean DEFAULT true NOT NULL,
	"validity_period" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "control_evidence_types_key" ON "control_evidence_types" USING btree ("control_id","evidence_type_id");

CREATE TABLE IF NOT EXISTS "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"organization_id" uuid,
	"site_id" uuid,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "conversations_user_idx" ON "conversations" USING btree ("user_id","created_at");
CREATE INDEX IF NOT EXISTS "conversations_org_idx" ON "conversations" USING btree ("organization_id","created_at");

INSERT INTO "conversations" ("id", "title")
SELECT DISTINCT "conversation_id", 'Migrated conversation'
FROM "agent_runs"
WHERE "conversation_id" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "organization_id" uuid;
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "site_id" uuid;

DO $$ BEGIN
  ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "sites" ADD CONSTRAINT "sites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "organization_scopes" ADD CONSTRAINT "organization_scopes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "organization_scopes" ADD CONSTRAINT "organization_scopes_standard_version_id_standard_versions_id_fk" FOREIGN KEY ("standard_version_id") REFERENCES "public"."standard_versions"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "site_scoping_answers" ADD CONSTRAINT "site_scoping_answers_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "site_scoping_answers" ADD CONSTRAINT "site_scoping_answers_question_id_applicability_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."applicability_questions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "control_requirements" ADD CONSTRAINT "control_requirements_control_id_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."controls"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "control_requirements" ADD CONSTRAINT "control_requirements_requirement_version_id_requirement_versions_id_fk" FOREIGN KEY ("requirement_version_id") REFERENCES "public"."requirement_versions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "control_evidence_types" ADD CONSTRAINT "control_evidence_types_control_id_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."controls"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "control_evidence_types" ADD CONSTRAINT "control_evidence_types_evidence_type_id_evidence_types_id_fk" FOREIGN KEY ("evidence_type_id") REFERENCES "public"."evidence_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "conversations" ADD CONSTRAINT "conversations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "agent_runs_org_idx" ON "agent_runs" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "agent_runs_user_idx" ON "agent_runs" USING btree ("user_id");
