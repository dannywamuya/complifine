CREATE TYPE "public"."applicability_source" AS ENUM('globalgap_official', 'complifine_authored', 'ai_proposed');--> statement-breakpoint
CREATE TYPE "public"."chunk_type" AS ENUM('requirement', 'section', 'table');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('registered', 'fetched', 'parsed', 'failed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('principles_and_criteria', 'checklist', 'general_regulations', 'guidance', 'update', 'transition_tool', 'third_party_summary');--> statement-breakpoint
CREATE TYPE "public"."edition" AS ENUM('smart', 'gfs');--> statement-breakpoint
CREATE TYPE "public"."job_stage" AS ENUM('registry', 'fetch', 'parse', 'normalize', 'reconcile', 'chunk', 'embed', 'publish');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'processing', 'failed', 'awaiting_review', 'approved', 'published', 'succeeded', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."log_level" AS ENUM('debug', 'info', 'warn', 'error');--> statement-breakpoint
CREATE TYPE "public"."relationship_origin" AS ENUM('source_declared', 'deterministic_match', 'ai_proposed', 'human_asserted');--> statement-breakpoint
CREATE TYPE "public"."relationship_type" AS ENUM('unchanged', 'modified_to', 'replaced_by', 'split_into', 'merged_from', 'equivalent_to', 'related_to', 'overlaps_with');--> statement-breakpoint
CREATE TYPE "public"."requirement_level" AS ENUM('major_must', 'minor_must', 'recommendation');--> statement-breakpoint
CREATE TYPE "public"."requirement_status" AS ENUM('draft', 'extracted', 'under_review', 'approved', 'published', 'retired');--> statement-breakpoint
CREATE TYPE "public"."review_decision" AS ENUM('approved', 'rejected', 'changes_requested');--> statement-breakpoint
CREATE TYPE "public"."scoping_answer" AS ENUM('yes', 'no', 'unanswered');--> statement-breakpoint
CREATE TYPE "public"."version_status" AS ENUM('draft', 'ingesting', 'extracted', 'validation', 'review', 'approved', 'published', 'retired');--> statement-breakpoint
CREATE TABLE "standard_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"standard_version_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"document_type" "document_type" NOT NULL,
	"authority_level" smallint NOT NULL,
	"title" text NOT NULL,
	"document_code" text,
	"language" text DEFAULT 'en' NOT NULL,
	"filename" text NOT NULL,
	"source_url" text,
	"mirror_url" text,
	"file_hash" text,
	"byte_size" bigint,
	"mime_type" text,
	"storage_key" text,
	"last_modified_header" timestamp with time zone,
	"etag" text,
	"retrieved_at" timestamp with time zone,
	"published_at" date,
	"valid_from" date,
	"page_count" integer,
	"status" "document_status" DEFAULT 'registered' NOT NULL,
	"license_note" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standard_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"standard_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"edition" "edition" NOT NULL,
	"version" text NOT NULL,
	"scope" text NOT NULL,
	"status" "version_status" DEFAULT 'draft' NOT NULL,
	"effective_date" date,
	"retirement_date" date,
	"mandatory_from" date,
	"replaces_version_id" uuid,
	"replaces_label" text,
	"published_at" timestamp with time zone,
	"published_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"publisher" text NOT NULL,
	"description" text,
	"homepage_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standard_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"standard_version_id" uuid NOT NULL,
	"document_id" uuid,
	"parent_id" uuid,
	"source_guid" text,
	"source_identifier" text,
	"title" text NOT NULL,
	"body" text,
	"depth" integer DEFAULT 1 NOT NULL,
	"section_order" integer NOT NULL,
	"source_page" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requirement_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_requirement_version_id" uuid NOT NULL,
	"to_requirement_version_id" uuid NOT NULL,
	"relationship_type" "relationship_type" NOT NULL,
	"origin" "relationship_origin" NOT NULL,
	"confidence" double precision,
	"text_similarity" double precision,
	"level_changed" boolean DEFAULT false NOT NULL,
	"notes" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requirement_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requirement_id" uuid NOT NULL,
	"standard_version_id" uuid NOT NULL,
	"document_id" uuid,
	"source_requirement_id" text NOT NULL,
	"sort_key" integer NOT NULL,
	"section_id" uuid,
	"subsection_id" uuid,
	"principle_guid" text,
	"principle_text" text NOT NULL,
	"criteria_guid" text,
	"criteria_text" text,
	"level_guid" text,
	"level" "requirement_level" NOT NULL,
	"na_exempt" boolean DEFAULT false NOT NULL,
	"phu_related" boolean DEFAULT false NOT NULL,
	"source_page" integer,
	"source_location" jsonb,
	"source_excerpt" text,
	"status" "requirement_status" DEFAULT 'extracted' NOT NULL,
	"effective_date" date,
	"retirement_date" date,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"standard_id" uuid NOT NULL,
	"stable_key" text NOT NULL,
	"latest_source_identifier" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checklist_id" uuid NOT NULL,
	"requirement_version_id" uuid,
	"source_guid" text,
	"source_identifier" text,
	"question_text" text,
	"criteria_text" text,
	"response_options" jsonb,
	"is_header" jsonb,
	"display_order" integer NOT NULL,
	"source_location" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"standard_version_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"source_sheet" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applicability_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"standard_version_id" uuid NOT NULL,
	"source_guid" text NOT NULL,
	"source_number" integer,
	"question_text" text NOT NULL,
	"justification_template" text,
	"exempting_answer" "scoping_answer" DEFAULT 'no' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requirement_applicability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requirement_version_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"source" "applicability_source" DEFAULT 'globalgap_official' NOT NULL,
	"never_exempt" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"level" "log_level" DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"standard_version_id" uuid,
	"document_id" uuid,
	"stage" "job_stage" NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"error_stack" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"action" text NOT NULL,
	"actor" text NOT NULL,
	"changes" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"standard_version_id" uuid NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"decision" "review_decision" NOT NULL,
	"reviewer" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quality_gate_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"standard_version_id" uuid NOT NULL,
	"gate" text NOT NULL,
	"description" text NOT NULL,
	"passed" boolean NOT NULL,
	"blocking" boolean DEFAULT true NOT NULL,
	"expected" text,
	"actual" text,
	"score" double precision,
	"failures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"model" text NOT NULL,
	"system_prompt_hash" text,
	"question" text NOT NULL,
	"answer" text,
	"citations" jsonb,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"duration_ms" integer,
	"finish_reason" text,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"step_index" integer NOT NULL,
	"tool_name" text NOT NULL,
	"arguments" jsonb,
	"result" jsonb,
	"duration_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chunk_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chunk_id" uuid NOT NULL,
	"model" text NOT NULL,
	"dimensions" integer NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"standard_version_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"section_id" uuid,
	"requirement_version_id" uuid,
	"chunk_type" "chunk_type" NOT NULL,
	"heading" text,
	"text" text NOT NULL,
	"token_count" integer NOT NULL,
	"source_page" integer,
	"source_location" jsonb,
	"authority_level" integer NOT NULL,
	"content_hash" text NOT NULL,
	"ordinal" integer NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('complifine_en', coalesce("document_chunks"."heading", '')), 'A') || setweight(to_tsvector('complifine_en', "document_chunks"."text"), 'B')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"suite" text NOT NULL,
	"case_id" text NOT NULL,
	"category" text NOT NULL,
	"question" text NOT NULL,
	"expected" jsonb,
	"actual" jsonb,
	"passed" jsonb NOT NULL,
	"metrics" jsonb,
	"notes" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retrieval_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query" text NOT NULL,
	"strategy" text NOT NULL,
	"filters" jsonb,
	"result_count" integer NOT NULL,
	"results" jsonb,
	"duration_ms" integer,
	"agent_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "standard_documents" ADD CONSTRAINT "standard_documents_standard_version_id_standard_versions_id_fk" FOREIGN KEY ("standard_version_id") REFERENCES "public"."standard_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standard_versions" ADD CONSTRAINT "standard_versions_standard_id_standards_id_fk" FOREIGN KEY ("standard_id") REFERENCES "public"."standards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standard_versions" ADD CONSTRAINT "standard_versions_replaces_version_id_standard_versions_id_fk" FOREIGN KEY ("replaces_version_id") REFERENCES "public"."standard_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standard_sections" ADD CONSTRAINT "standard_sections_standard_version_id_standard_versions_id_fk" FOREIGN KEY ("standard_version_id") REFERENCES "public"."standard_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standard_sections" ADD CONSTRAINT "standard_sections_document_id_standard_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."standard_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standard_sections" ADD CONSTRAINT "standard_sections_parent_id_standard_sections_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."standard_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_relationships" ADD CONSTRAINT "requirement_relationships_from_requirement_version_id_requirement_versions_id_fk" FOREIGN KEY ("from_requirement_version_id") REFERENCES "public"."requirement_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_relationships" ADD CONSTRAINT "requirement_relationships_to_requirement_version_id_requirement_versions_id_fk" FOREIGN KEY ("to_requirement_version_id") REFERENCES "public"."requirement_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_versions" ADD CONSTRAINT "requirement_versions_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_versions" ADD CONSTRAINT "requirement_versions_standard_version_id_standard_versions_id_fk" FOREIGN KEY ("standard_version_id") REFERENCES "public"."standard_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_versions" ADD CONSTRAINT "requirement_versions_document_id_standard_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."standard_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_versions" ADD CONSTRAINT "requirement_versions_section_id_standard_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."standard_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_versions" ADD CONSTRAINT "requirement_versions_subsection_id_standard_sections_id_fk" FOREIGN KEY ("subsection_id") REFERENCES "public"."standard_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_standard_id_standards_id_fk" FOREIGN KEY ("standard_id") REFERENCES "public"."standards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_checklist_id_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_requirement_version_id_requirement_versions_id_fk" FOREIGN KEY ("requirement_version_id") REFERENCES "public"."requirement_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_standard_version_id_standard_versions_id_fk" FOREIGN KEY ("standard_version_id") REFERENCES "public"."standard_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_document_id_standard_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."standard_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applicability_questions" ADD CONSTRAINT "applicability_questions_standard_version_id_standard_versions_id_fk" FOREIGN KEY ("standard_version_id") REFERENCES "public"."standard_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_applicability" ADD CONSTRAINT "requirement_applicability_requirement_version_id_requirement_versions_id_fk" FOREIGN KEY ("requirement_version_id") REFERENCES "public"."requirement_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_applicability" ADD CONSTRAINT "requirement_applicability_question_id_applicability_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."applicability_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_events" ADD CONSTRAINT "ingestion_events_job_id_ingestion_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ingestion_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_standard_version_id_standard_versions_id_fk" FOREIGN KEY ("standard_version_id") REFERENCES "public"."standard_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_document_id_standard_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."standard_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_reviews" ADD CONSTRAINT "knowledge_reviews_standard_version_id_standard_versions_id_fk" FOREIGN KEY ("standard_version_id") REFERENCES "public"."standard_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_gate_results" ADD CONSTRAINT "quality_gate_results_standard_version_id_standard_versions_id_fk" FOREIGN KEY ("standard_version_id") REFERENCES "public"."standard_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tool_calls" ADD CONSTRAINT "agent_tool_calls_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunk_embeddings" ADD CONSTRAINT "chunk_embeddings_chunk_id_document_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."document_chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_standard_version_id_standard_versions_id_fk" FOREIGN KEY ("standard_version_id") REFERENCES "public"."standard_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_standard_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."standard_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_section_id_standard_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."standard_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_requirement_version_id_requirement_versions_id_fk" FOREIGN KEY ("requirement_version_id") REFERENCES "public"."requirement_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "standard_documents_slug_key" ON "standard_documents" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "standard_documents_version_idx" ON "standard_documents" USING btree ("standard_version_id");--> statement-breakpoint
CREATE INDEX "standard_documents_type_idx" ON "standard_documents" USING btree ("document_type");--> statement-breakpoint
CREATE INDEX "standard_documents_hash_idx" ON "standard_documents" USING btree ("file_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "standard_documents_current_key" ON "standard_documents" USING btree ("standard_version_id","document_type","language") WHERE status <> 'superseded';--> statement-breakpoint
CREATE UNIQUE INDEX "standard_versions_code_key" ON "standard_versions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "standard_versions_standard_idx" ON "standard_versions" USING btree ("standard_id");--> statement-breakpoint
CREATE INDEX "standard_versions_status_idx" ON "standard_versions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "standards_code_key" ON "standards" USING btree ("code");--> statement-breakpoint
CREATE INDEX "standard_sections_version_idx" ON "standard_sections" USING btree ("standard_version_id");--> statement-breakpoint
CREATE INDEX "standard_sections_parent_idx" ON "standard_sections" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "standard_sections_order_idx" ON "standard_sections" USING btree ("standard_version_id","section_order");--> statement-breakpoint
CREATE UNIQUE INDEX "standard_sections_guid_key" ON "standard_sections" USING btree ("standard_version_id","source_guid");--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_relationships_key" ON "requirement_relationships" USING btree ("from_requirement_version_id","to_requirement_version_id","relationship_type");--> statement-breakpoint
CREATE INDEX "requirement_relationships_from_idx" ON "requirement_relationships" USING btree ("from_requirement_version_id");--> statement-breakpoint
CREATE INDEX "requirement_relationships_to_idx" ON "requirement_relationships" USING btree ("to_requirement_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_versions_identity_key" ON "requirement_versions" USING btree ("standard_version_id","source_requirement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_versions_requirement_key" ON "requirement_versions" USING btree ("standard_version_id","requirement_id");--> statement-breakpoint
CREATE INDEX "requirement_versions_version_idx" ON "requirement_versions" USING btree ("standard_version_id");--> statement-breakpoint
CREATE INDEX "requirement_versions_level_idx" ON "requirement_versions" USING btree ("standard_version_id","level");--> statement-breakpoint
CREATE INDEX "requirement_versions_section_idx" ON "requirement_versions" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "requirement_versions_sort_idx" ON "requirement_versions" USING btree ("standard_version_id","sort_key");--> statement-breakpoint
CREATE INDEX "requirement_versions_status_idx" ON "requirement_versions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "requirements_stable_key" ON "requirements" USING btree ("standard_id","stable_key");--> statement-breakpoint
CREATE INDEX "requirements_latest_identifier_idx" ON "requirements" USING btree ("latest_source_identifier");--> statement-breakpoint
CREATE INDEX "checklist_items_checklist_idx" ON "checklist_items" USING btree ("checklist_id");--> statement-breakpoint
CREATE INDEX "checklist_items_requirement_idx" ON "checklist_items" USING btree ("requirement_version_id");--> statement-breakpoint
CREATE INDEX "checklist_items_order_idx" ON "checklist_items" USING btree ("checklist_id","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_items_guid_key" ON "checklist_items" USING btree ("checklist_id","source_guid");--> statement-breakpoint
CREATE UNIQUE INDEX "checklists_slug_key" ON "checklists" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "checklists_version_idx" ON "checklists" USING btree ("standard_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "applicability_questions_guid_key" ON "applicability_questions" USING btree ("standard_version_id","source_guid");--> statement-breakpoint
CREATE INDEX "applicability_questions_version_idx" ON "applicability_questions" USING btree ("standard_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_applicability_key" ON "requirement_applicability" USING btree ("requirement_version_id","question_id");--> statement-breakpoint
CREATE INDEX "requirement_applicability_requirement_idx" ON "requirement_applicability" USING btree ("requirement_version_id");--> statement-breakpoint
CREATE INDEX "requirement_applicability_question_idx" ON "requirement_applicability" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "ingestion_events_job_idx" ON "ingestion_events" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX "ingestion_events_level_idx" ON "ingestion_events" USING btree ("level");--> statement-breakpoint
CREATE INDEX "ingestion_jobs_run_idx" ON "ingestion_jobs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "ingestion_jobs_document_idx" ON "ingestion_jobs" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "ingestion_jobs_status_idx" ON "ingestion_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ingestion_jobs_stage_idx" ON "ingestion_jobs" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor");--> statement-breakpoint
CREATE INDEX "knowledge_reviews_version_idx" ON "knowledge_reviews" USING btree ("standard_version_id");--> statement-breakpoint
CREATE INDEX "knowledge_reviews_entity_idx" ON "knowledge_reviews" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quality_gate_results_key" ON "quality_gate_results" USING btree ("standard_version_id","gate");--> statement-breakpoint
CREATE INDEX "quality_gate_results_version_idx" ON "quality_gate_results" USING btree ("standard_version_id");--> statement-breakpoint
CREATE INDEX "quality_gate_results_passed_idx" ON "quality_gate_results" USING btree ("passed");--> statement-breakpoint
CREATE INDEX "agent_runs_conversation_idx" ON "agent_runs" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_runs_created_idx" ON "agent_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_tool_calls_run_idx" ON "agent_tool_calls" USING btree ("agent_run_id","step_index");--> statement-breakpoint
CREATE INDEX "agent_tool_calls_tool_idx" ON "agent_tool_calls" USING btree ("tool_name");--> statement-breakpoint
CREATE UNIQUE INDEX "chunk_embeddings_key" ON "chunk_embeddings" USING btree ("chunk_id","model");--> statement-breakpoint
CREATE INDEX "chunk_embeddings_model_idx" ON "chunk_embeddings" USING btree ("model");--> statement-breakpoint
CREATE INDEX "chunk_embeddings_hnsw_idx" ON "chunk_embeddings" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16,ef_construction=64);--> statement-breakpoint
CREATE INDEX "document_chunks_version_idx" ON "document_chunks" USING btree ("standard_version_id");--> statement-breakpoint
CREATE INDEX "document_chunks_document_idx" ON "document_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_chunks_requirement_idx" ON "document_chunks" USING btree ("requirement_version_id");--> statement-breakpoint
CREATE INDEX "document_chunks_type_idx" ON "document_chunks" USING btree ("chunk_type");--> statement-breakpoint
CREATE INDEX "document_chunks_ordinal_idx" ON "document_chunks" USING btree ("document_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "document_chunks_hash_key" ON "document_chunks" USING btree ("document_id","content_hash");--> statement-breakpoint
CREATE INDEX "document_chunks_fts_idx" ON "document_chunks" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "document_chunks_trgm_idx" ON "document_chunks" USING gin ("text" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "eval_results_key" ON "eval_results" USING btree ("run_id","case_id");--> statement-breakpoint
CREATE INDEX "eval_results_run_idx" ON "eval_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "eval_results_suite_idx" ON "eval_results" USING btree ("suite");--> statement-breakpoint
CREATE INDEX "retrieval_logs_created_idx" ON "retrieval_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "retrieval_logs_strategy_idx" ON "retrieval_logs" USING btree ("strategy");--> statement-breakpoint
CREATE INDEX "retrieval_logs_agent_run_idx" ON "retrieval_logs" USING btree ("agent_run_id");