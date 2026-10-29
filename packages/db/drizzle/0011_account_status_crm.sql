CREATE TYPE "account_status" AS ENUM ('pending', 'active', 'rejected', 'disabled');

ALTER TABLE "users"
  ADD COLUMN "account_status" "account_status" NOT NULL DEFAULT 'active',
  ADD COLUMN "approved_at" timestamptz,
  ADD COLUMN "approved_by" uuid,
  ADD COLUMN "status_note" text;

ALTER TABLE "users"
  ADD CONSTRAINT "users_approved_by_users_id_fk"
  FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX "users_account_status_idx" ON "users" USING btree ("account_status");

CREATE TABLE "crm_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "operator_id" uuid NOT NULL,
  "user_id" uuid,
  "demo_request_id" uuid,
  "to_email" text NOT NULL,
  "subject" text NOT NULL,
  "body" text NOT NULL,
  "kind" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE "crm_messages"
  ADD CONSTRAINT "crm_messages_operator_id_users_id_fk"
  FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "crm_messages"
  ADD CONSTRAINT "crm_messages_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "crm_messages"
  ADD CONSTRAINT "crm_messages_demo_request_id_demo_requests_id_fk"
  FOREIGN KEY ("demo_request_id") REFERENCES "demo_requests"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX "crm_messages_user_idx" ON "crm_messages" USING btree ("user_id");
CREATE INDEX "crm_messages_demo_idx" ON "crm_messages" USING btree ("demo_request_id");
