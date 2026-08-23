-- Chat messages as a first-class tree (edits and regenerations are siblings).

ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "active_leaf_id" uuid;

CREATE TABLE IF NOT EXISTS "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
	"parent_id" uuid REFERENCES "conversation_messages"("id") ON DELETE CASCADE,
	"role" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'complete' NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"citations" jsonb,
	"ungrounded" jsonb,
	"tools" jsonb,
	"hits" jsonb,
	"error" text,
	"run_id" uuid,
	"duration_ms" integer,
	"feedback" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "conversation_messages_conv_idx" ON "conversation_messages" USING btree ("conversation_id","created_at");
CREATE INDEX IF NOT EXISTS "conversation_messages_parent_idx" ON "conversation_messages" USING btree ("parent_id");
