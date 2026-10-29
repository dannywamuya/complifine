CREATE TYPE "assessment_status" AS ENUM ('draft', 'complete');
CREATE TYPE "assessment_response" AS ENUM ('compliant', 'partial', 'non_compliant', 'not_applicable', 'not_assessed');
CREATE TYPE "finding_status" AS ENUM ('open', 'in_progress', 'closed');
CREATE TYPE "finding_severity" AS ENUM ('major', 'minor', 'observation');
CREATE TYPE "corrective_action_status" AS ENUM ('open', 'done', 'verified');

CREATE TABLE "assessments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE cascade,
  "standard_version_id" uuid NOT NULL REFERENCES "standard_versions"("id") ON DELETE cascade,
  "status" "assessment_status" DEFAULT 'draft' NOT NULL,
  "assessor_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "assessments_site_idx" ON "assessments" ("site_id", "standard_version_id");

CREATE TABLE "assessment_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "assessment_id" uuid NOT NULL REFERENCES "assessments"("id") ON DELETE cascade,
  "requirement_version_id" uuid NOT NULL REFERENCES "requirement_versions"("id") ON DELETE cascade,
  "response" "assessment_response" DEFAULT 'not_assessed' NOT NULL,
  "comment" text,
  "evidence_id" uuid REFERENCES "evidence"("id") ON DELETE set null,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "assessment_items_key" ON "assessment_items" ("assessment_id", "requirement_version_id");

CREATE TABLE "findings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE cascade,
  "assessment_id" uuid REFERENCES "assessments"("id") ON DELETE set null,
  "requirement_version_id" uuid REFERENCES "requirement_versions"("id") ON DELETE set null,
  "section" text,
  "description" text NOT NULL,
  "severity" "finding_severity" DEFAULT 'minor' NOT NULL,
  "responsible_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "due_date" timestamptz,
  "status" "finding_status" DEFAULT 'open' NOT NULL,
  "checked_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "source_form_record_id" uuid REFERENCES "form_records"("id") ON DELETE set null,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "findings_site_status_idx" ON "findings" ("site_id", "status");

CREATE TABLE "corrective_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "finding_id" uuid NOT NULL REFERENCES "findings"("id") ON DELETE cascade,
  "owner_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "root_cause" text,
  "action" text NOT NULL,
  "preventive_action" text,
  "due_date" timestamptz,
  "status" "corrective_action_status" DEFAULT 'open' NOT NULL,
  "completion_evidence_id" uuid REFERENCES "evidence"("id") ON DELETE set null,
  "verified_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "verified_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "corrective_actions_finding_idx" ON "corrective_actions" ("finding_id");
