/**
 * The same to-do the Records page shows, computed once on the server so the
 * bell, the daily digest and the page agree.
 *
 * Overdue and due come from template freshness. Drafts and sent-back records
 * are pending. Upload-only evidence (a gap row with a type and no template)
 * is missing or overdue. Drafts never count as filed evidence.
 */

import { Elysia, status, t } from "elysia";
import { and, asc, eq, inArray, isNull, type Database } from "@complifine/db";
import {
  formRecords,
  formTemplates,
  organizationScopes,
  sites,
  standardVersions,
} from "@complifine/db";
import { evidenceGap } from "@complifine/ai";
import type { FormCadence, NotificationEventType } from "@complifine/core";
import { readAuth, requireOrg, type AuthUser } from "./auth/plugin.ts";
import { badgeFor, latestEvidence } from "./forms.ts";

export type PendingUrgency = "overdue" | "due" | "missing" | "sent_back" | "draft";

export interface PendingItem {
  readonly kind: "record" | "evidence";
  readonly urgency: PendingUrgency;
  readonly eventType: NotificationEventType;
  readonly title: string;
  readonly href: string;
  readonly subjectKey: string;
  readonly templateId?: string;
  readonly recordId?: string;
  readonly evidenceTypeId?: string;
  readonly expiresAt?: string | null;
}

export interface PendingCounts {
  overdue: number;
  due: number;
  pending: number;
  missing: number;
}

export async function pendingWork(
  db: Database,
  input: { readonly orgId: string; readonly siteId: string },
): Promise<{ items: PendingItem[]; counts: PendingCounts }> {
  const site = await ownedSite(db, input.orgId, input.siteId);
  const library = await db.select().from(formTemplates).where(isNull(formTemplates.organizationId));
  const applicable = library.filter((template) => template.siteTypes.includes(site.siteType));
  const byId = new Map(applicable.map((template) => [template.id, template]));
  const freshness = await latestEvidence(db, input.orgId, site.id);

  const open = await db
    .select()
    .from(formRecords)
    .where(
      and(
        eq(formRecords.organizationId, input.orgId),
        eq(formRecords.siteId, site.id),
        inArray(formRecords.status, ["draft", "rejected"]),
      ),
    );
  const drafted = new Set(open.map((record) => record.templateId));

  const items: PendingItem[] = [];
  for (const template of applicable) {
    const fresh = freshness.get(template.id) ?? { expiresAt: null, submittedAt: null };
    const badge = badgeFor(template.cadence as FormCadence, fresh);
    if ((badge !== "overdue" && badge !== "due") || drafted.has(template.id)) continue;
    items.push({
      kind: "record",
      urgency: badge,
      eventType: badge === "overdue" ? "record_overdue" : "record_due",
      title: template.title,
      href: `/app/records/new?template=${template.id}`,
      subjectKey: `${site.id}:${template.id}`,
      templateId: template.id,
      expiresAt: fresh.expiresAt?.toISOString() ?? null,
    });
  }

  for (const record of open) {
    const template = byId.get(record.templateId);
    const sentBack = record.status === "rejected";
    items.push({
      kind: "record",
      urgency: sentBack ? "sent_back" : "draft",
      eventType: sentBack ? "record_sent_back" : "record_draft",
      title: template?.title ?? "Record",
      href: `/app/records/${record.templateId}/${record.id}`,
      subjectKey: `${site.id}:${record.id}`,
      templateId: record.templateId,
      recordId: record.id,
    });
  }

  const [scope] = await db
    .select({ versionId: organizationScopes.standardVersionId })
    .from(organizationScopes)
    .innerJoin(standardVersions, eq(standardVersions.id, organizationScopes.standardVersionId))
    .where(eq(organizationScopes.organizationId, input.orgId))
    .orderBy(asc(organizationScopes.createdAt))
    .limit(1);

  if (scope) {
    const gap = await evidenceGap(db, {
      siteId: site.id,
      siteType: site.siteType,
      versionId: scope.versionId,
    });
    const uploads = new Map<string, { title: string; expired: boolean }>();
    for (const row of gap.rows) {
      if (!row.evidenceTypeId || row.templateId) continue;
      if (row.status !== "missing" && row.status !== "expired") continue;
      const current = uploads.get(row.evidenceTypeId);
      if (!current) {
        uploads.set(row.evidenceTypeId, {
          title: row.evidenceTypeTitle ?? "Evidence",
          expired: row.status === "expired",
        });
        continue;
      }
      if (row.status === "expired") current.expired = true;
    }
    for (const [evidenceTypeId, bucket] of uploads) {
      items.push({
        kind: "evidence",
        urgency: bucket.expired ? "overdue" : "missing",
        eventType: bucket.expired ? "evidence_expired" : "evidence_missing",
        title: bucket.title,
        href: `/app/records/evidence?type=${evidenceTypeId}`,
        subjectKey: `${site.id}:${evidenceTypeId}`,
        evidenceTypeId,
      });
    }
  }

  return { items, counts: countPending(items) };
}

export function countPending(items: readonly PendingItem[]): PendingCounts {
  return {
    overdue: items.filter((item) => item.urgency === "overdue").length,
    due: items.filter((item) => item.urgency === "due").length,
    pending: items.filter((item) => item.urgency === "draft" || item.urgency === "sent_back").length,
    missing: items.filter((item) => item.urgency === "missing").length,
  };
}

export function pendingRoutes(db: Database) {
  return new Elysia({ name: "complifine-pending" })
    .derive((ctx): { auth: AuthUser | null } => ({ auth: readAuth(ctx) }))
    .get(
      "/sites/:id/pending",
      async ({ auth, params }) => {
        const user = requireOrg(auth);
        return pendingWork(db, { orgId: user.orgId, siteId: params.id });
      },
      { params: t.Object({ id: t.String() }) },
    );
}

async function ownedSite(db: Database, orgId: string, siteId: string) {
  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.organizationId, orgId)));
  if (!site) throw status(404, { error: "Site not found" });
  return site;
}
