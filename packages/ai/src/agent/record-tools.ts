/**
 * Org-scoped record and evidence tools.
 *
 * Reads report what is on file. The one write, `draftRecord`, creates a draft
 * and nothing else: it cannot submit, verify, or make a row count as evidence.
 */

import { tool } from "ai";
import { z } from "zod";
import { and, desc, eq, isNull, lt, type Database } from "@complifine/db";
import {
  evidence,
  evidenceTypes,
  formRecordEntries,
  formRecords,
  formTemplates,
  sites,
} from "@complifine/db";
import type { FormDefinition } from "@complifine/core";
import { evidenceGap } from "../evidence-gap.ts";
import { auditReadiness } from "../readiness.ts";
import { extractDraft } from "../capture/extract.ts";
import { openaiCaptureGenerator } from "../capture/openai.ts";
import type { ToolContext } from "./tools.ts";

function siteIdOf(context: ToolContext, requested?: string): string {
  const id = requested || context.siteId;
  if (!id) throw new Error("Say which site. The conversation has no site selected.");
  return id;
}

async function ownedSite(db: Database, orgId: string, siteId: string) {
  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.organizationId, orgId)));
  if (!site) throw new Error("That site is not in this organisation.");
  return site;
}

export function recordTools(context: ToolContext) {
  const run = async <T>(name: string, args: unknown, fn: () => Promise<T>) => {
    const started = performance.now();
    try {
      const result = JSON.parse(JSON.stringify(await fn())) as T;
      await context.onCall?.({ name, args, result, durationMs: Math.round(performance.now() - started) });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await context.onCall?.({
        name,
        args,
        result: null,
        durationMs: Math.round(performance.now() - started),
        error: message,
      });
      return { error: message };
    }
  };

  return {
    listMyEvidence: tool({
      description:
        "Evidence filed for this organisation. Draft records are not included. Do not say a file proves a requirement; say it is on file.",
      inputSchema: z.object({ siteId: z.string().optional() }),
      execute: async (args) =>
        run("listMyEvidence", args, async () => {
          const orgId = requireOrg(context);
          const site = await ownedSite(context.db, orgId, siteIdOf(context, args.siteId));
          const rows = await context.db
            .select({
              id: evidence.id,
              type: evidenceTypes.slug,
              title: evidenceTypes.title,
              source: evidence.source,
              validFrom: evidence.validFrom,
              expiresAt: evidence.expiresAt,
              verificationStatus: evidence.verificationStatus,
            })
            .from(evidence)
            .innerJoin(evidenceTypes, eq(evidenceTypes.id, evidence.evidenceTypeId))
            .where(and(eq(evidence.organizationId, orgId), eq(evidence.siteId, site.id)))
            .orderBy(desc(evidence.createdAt))
            .limit(50);
          return { site: site.name, evidence: rows };
        }),
    }),
    getEvidenceGap: tool({
      description:
        "Missing, stale, expired and unmapped evidence for a site and a published version. Summarise the counts. Do not claim the site is certified.",
      inputSchema: z.object({
        siteId: z.string().optional(),
        versionCode: z.string().describe("Published version code, e.g. ifa-v6-smart-fv"),
      }),
      execute: async (args) =>
        run("getEvidenceGap", args, async () => {
          const orgId = requireOrg(context);
          const site = await ownedSite(context.db, orgId, siteIdOf(context, args.siteId));
          const { standardVersions } = await import("@complifine/db");
          const [version] = await context.db
            .select()
            .from(standardVersions)
            .where(eq(standardVersions.code, args.versionCode));
          if (!version) throw new Error(`Unknown version ${args.versionCode}`);
          if (context.publishedOnly && version.status !== "published") {
            throw new Error("That edition is not published.");
          }
          const gap = await evidenceGap(context.db, {
            siteId: site.id,
            siteType: site.siteType,
            versionId: version.id,
          });
          return {
            site: site.name,
            version: version.code,
            counts: gap.counts,
            missing: gap.rows.filter((row) => row.status === "missing").slice(0, 20),
            stale: gap.rows.filter((row) => row.status === "stale" || row.status === "expired").slice(0, 20),
          };
        }),
    }),
    listMyRecords: tool({
      description: "Records for a template slug at a site, including drafts. Drafts do not count as evidence.",
      inputSchema: z.object({
        templateSlug: z.string().optional(),
        siteId: z.string().optional(),
      }),
      execute: async (args) =>
        run("listMyRecords", args, async () => {
          const orgId = requireOrg(context);
          const site = await ownedSite(context.db, orgId, siteIdOf(context, args.siteId));
          const template = args.templateSlug ? await templateBySlug(context.db, args.templateSlug) : null;
          const rows = await context.db
            .select({
              id: formRecords.id,
              status: formRecords.status,
              origin: formRecords.origin,
              submittedAt: formRecords.submittedAt,
              templateId: formRecords.templateId,
            })
            .from(formRecords)
            .where(
              and(
                eq(formRecords.organizationId, orgId),
                eq(formRecords.siteId, site.id),
                template ? eq(formRecords.templateId, template.id) : undefined,
              ),
            )
            .orderBy(desc(formRecords.createdAt))
            .limit(30);
          return { site: site.name, records: rows };
        }),
    }),
    getOverdueRecords: tool({
      description: "Submitted form evidence whose cadence has lapsed at a site.",
      inputSchema: z.object({ siteId: z.string().optional() }),
      execute: async (args) =>
        run("getOverdueRecords", args, async () => {
          const orgId = requireOrg(context);
          const site = await ownedSite(context.db, orgId, siteIdOf(context, args.siteId));
          const rows = await context.db
            .select({
              evidenceId: evidence.id,
              type: evidenceTypes.title,
              expiresAt: evidence.expiresAt,
              formRecordId: evidence.formRecordId,
            })
            .from(evidence)
            .innerJoin(evidenceTypes, eq(evidenceTypes.id, evidence.evidenceTypeId))
            .where(
              and(
                eq(evidence.organizationId, orgId),
                eq(evidence.siteId, site.id),
                eq(evidence.source, "form"),
                lt(evidence.expiresAt, new Date()),
              ),
            )
            .limit(30);
          return { site: site.name, overdue: rows };
        }),
    }),
    draftRecord: tool({
      description:
        "Create a DRAFT record from a sentence the user dictated. Returns a review link. Never sets any status other than draft and never creates evidence.",
      inputSchema: z.object({
        templateSlug: z.string(),
        siteId: z.string().optional(),
        text: z.string().min(2),
      }),
      execute: async (args) =>
        run("draftRecord", args, async () => {
          const orgId = requireOrg(context);
          const site = await ownedSite(context.db, orgId, siteIdOf(context, args.siteId));
          const template = await templateBySlug(context.db, args.templateSlug);
          if (!template.definition) throw new Error("That template has no columns.");
          if (!template.siteTypes.includes(site.siteType)) {
            throw new Error("That record does not apply to this site.");
          }
          const extracted = await extractDraft(
            template.definition as FormDefinition,
            { text: args.text },
            openaiCaptureGenerator(),
          );
          const [record] = await context.db
            .insert(formRecords)
            .values({
              organizationId: orgId,
              siteId: site.id,
              templateId: template.id,
              templateVersion: template.version,
              status: "draft",
              origin: "capture",
              header: extracted.header,
              headerExtraction: extracted.headerExtraction,
              createdBy: context.userId ?? null,
            })
            .returning();
          for (const entry of extracted.entries) {
            await context.db.insert(formRecordEntries).values({
              recordId: record!.id,
              data: entry.data,
              extraction: entry.extraction,
              enteredBy: context.userId ?? null,
            });
          }
          return {
            recordId: record!.id,
            status: "draft",
            reviewPath: `/app/records/${template.id}/${record!.id}`,
            note: "This is a draft. It does not count until a person confirms it.",
          };
        }),
    }),
    getMyAssessment: tool({
      description: "The latest self-assessment responses for a site and edition. Read only.",
      inputSchema: z.object({
        siteId: z.string().optional(),
        versionCode: z.string(),
      }),
      execute: async (args) =>
        run("getMyAssessment", args, async () => {
          const orgId = requireOrg(context);
          const site = await ownedSite(context.db, orgId, siteIdOf(context, args.siteId));
          const { assessments, assessmentItems, requirementVersions, standardVersions } = await import("@complifine/db");
          const [version] = await context.db
            .select()
            .from(standardVersions)
            .where(eq(standardVersions.code, args.versionCode));
          if (!version) throw new Error(`Unknown version ${args.versionCode}`);
          const [assessment] = await context.db
            .select()
            .from(assessments)
            .where(and(eq(assessments.siteId, site.id), eq(assessments.standardVersionId, version.id)))
            .orderBy(desc(assessments.createdAt))
            .limit(1);
          if (!assessment) return { assessment: null };
          const items = await context.db
            .select({
              criterion: requirementVersions.sourceRequirementId,
              response: assessmentItems.response,
              comment: assessmentItems.comment,
            })
            .from(assessmentItems)
            .innerJoin(requirementVersions, eq(requirementVersions.id, assessmentItems.requirementVersionId))
            .where(eq(assessmentItems.assessmentId, assessment.id))
            .limit(40);
          return { status: assessment.status, items };
        }),
    }),
    getAuditReadiness: tool({
      description:
        "Internal readiness percent and counts for a site and edition. Never say the site is certified. Use the same figures the readiness page shows.",
      inputSchema: z.object({
        siteId: z.string().optional(),
        versionCode: z.string(),
      }),
      execute: async (args) =>
        run("getAuditReadiness", args, async () => {
          const orgId = requireOrg(context);
          const site = await ownedSite(context.db, orgId, siteIdOf(context, args.siteId));
          const { standardVersions } = await import("@complifine/db");
          const [version] = await context.db
            .select()
            .from(standardVersions)
            .where(eq(standardVersions.code, args.versionCode));
          if (!version) throw new Error(`Unknown version ${args.versionCode}`);
          if (context.publishedOnly && version.status !== "published") {
            throw new Error("That edition is not published.");
          }
          return auditReadiness(context.db, {
            organizationId: orgId,
            siteId: site.id,
            siteType: site.siteType,
            versionId: version.id,
          });
        }),
    }),
  };
}

function requireOrg(context: ToolContext): string {
  if (!context.organizationId) throw new Error("No organisation is attached to this conversation.");
  return context.organizationId;
}

async function templateBySlug(db: Database, slug: string) {
  const [template] = await db
    .select()
    .from(formTemplates)
    .where(and(eq(formTemplates.slug, slug), isNull(formTemplates.organizationId)));
  if (!template) throw new Error(`No template "${slug}".`);
  return template;
}
