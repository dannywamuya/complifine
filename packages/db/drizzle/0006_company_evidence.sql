-- Company evidence and form records (PRD Sprint 7).
-- `documents` are company files, never knowledge `standard_documents`.
-- `evidence` is what the gap list and readiness read; a submitted form record
-- creates one row through `form_record_id`. Drafts never do.

DO $$ BEGIN
  CREATE TYPE "evidence_verification" AS ENUM('unverified', 'verified', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "evidence_source" AS ENUM('upload', 'note', 'imported', 'form');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "company_document_purpose" AS ENUM('evidence', 'capture_source');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "form_category" AS ENUM('policy', 'plan', 'register', 'checklist', 'finding');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "form_cadence" AS ENUM('once', 'per_event', 'daily', 'weekly', 'monthly', 'quarterly', 'annual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "form_record_status" AS ENUM('draft', 'submitted', 'verified', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "form_record_origin" AS ENUM('manual', 'capture');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
	"site_id" uuid REFERENCES "sites"("id") ON DELETE SET NULL,
	"uploaded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"purpose" "company_document_purpose" DEFAULT 'evidence' NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"file_hash" text NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "documents_org_idx" ON "documents" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "documents_site_idx" ON "documents" USING btree ("site_id");
CREATE INDEX IF NOT EXISTS "documents_hash_idx" ON "documents" USING btree ("organization_id","file_hash");

CREATE TABLE IF NOT EXISTS "form_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" "form_category" NOT NULL,
	"site_types" text[] DEFAULT '{}' NOT NULL,
	"cadence" "form_cadence" NOT NULL,
	"evidence_type_id" uuid REFERENCES "evidence_types"("id") ON DELETE RESTRICT,
	"definition" jsonb,
	"overrides" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"source_ref" text,
	"organization_id" uuid REFERENCES "organizations"("id") ON DELETE CASCADE,
	"parent_template_id" uuid,
	"doc_ref" text,
	"approver_role" text,
	"effective_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "form_templates_library_slug_key" ON "form_templates" USING btree ("slug") WHERE organization_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "form_templates_variant_key" ON "form_templates" USING btree ("organization_id","parent_template_id") WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS "form_templates_org_idx" ON "form_templates" USING btree ("organization_id");

CREATE TABLE IF NOT EXISTS "form_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
	"site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
	"template_id" uuid NOT NULL REFERENCES "form_templates"("id") ON DELETE RESTRICT,
	"template_version" integer DEFAULT 1 NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"status" "form_record_status" DEFAULT 'draft' NOT NULL,
	"origin" "form_record_origin" DEFAULT 'manual' NOT NULL,
	"header" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"header_extraction" jsonb,
	"created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"submitted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"submitted_at" timestamp with time zone,
	"verified_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"verified_at" timestamp with time zone,
	"rejection_reason" text,
	"source_document_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,
	"capture_run_id" uuid REFERENCES "agent_runs"("id") ON DELETE SET NULL,
	"evidence_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "form_records_site_template_idx" ON "form_records" USING btree ("site_id","template_id");
CREATE INDEX IF NOT EXISTS "form_records_org_status_idx" ON "form_records" USING btree ("organization_id","status");

CREATE TABLE IF NOT EXISTS "form_record_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL REFERENCES "form_records"("id") ON DELETE CASCADE,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"extraction" jsonb,
	"entered_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "form_record_entries_record_idx" ON "form_record_entries" USING btree ("record_id","recorded_at");

CREATE TABLE IF NOT EXISTS "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
	"site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
	"evidence_type_id" uuid NOT NULL REFERENCES "evidence_types"("id") ON DELETE RESTRICT,
	"document_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,
	"form_record_id" uuid REFERENCES "form_records"("id") ON DELETE CASCADE,
	"owner_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"valid_from" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"verification_status" "evidence_verification" DEFAULT 'unverified' NOT NULL,
	"source" "evidence_source" DEFAULT 'upload' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "evidence_org_idx" ON "evidence" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "evidence_site_type_idx" ON "evidence" USING btree ("site_id","evidence_type_id");
CREATE UNIQUE INDEX IF NOT EXISTS "evidence_form_record_key" ON "evidence" USING btree ("form_record_id");

CREATE TABLE IF NOT EXISTS "evidence_controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL REFERENCES "evidence"("id") ON DELETE CASCADE,
	"control_id" uuid NOT NULL REFERENCES "controls"("id") ON DELETE CASCADE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "evidence_controls_key" ON "evidence_controls" USING btree ("evidence_id","control_id");

CREATE TABLE IF NOT EXISTS "evidence_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL REFERENCES "evidence"("id") ON DELETE CASCADE,
	"requirement_version_id" uuid NOT NULL REFERENCES "requirement_versions"("id") ON DELETE CASCADE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "evidence_requirements_key" ON "evidence_requirements" USING btree ("evidence_id","requirement_version_id");
CREATE INDEX IF NOT EXISTS "evidence_requirements_requirement_idx" ON "evidence_requirements" USING btree ("requirement_version_id");
