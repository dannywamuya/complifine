/**
 * Alerts a person opted into, and how they want them delivered.
 *
 * A row in `notifications` is the in-app delivery. Email, SMS and push are
 * columns and an endpoints table so a later sender does not need a migration.
 * Nothing here is written by the model: a digest job inserts from pending work.
 */

import { relations } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  notificationChannelEnum,
  notificationDigestEnum,
  notificationEventTypeEnum,
  primaryId,
  timestamps,
} from "./_shared.ts";
import { organizations, users } from "./tenancy.ts";
import { sites } from "./operations.ts";

export interface NotificationCounts {
  readonly overdue: number;
  readonly due: number;
  readonly pending: number;
  readonly missing: number;
}

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: primaryId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    eventType: notificationEventTypeEnum("event_type").notNull(),
    channel: notificationChannelEnum("channel").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    digest: notificationDigestEnum("digest").notNull().default("daily"),
    /** For `record_due`: only notify when expiry is within this many days. */
    leadDays: integer("lead_days").notNull().default(7),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("notification_preferences_key").on(t.userId, t.organizationId, t.eventType, t.channel),
    index("notification_preferences_user_idx").on(t.userId, t.organizationId),
  ],
);

/** One row per person per company. Null `siteIds` means every site. */
export const notificationSettings = pgTable(
  "notification_settings",
  {
    id: primaryId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    deliveryHourLocal: integer("delivery_hour_local").notNull().default(7),
    timezone: text("timezone").notNull().default("Africa/Nairobi"),
    quietStart: integer("quiet_start"),
    quietEnd: integer("quiet_end"),
    siteIds: uuid("site_ids").array(),
    ...timestamps,
  },
  (t) => [uniqueIndex("notification_settings_user_org_key").on(t.userId, t.organizationId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: primaryId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    eventType: notificationEventTypeEnum("event_type").notNull(),
    channel: notificationChannelEnum("channel").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    href: text("href"),
    subjectKey: text("subject_key").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    counts: jsonb("counts").$type<NotificationCounts>(),
    readAt: timestamp("read_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("notifications_user_dedupe_key").on(t.userId, t.dedupeKey),
    index("notifications_user_read_idx").on(t.userId, t.readAt),
  ],
);

/** Address book for a later email, SMS or push sender. Unused by the app today. */
export const notificationChannelEndpoints = pgTable(
  "notification_channel_endpoints",
  {
    id: primaryId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: notificationChannelEnum("channel").notNull(),
    address: text("address").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("notification_channel_endpoints_key").on(t.userId, t.channel, t.address)],
);

export const notificationPreferencesRelations = relations(notificationPreferences, ({ one }) => ({
  user: one(users, { fields: [notificationPreferences.userId], references: [users.id] }),
  organization: one(organizations, {
    fields: [notificationPreferences.organizationId],
    references: [organizations.id],
  }),
}));

export const notificationSettingsRelations = relations(notificationSettings, ({ one }) => ({
  user: one(users, { fields: [notificationSettings.userId], references: [users.id] }),
  organization: one(organizations, {
    fields: [notificationSettings.organizationId],
    references: [organizations.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  organization: one(organizations, {
    fields: [notifications.organizationId],
    references: [organizations.id],
  }),
  site: one(sites, { fields: [notifications.siteId], references: [sites.id] }),
}));

export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NotificationSetting = typeof notificationSettings.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
