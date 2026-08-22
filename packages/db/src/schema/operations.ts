/**
 * Company operations: sites, certification scope, persisted scoping answers.
 *
 * The knowledge layer answers "what does the standard say". This layer answers
 * "what does this farm look like". Scoping answers that used to live only in
 * the request body of `/scope` are stored per site so the agent can resolve
 * the applicable checklist without asking the 16 questions again.
 */

import { relations } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  primaryId,
  scopingAnswerEnum,
  siteTypeEnum,
  timestamps,
} from "./_shared.ts";
import { organizations } from "./tenancy.ts";
import { standardVersions } from "./standards.ts";
import { applicabilityQuestions } from "./applicability.ts";

export const sites = pgTable(
  "sites",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    siteType: siteTypeEnum("site_type").notNull().default("farm"),
    location: text("location"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("sites_org_idx").on(t.organizationId),
    uniqueIndex("sites_org_name_key").on(t.organizationId, t.name),
  ],
);

export const organizationScopes = pgTable(
  "organization_scopes",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    standardVersionId: uuid("standard_version_id")
      .notNull()
      .references(() => standardVersions.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("organization_scopes_key").on(t.organizationId, t.standardVersionId),
    index("organization_scopes_org_idx").on(t.organizationId),
  ],
);

export const siteScopingAnswers = pgTable(
  "site_scoping_answers",
  {
    id: primaryId(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => applicabilityQuestions.id, { onDelete: "cascade" }),
    answer: scopingAnswerEnum("answer").notNull().default("unanswered"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("site_scoping_answers_key").on(t.siteId, t.questionId),
    index("site_scoping_answers_site_idx").on(t.siteId),
  ],
);

export const sitesRelations = relations(sites, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [sites.organizationId],
    references: [organizations.id],
  }),
  scopingAnswers: many(siteScopingAnswers),
}));

export const organizationScopesRelations = relations(organizationScopes, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationScopes.organizationId],
    references: [organizations.id],
  }),
  standardVersion: one(standardVersions, {
    fields: [organizationScopes.standardVersionId],
    references: [standardVersions.id],
  }),
}));

export const siteScopingAnswersRelations = relations(siteScopingAnswers, ({ one }) => ({
  site: one(sites, { fields: [siteScopingAnswers.siteId], references: [sites.id] }),
  question: one(applicabilityQuestions, {
    fields: [siteScopingAnswers.questionId],
    references: [applicabilityQuestions.id],
  }),
}));

export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
export type OrganizationScope = typeof organizationScopes.$inferSelect;
export type SiteScopingAnswer = typeof siteScopingAnswers.$inferSelect;
