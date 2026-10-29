CREATE TYPE "notification_event_type" AS ENUM ('record_overdue', 'record_due', 'record_sent_back', 'record_draft', 'evidence_missing', 'evidence_expired', 'daily_digest');
CREATE TYPE "notification_channel" AS ENUM ('in_app', 'email', 'sms', 'push');
CREATE TYPE "notification_digest" AS ENUM ('immediate', 'daily', 'off');

CREATE TABLE "notification_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "event_type" "notification_event_type" NOT NULL,
  "channel" "notification_channel" NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "digest" "notification_digest" DEFAULT 'daily' NOT NULL,
  "lead_days" integer DEFAULT 7 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "notification_preferences_key" ON "notification_preferences" ("user_id", "organization_id", "event_type", "channel");
CREATE INDEX "notification_preferences_user_idx" ON "notification_preferences" ("user_id", "organization_id");

CREATE TABLE "notification_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "delivery_hour_local" integer DEFAULT 7 NOT NULL,
  "timezone" text DEFAULT 'Africa/Nairobi' NOT NULL,
  "quiet_start" integer,
  "quiet_end" integer,
  "site_ids" uuid[],
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "notification_settings_user_org_key" ON "notification_settings" ("user_id", "organization_id");

CREATE TABLE "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE cascade,
  "event_type" "notification_event_type" NOT NULL,
  "channel" "notification_channel" NOT NULL,
  "title" text NOT NULL,
  "body" text DEFAULT '' NOT NULL,
  "href" text,
  "subject_key" text NOT NULL,
  "dedupe_key" text NOT NULL,
  "counts" jsonb,
  "read_at" timestamptz,
  "dismissed_at" timestamptz,
  "snoozed_until" timestamptz,
  "delivered_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "notifications_user_dedupe_key" ON "notifications" ("user_id", "dedupe_key");
CREATE INDEX "notifications_user_read_idx" ON "notifications" ("user_id", "read_at");

CREATE TABLE "notification_channel_endpoints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "channel" "notification_channel" NOT NULL,
  "address" text NOT NULL,
  "verified_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "notification_channel_endpoints_key" ON "notification_channel_endpoints" ("user_id", "channel", "address");
