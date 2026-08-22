/**
 * Users, organisations, memberships, sessions and demo leads.
 *
 * Knowledge tables stay global: published standards are shared. Everything a
 * company owns — sites, scoping answers, conversations, demo interest — hangs
 * off `organizations`. Operators of CompliFine (`users.kind = operator`) are
 * not tenants; they ingest and review knowledge. Members belong to one or more
 * organisations via `memberships`.
 */

import { relations } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  membershipRoleEnum,
  primaryId,
  timestamps,
  userKindEnum,
} from "./_shared.ts";

export const users = pgTable(
  "users",
  {
    id: primaryId(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    kind: userKindEnum("kind").notNull().default("member"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_email_key").on(t.email),
    index("users_kind_idx").on(t.kind),
  ],
);

export const organizations = pgTable(
  "organizations",
  {
    id: primaryId(),
    name: text("name").notNull(),
    /** ISO 3166-1 alpha-2. Kenyan exporters are the first market. */
    country: text("country").notNull().default("KE"),
    /** Sedex company reference, e.g. ZC123456789. Optional; Sedex is a platform, not a standard. */
    sedexZc: text("sedex_zc"),
    ...timestamps,
  },
  (t) => [index("organizations_country_idx").on(t.country)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: primaryId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull().default("viewer"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("memberships_user_org_key").on(t.userId, t.organizationId),
    index("memberships_org_idx").on(t.organizationId),
  ],
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: primaryId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 of the token presented to the client. The raw value is never stored. */
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("refresh_tokens_hash_key").on(t.tokenHash),
    index("refresh_tokens_user_idx").on(t.userId),
  ],
);

export const demoRequests = pgTable(
  "demo_requests",
  {
    id: primaryId(),
    name: text("name").notNull(),
    company: text("company").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    /** `globalgap-ifa`, `smeta-7`, `both`. */
    interests: text("interests").notNull().default("both"),
    message: text("message"),
    status: text("status").notNull().default("new"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("demo_requests_status_idx").on(t.status),
    index("demo_requests_created_idx").on(t.createdAt),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
  refreshTokens: many(refreshTokens),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(memberships),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
  organization: one(organizations, {
    fields: [memberships.organizationId],
    references: [organizations.id],
  }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type DemoRequest = typeof demoRequests.$inferSelect;
export type NewDemoRequest = typeof demoRequests.$inferInsert;
