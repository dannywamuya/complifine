/**
 * Form templates, organisation variants, and the records a site fills.
 *
 * A record is a draft until someone submits it. Submission is the only path
 * here that writes an `evidence` row. Verified records are locked.
 */

import { Elysia, status, t } from "elysia";
import { and, asc, desc, eq, gte, inArray, isNull, lte, type Database } from "@complifine/db";
import {
  evidence,
  evidenceTypes,
  findings,
  formRecordEntries,
  companyDocuments,
  formRecords,
  formTemplates,
  organizations,
  sites,
} from "@complifine/db";
import {
  cadenceExpiry,
  mergeDefinition,
  validateEntry,
  validateHeader,
  type FormCadence,
  type FormDefinition,
  type FormValues,
  type FormVariantOverrides,
} from "@complifine/core";
import { readAuth, requireOrg, type AuthUser } from "./auth/plugin.ts";
import { attachEvidenceLinks } from "./evidence-links.ts";
import { captureDrafts, type CaptureFile } from "./capture.ts";
import type { CaptureGenerator } from "@complifine/ai";
import { normaliseMime, maxBytesFor, readOrgFile } from "./org-storage.ts";
import { pdfFilename, renderRecordPdf } from "./record-pdf.ts";

type OrgUser = AuthUser & { orgId: string };

const COLUMN_KEYS = ["definition", "entryFields", "headerFields"] as const;

const variantBody = t.Object({
  headerDefaults: t.Optional(t.Record(t.String(), t.Any())),
  optionLists: t.Optional(t.Record(t.String(), t.Array(t.String()))),
  fixedItems: t.Optional(
    t.Array(
      t.Object({
        key: t.String(),
        label: t.String(),
        group: t.Optional(t.String()),
      }),
    ),
  ),
  body: t.Optional(t.Record(t.String(), t.String())),
  docRef: t.Optional(t.Union([t.String(), t.Null()])),
  approverRole: t.Optional(t.Union([t.String(), t.Null()])),
  effectiveDate: t.Optional(t.Union([t.String(), t.Null()])),
  definition: t.Optional(t.Any()),
  entryFields: t.Optional(t.Any()),
  headerFields: t.Optional(t.Any()),
});

export function formRoutes(db: Database, generate?: CaptureGenerator) {
  return new Elysia({ name: "complifine-forms" })
    .derive((ctx): { auth: AuthUser | null } => ({ auth: readAuth(ctx) }))
    .get(
      "/form-templates",
      async ({ auth, query }) => {
        const user = requireOrg(auth);
        const library = await db
          .select()
          .from(formTemplates)
          .where(isNull(formTemplates.organizationId))
          .orderBy(asc(formTemplates.category), asc(formTemplates.title));
        const variants = await db
          .select()
          .from(formTemplates)
          .where(eq(formTemplates.organizationId, user.orgId));
        const variantByParent = new Map(
          variants.filter((row) => row.parentTemplateId).map((row) => [row.parentTemplateId!, row]),
        );

        const applicable = library.filter((template) =>
          query.siteType ? template.siteTypes.includes(query.siteType) : true,
        );

        const freshness = query.siteId
          ? await latestEvidence(db, user.orgId, query.siteId)
          : null;

        return {
          templates: applicable.map((template) =>
            presentTemplate(
              template,
              variantByParent.get(template.id) ?? null,
              freshness
                ? (freshness.get(template.id) ?? { expiresAt: null, submittedAt: null })
                : undefined,
            ),
          ),
        };
      },
      {
        query: t.Object({
          siteType: t.Optional(t.String()),
          siteId: t.Optional(t.String()),
        }),
      },
    )
    .post(
      "/form-templates/:id/variant",
      async ({ auth, params, body }) => {
        const user = requireOrg(auth);
        assertWriter(user);
        rejectColumns(body);
        const parent = await libraryTemplate(db, params.id);
        const [existing] = await db
          .select()
          .from(formTemplates)
          .where(
            and(
              eq(formTemplates.organizationId, user.orgId),
              eq(formTemplates.parentTemplateId, parent.id),
            ),
          );
        if (existing) throw status(409, { error: "This organisation already has a variant. Update it instead." });

        const [created] = await db
          .insert(formTemplates)
          .values({
            slug: parent.slug,
            title: parent.title,
            description: parent.description,
            category: parent.category,
            siteTypes: parent.siteTypes,
            cadence: parent.cadence,
            evidenceTypeId: parent.evidenceTypeId,
            overrides: overridesFrom(body),
            version: parent.version,
            sourceRef: parent.sourceRef,
            organizationId: user.orgId,
            parentTemplateId: parent.id,
            docRef: body.docRef ?? null,
            approverRole: body.approverRole ?? null,
            effectiveDate: parseDate(body.effectiveDate),
          })
          .returning();
        return presentTemplate(parent, created!);
      },
      { params: t.Object({ id: t.String() }), body: variantBody },
    )
    .patch(
      "/form-templates/:id",
      async ({ auth, params, body }) => {
        const user = requireOrg(auth);
        assertWriter(user);
        rejectColumns(body);
        const [variant] = await db
          .select()
          .from(formTemplates)
          .where(and(eq(formTemplates.id, params.id), eq(formTemplates.organizationId, user.orgId)));
        if (!variant?.parentTemplateId) {
          throw status(404, { error: "Only an organisation variant can be edited" });
        }
        const parent = await libraryTemplate(db, variant.parentTemplateId);
        const [updated] = await db
          .update(formTemplates)
          .set({
            overrides: { ...(variant.overrides ?? {}), ...overridesFrom(body) },
            docRef: body.docRef === undefined ? variant.docRef : body.docRef,
            approverRole: body.approverRole === undefined ? variant.approverRole : body.approverRole,
            effectiveDate:
              body.effectiveDate === undefined ? variant.effectiveDate : parseDate(body.effectiveDate),
            updatedAt: new Date(),
          })
          .where(eq(formTemplates.id, variant.id))
          .returning();
        return presentTemplate(parent, updated!);
      },
      { params: t.Object({ id: t.String() }), body: variantBody },
    )
    .get("/sites/:id/master-list", async ({ auth, params }) => {
      const user = requireOrg(auth);
      const site = await ownedSite(db, user.orgId, params.id);
      const { templates } = await templatesFor(db, user.orgId, site.siteType);
      return {
        site: { id: site.id, name: site.name, siteType: site.siteType },
        documents: templates.map((template) => ({
          docRef: template.docRef ?? template.sourceRef,
          title: template.title,
          category: template.category,
          version: template.version,
          cadence: template.cadence,
          sourceRef: template.sourceRef,
          effectiveDate: template.effectiveDate,
          approverRole: template.approverRole,
        })),
      };
    })
    .get(
      "/sites/:id/form-records",
      async ({ auth, params, query }) => {
        const user = requireOrg(auth);
        await ownedSite(db, user.orgId, params.id);
        const conditions = [
          eq(formRecords.organizationId, user.orgId),
          eq(formRecords.siteId, params.id),
        ];
        if (query.templateId) conditions.push(eq(formRecords.templateId, query.templateId));
        if (query.from) conditions.push(gte(formRecords.periodStart, new Date(query.from)));
        if (query.to) conditions.push(lte(formRecords.periodStart, new Date(query.to)));
        const rows = await db
          .select()
          .from(formRecords)
          .where(and(...conditions))
          .orderBy(desc(formRecords.createdAt));
        const evidenceById = await evidenceFor(db, rows.map((row) => row.evidenceId));
        const templates = await templatesById(db, rows.map((row) => row.templateId));
        return {
          records: rows.map((row) => {
            const template = templates.get(row.templateId);
            const filed = evidenceById.get(row.evidenceId ?? "");
            return {
              ...presentRecord(row, template, filed),
              title: template?.title ?? "Record",
              cadence: template?.cadence ?? "per_event",
              category: template?.category ?? "",
              badge: listBadge(row, template, filed),
            };
          }),
        };
      },
      {
        params: t.Object({ id: t.String() }),
        query: t.Object({
          templateId: t.Optional(t.String()),
          from: t.Optional(t.String()),
          to: t.Optional(t.String()),
        }),
      },
    )
    .post(
      "/form-records",
      async ({ auth, body }) => {
        const user = requireOrg(auth);
        assertWriter(user);
        const site = await ownedSite(db, user.orgId, body.siteId);
        const parent = await libraryTemplate(db, body.templateId);
        if (!parent.siteTypes.includes(site.siteType)) {
          throw status(422, { error: "This record does not apply to this site" });
        }
        const variant = await orgVariant(db, user.orgId, parent.id);
        const definition = merged(parent, variant);
        const defaults = variant?.overrides?.headerDefaults ?? {};
        const headerInput = { ...defaults, ...(body.header ?? {}) };
        const header = validateHeader(definition, headerInput);
        if (!header.ok && Object.keys(body.header ?? {}).length > 0) {
          throw status(422, { error: "Header is not valid", issues: header.issues });
        }
        const [created] = await db
          .insert(formRecords)
          .values({
            organizationId: user.orgId,
            siteId: site.id,
            templateId: parent.id,
            templateVersion: parent.version,
            periodStart: parseDate(body.periodStart),
            periodEnd: parseDate(body.periodEnd),
            origin: "manual",
            header: header.ok ? header.data : {},
            createdBy: user.id,
          })
          .returning();
        return presentRecord(created!, parent, undefined);
      },
      {
        body: t.Object({
          siteId: t.String(),
          templateId: t.String(),
          header: t.Optional(t.Record(t.String(), t.Any())),
          periodStart: t.Optional(t.String()),
          periodEnd: t.Optional(t.String()),
        }),
      },
    )
    .post(
      "/form-records/capture",
      async ({ auth, body }) => {
        const user = requireOrg(auth);
        assertWriter(user);
        if (!generate) throw status(503, { error: "Capture is not configured" });
        const site = await ownedSite(db, user.orgId, body.siteId);
        const files = await readCaptureFiles(body.file, body.files);
        if (files.length === 0) throw status(422, { error: "Attach a photo, a voice note, or a file" });
        try {
          return await captureDrafts(db, {
            orgId: user.orgId,
            userId: user.id,
            siteId: site.id,
            siteType: site.siteType,
            templateId: body.templateId,
            language: body.language === "sw" ? "sw" : "en",
            files,
            generate,
          });
        } catch (error) {
          throw status(422, { error: error instanceof Error ? error.message : "Capture failed" });
        }
      },
      {
        body: t.Object({
          siteId: t.String(),
          templateId: t.Optional(t.String()),
          language: t.Optional(t.String()),
          file: t.Optional(t.File()),
          files: t.Optional(t.Files()),
        }),
      },
    )
    .post(
      "/form-records/:id/confirm",
      async ({ auth, params, body }) => {
        const user = requireOrg(auth);
        assertWriter(user);
        const record = await ownedRecord(db, user.orgId, params.id);
        if (record.status !== "draft" && record.status !== "rejected") {
          throw status(409, { error: "Confirm is for a draft" });
        }
        const parent = await libraryTemplate(db, record.templateId);
        const variant = await orgVariant(db, user.orgId, parent.id);
        const definition = merged(parent, variant);
        let header = record.header;
        if (body.header) {
          const checked = validateHeader(definition, body.header);
          if (!checked.ok) throw status(422, { error: "Header is not valid", issues: checked.issues });
          header = checked.data;
          await db
            .update(formRecords)
            .set({
              header,
              headerExtraction: clearChanged(record.header, header, record.headerExtraction),
            })
            .where(eq(formRecords.id, record.id));
        }
        if (body.entries) {
          for (const edit of body.entries) {
            const [entry] = await db
              .select()
              .from(formRecordEntries)
              .where(and(eq(formRecordEntries.id, edit.id), eq(formRecordEntries.recordId, record.id)));
            if (!entry) continue;
            const checked = validateEntry(definition, edit.data);
            if (!checked.ok) throw status(422, { error: "A row is not valid", issues: checked.issues });
            await db
              .update(formRecordEntries)
              .set({
                data: checked.data,
                extraction: clearChanged(entry.data, checked.data, entry.extraction),
                updatedAt: new Date(),
              })
              .where(eq(formRecordEntries.id, entry.id));
          }
        }
        const fresh = await ownedRecord(db, user.orgId, record.id);
        return submitRecord(db, user, fresh, parent, definition, header);
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({
          header: t.Optional(t.Record(t.String(), t.Any())),
          entries: t.Optional(
            t.Array(t.Object({ id: t.String(), data: t.Record(t.String(), t.Any()) })),
          ),
        }),
      },
    )
    .delete("/form-records/:id", async ({ auth, params }) => {
      const user = requireOrg(auth);
      assertWriter(user);
      const record = await ownedRecord(db, user.orgId, params.id);
      if (record.status !== "draft") throw status(409, { error: "Only a draft can be discarded" });
      await db.delete(formRecords).where(eq(formRecords.id, record.id));
      return { ok: true, sourceDocumentId: record.sourceDocumentId };
    })
    .get("/documents/:id/file", async ({ auth, params }) => {
      const user = requireOrg(auth);
      const [document] = await db
        .select()
        .from(companyDocuments)
        .where(and(eq(companyDocuments.id, params.id), eq(companyDocuments.organizationId, user.orgId)));
      if (!document) throw status(404, { error: "Document not found" });
      const bytes = await readOrgFile(document.storageKey);
      return new Response(bytes, {
        headers: {
          "Content-Type": document.mimeType,
          "Content-Disposition": `inline; filename="${document.filename.replace(/"/g, "")}"`,
        },
      });
    })
    .get("/form-records/:id/pdf", async ({ auth, params }) => {
      const user = requireOrg(auth);
      const record = await ownedRecord(db, user.orgId, params.id);
      const parent = await libraryTemplate(db, record.templateId);
      const variant = await orgVariant(db, user.orgId, parent.id);
      const [org] = await db.select().from(organizations).where(eq(organizations.id, user.orgId));
      const site = await ownedSite(db, user.orgId, record.siteId);
      const entries = await db
        .select()
        .from(formRecordEntries)
        .where(eq(formRecordEntries.recordId, record.id))
        .orderBy(asc(formRecordEntries.recordedAt));
      const bytes = await renderRecordPdf({
        company: org?.name ?? "",
        site: site.name,
        location: site.location,
        docRef: variant?.docRef ?? parent.docRef ?? parent.sourceRef,
        title: parent.title,
        definition: merged(parent, variant),
        header: record.header,
        entries,
      });
      const filename = pdfFilename(parent.title);
      return new Response(bytes, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    })
    .get("/form-records/:id", async ({ auth, params }) => {
      const user = requireOrg(auth);
      const record = await ownedRecord(db, user.orgId, params.id);
      const parent = await libraryTemplate(db, record.templateId);
      const variant = await orgVariant(db, user.orgId, parent.id);
      const entries = await db
        .select()
        .from(formRecordEntries)
        .where(eq(formRecordEntries.recordId, record.id))
        .orderBy(asc(formRecordEntries.recordedAt));
      const [row] = record.evidenceId
        ? await db.select().from(evidence).where(eq(evidence.id, record.evidenceId))
        : [];
      return {
        ...presentRecord(record, parent, row),
        title: parent.title,
        cadence: parent.cadence,
        category: parent.category,
        definition: merged(parent, variant),
        headerDefaults: variant?.overrides?.headerDefaults ?? {},
        entries,
      };
    })
    .patch(
      "/form-records/:id",
      async ({ auth, params, body }) => {
        const user = requireOrg(auth);
        assertWriter(user);
        const record = await ownedRecord(db, user.orgId, params.id);
        if (record.status === "verified") throw status(409, { error: "A verified record is locked" });
        const contentEdit =
          body.header !== undefined || body.periodStart !== undefined || body.periodEnd !== undefined;
        if (record.status === "submitted" && (contentEdit || !body.status || body.status === "draft" || body.status === "submitted")) {
          throw status(409, { error: "A submitted record can only be verified or sent back" });
        }
        if (body.status === "verified" || body.status === "rejected") assertVerifier(user);
        if (body.status === "verified" && record.status !== "submitted") {
          throw status(409, { error: "Submit the record before verifying it" });
        }

        const parent = await libraryTemplate(db, record.templateId);
        const variant = await orgVariant(db, user.orgId, parent.id);
        const definition = merged(parent, variant);

        let header = record.header;
        let headerExtraction = record.headerExtraction;
        if (body.header) {
          const checked = validateHeader(definition, body.header);
          if (!checked.ok) throw status(422, { error: "Header is not valid", issues: checked.issues });
          header = checked.data;
          headerExtraction = clearChanged(record.header, header, record.headerExtraction);
        }

        if (body.status === "submitted") {
          return submitRecord(db, user, record, parent, definition, header);
        }

        const [updated] = await db
          .update(formRecords)
          .set({
            header,
            headerExtraction,
            periodStart: body.periodStart === undefined ? record.periodStart : parseDate(body.periodStart),
            periodEnd: body.periodEnd === undefined ? record.periodEnd : parseDate(body.periodEnd),
            status: body.status ?? record.status,
            verifiedBy: body.status === "verified" ? user.id : record.verifiedBy,
            verifiedAt: body.status === "verified" ? new Date() : record.verifiedAt,
            rejectionReason: body.rejectionReason ?? record.rejectionReason,
            updatedAt: new Date(),
          })
          .where(eq(formRecords.id, record.id))
          .returning();

        if (body.status === "verified" && updated?.evidenceId) {
          await db
            .update(evidence)
            .set({ verificationStatus: "verified", updatedAt: new Date() })
            .where(eq(evidence.id, updated.evidenceId));
        }
        if (body.status === "rejected" && updated?.evidenceId) {
          await db
            .update(evidence)
            .set({ verificationStatus: "rejected", updatedAt: new Date() })
            .where(eq(evidence.id, updated.evidenceId));
        }
        return presentRecord(updated!, parent, undefined);
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({
          header: t.Optional(t.Record(t.String(), t.Any())),
          periodStart: t.Optional(t.Union([t.String(), t.Null()])),
          periodEnd: t.Optional(t.Union([t.String(), t.Null()])),
          status: t.Optional(
            t.Union([
              t.Literal("draft"),
              t.Literal("submitted"),
              t.Literal("verified"),
              t.Literal("rejected"),
            ]),
          ),
          rejectionReason: t.Optional(t.String()),
        }),
      },
    )
    .post(
      "/form-records/:id/entries",
      async ({ auth, params, body }) => {
        const user = requireOrg(auth);
        assertWriter(user);
        const record = await ownedRecord(db, user.orgId, params.id);
        assertEditable(record.status);
        const parent = await libraryTemplate(db, record.templateId);
        const variant = await orgVariant(db, user.orgId, parent.id);
        const checked = validateEntry(merged(parent, variant), body.data);
        if (!checked.ok) throw status(422, { error: "Entry is not valid", issues: checked.issues });
        const [entry] = await db
          .insert(formRecordEntries)
          .values({
            recordId: record.id,
            recordedAt: body.recordedAt ? new Date(body.recordedAt) : new Date(),
            data: checked.data,
            enteredBy: user.id,
          })
          .returning();
        return entry;
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({
          data: t.Record(t.String(), t.Any()),
          recordedAt: t.Optional(t.String()),
        }),
      },
    )
    .patch(
      "/form-records/:id/entries/:entryId",
      async ({ auth, params, body }) => {
        const user = requireOrg(auth);
        assertWriter(user);
        const record = await ownedRecord(db, user.orgId, params.id);
        assertEditable(record.status);
        const [entry] = await db
          .select()
          .from(formRecordEntries)
          .where(and(eq(formRecordEntries.id, params.entryId), eq(formRecordEntries.recordId, record.id)));
        if (!entry) throw status(404, { error: "Entry not found" });
        const parent = await libraryTemplate(db, record.templateId);
        const variant = await orgVariant(db, user.orgId, parent.id);
        const checked = validateEntry(merged(parent, variant), body.data);
        if (!checked.ok) throw status(422, { error: "Entry is not valid", issues: checked.issues });
        const [updated] = await db
          .update(formRecordEntries)
          .set({
            data: checked.data,
            recordedAt: body.recordedAt ? new Date(body.recordedAt) : entry.recordedAt,
            extraction: clearChanged(entry.data, checked.data, entry.extraction),
            updatedAt: new Date(),
          })
          .where(eq(formRecordEntries.id, entry.id))
          .returning();
        return updated;
      },
      {
        params: t.Object({ id: t.String(), entryId: t.String() }),
        body: t.Object({
          data: t.Record(t.String(), t.Any()),
          recordedAt: t.Optional(t.String()),
        }),
      },
    )
    .delete("/form-records/:id/entries/:entryId", async ({ auth, params }) => {
      const user = requireOrg(auth);
      assertWriter(user);
      const record = await ownedRecord(db, user.orgId, params.id);
      assertEditable(record.status);
      const deleted = await db
        .delete(formRecordEntries)
        .where(and(eq(formRecordEntries.id, params.entryId), eq(formRecordEntries.recordId, record.id)))
        .returning();
      if (deleted.length === 0) throw status(404, { error: "Entry not found" });
      return { ok: true };
    });
}

async function readCaptureFiles(file?: File, files?: File[]): Promise<CaptureFile[]> {
  const incoming = [file, ...(files ?? [])].filter((item): item is File => item instanceof File);
  const out: CaptureFile[] = [];
  for (const item of incoming) {
    const mime = normaliseMime(item.type, item.name);
    if (!mime) throw status(422, { error: `${item.name} is not a supported capture file` });
    const bytes = new Uint8Array(await item.arrayBuffer());
    if (bytes.byteLength > maxBytesFor(mime)) {
      throw status(422, { error: `${item.name} is larger than the capture limit` });
    }
    out.push({ name: item.name, mime, bytes });
  }
  return out;
}

function assertWriter(user: OrgUser): void {
  if (user.role === "viewer") throw status(403, { error: "Viewers cannot change records" });
}

function assertVerifier(user: OrgUser): void {
  if (user.role !== "owner" && user.role !== "compliance_manager") {
    throw status(403, { error: "Only an owner or compliance manager can verify a record" });
  }
}

function assertEditable(recordStatus: string): void {
  if (recordStatus === "verified") throw status(409, { error: "A verified record is locked" });
  if (recordStatus === "submitted") throw status(409, { error: "Submit again only after the record is sent back" });
}

function rejectColumns(body: Record<string, unknown>): void {
  if (COLUMN_KEYS.some((key) => body[key] !== undefined)) {
    throw status(422, { error: "A variant cannot change columns" });
  }
}

function overridesFrom(body: {
  headerDefaults?: Record<string, unknown>;
  optionLists?: Record<string, string[]>;
  fixedItems?: FormVariantOverrides["fixedItems"];
  body?: Record<string, string>;
}): FormVariantOverrides {
  return {
    ...(body.headerDefaults ? { headerDefaults: body.headerDefaults } : {}),
    ...(body.optionLists ? { optionLists: body.optionLists } : {}),
    ...(body.fixedItems ? { fixedItems: body.fixedItems } : {}),
    ...(body.body ? { body: body.body } : {}),
  };
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw status(422, { error: "Use an ISO date" });
  return date;
}

async function ownedSite(db: Database, orgId: string, siteId: string) {
  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.organizationId, orgId)));
  if (!site) throw status(404, { error: "Site not found" });
  return site;
}

async function libraryTemplate(db: Database, id: string) {
  const [template] = await db
    .select()
    .from(formTemplates)
    .where(and(eq(formTemplates.id, id), isNull(formTemplates.organizationId)));
  if (!template?.definition) throw status(404, { error: "Template not found" });
  return template;
}

async function orgVariant(db: Database, orgId: string, parentId: string) {
  const [variant] = await db
    .select()
    .from(formTemplates)
    .where(and(eq(formTemplates.organizationId, orgId), eq(formTemplates.parentTemplateId, parentId)));
  return variant ?? null;
}

async function ownedRecord(db: Database, orgId: string, id: string) {
  const [record] = await db
    .select()
    .from(formRecords)
    .where(and(eq(formRecords.id, id), eq(formRecords.organizationId, orgId)));
  if (!record) throw status(404, { error: "Record not found" });
  return record;
}

function merged(
  parent: { definition: FormDefinition | null },
  variant: { overrides: FormVariantOverrides | null } | null,
): FormDefinition {
  return mergeDefinition(parent.definition!, variant?.overrides ?? null);
}

async function templatesFor(db: Database, orgId: string, siteType: string) {
  const library = await db.select().from(formTemplates).where(isNull(formTemplates.organizationId));
  const variants = await db.select().from(formTemplates).where(eq(formTemplates.organizationId, orgId));
  const variantByParent = new Map(
    variants.filter((row) => row.parentTemplateId).map((row) => [row.parentTemplateId!, row]),
  );
  const templates = library
    .filter((template) => template.siteTypes.includes(siteType))
    .map((template) => presentTemplate(template, variantByParent.get(template.id) ?? null));
  return { templates };
}

function presentTemplate(
  template: typeof formTemplates.$inferSelect,
  variant: typeof formTemplates.$inferSelect | null,
  fresh?: { expiresAt: Date | null; submittedAt: Date | null },
) {
  const definition = template.definition
    ? mergeDefinition(template.definition, variant?.overrides ?? null)
    : null;
  return {
    id: template.id,
    slug: template.slug,
    title: template.title,
    description: template.description,
    category: template.category,
    siteTypes: template.siteTypes,
    cadence: template.cadence,
    version: template.version,
    sourceRef: template.sourceRef,
    evidenceTypeId: template.evidenceTypeId,
    docRef: variant?.docRef ?? template.docRef,
    approverRole: variant?.approverRole ?? template.approverRole,
    effectiveDate: variant?.effectiveDate ?? template.effectiveDate,
    definition,
    headerDefaults: variant?.overrides?.headerDefaults ?? {},
    variantId: variant?.id ?? null,
    badge: fresh ? badgeFor(template.cadence as FormCadence, fresh) : undefined,
  };
}

/** How close to expiry a record counts as due, scaled to the cadence. A flat week made every fresh daily record look due. */
function dueSoonMs(cadence: FormCadence): number {
  const days =
    cadence === "daily" ? 1 : cadence === "weekly" ? 2 : cadence === "monthly" ? 7 : cadence === "quarterly" ? 14 : 30;
  return days * 24 * 60 * 60 * 1000;
}

function listBadge(
  record: { status: string; submittedAt: Date | null },
  template: { cadence: string } | undefined,
  filed: { expiresAt: Date | null } | undefined,
): "draft" | "overdue" | "due" | "current" | "none" {
  if (record.status !== "submitted" && record.status !== "verified") return "draft";
  return badgeFor((template?.cadence ?? "per_event") as FormCadence, {
    expiresAt: filed?.expiresAt ?? null,
    submittedAt: record.submittedAt,
  });
}

export function badgeFor(
  cadence: FormCadence,
  fresh: { expiresAt: Date | null; submittedAt: Date | null },
): "overdue" | "due" | "current" | "none" {
  if (!fresh.submittedAt) return cadence === "per_event" ? "none" : "overdue";
  if (!fresh.expiresAt) return "current";
  const remaining = fresh.expiresAt.getTime() - Date.now();
  if (remaining < 0) return "overdue";
  if (remaining < dueSoonMs(cadence)) return "due";
  return "current";
}

export async function latestEvidence(db: Database, orgId: string, siteId: string) {
  await ownedSite(db, orgId, siteId);
  const rows = await db
    .select({
      templateId: formRecords.templateId,
      submittedAt: formRecords.submittedAt,
      expiresAt: evidence.expiresAt,
      verificationStatus: evidence.verificationStatus,
    })
    .from(formRecords)
    .leftJoin(evidence, eq(evidence.id, formRecords.evidenceId))
    .where(
      and(
        eq(formRecords.organizationId, orgId),
        eq(formRecords.siteId, siteId),
        inArray(formRecords.status, ["submitted", "verified"]),
      ),
    );
  const map = new Map<string, { expiresAt: Date | null; submittedAt: Date | null }>();
  for (const row of rows) {
    if (row.verificationStatus === "rejected") continue;
    const current = map.get(row.templateId);
    const at = row.submittedAt?.getTime() ?? 0;
    if (!current || at >= (current.submittedAt?.getTime() ?? 0)) {
      map.set(row.templateId, { expiresAt: row.expiresAt, submittedAt: row.submittedAt });
    }
  }
  return map;
}

function presentRecord(
  record: typeof formRecords.$inferSelect,
  template: { cadence: string } | undefined,
  row: { expiresAt: Date | null; id: string } | undefined,
) {
  const cadence = (template?.cadence ?? "per_event") as FormCadence;
  const counts =
    record.status === "submitted" || record.status === "verified"
      ? badgeFor(cadence, { expiresAt: row?.expiresAt ?? null, submittedAt: record.submittedAt })
      : "none";
  return {
    ...record,
    freshness: counts === "overdue" ? "stale" : counts === "current" || counts === "due" ? "current" : "draft",
  };
}

async function evidenceFor(db: Database, ids: Array<string | null>) {
  const present = ids.filter((id): id is string => Boolean(id));
  if (present.length === 0) return new Map<string, typeof evidence.$inferSelect>();
  const rows = await db.select().from(evidence).where(inArray(evidence.id, present));
  return new Map(rows.map((row) => [row.id, row]));
}

async function templatesById(db: Database, ids: string[]) {
  if (ids.length === 0) return new Map<string, typeof formTemplates.$inferSelect>();
  const rows = await db.select().from(formTemplates).where(inArray(formTemplates.id, ids));
  return new Map(rows.map((row) => [row.id, row]));
}

function clearChanged(
  before: FormValues,
  after: FormValues,
  extraction: Record<string, { confidence: number; source?: string }> | null,
) {
  if (!extraction) return extraction;
  const next = { ...extraction };
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) delete next[key];
  }
  return Object.keys(next).length ? next : null;
}

async function submitRecord(
  db: Database,
  user: OrgUser,
  record: typeof formRecords.$inferSelect,
  parent: typeof formTemplates.$inferSelect,
  definition: FormDefinition,
  header: FormValues,
) {
  if (record.status === "submitted" || record.status === "verified") {
    throw status(409, { error: "This record is already submitted" });
  }
  const checkedHeader = validateHeader(definition, header);
  if (!checkedHeader.ok) {
    throw status(422, { error: "Header is not valid", issues: checkedHeader.issues });
  }
  const entries = await db
    .select()
    .from(formRecordEntries)
    .where(eq(formRecordEntries.recordId, record.id));
  if (entries.length === 0) throw status(422, { error: "Add at least one row before submitting" });
  for (const entry of entries) {
    const checked = validateEntry(definition, entry.data);
    if (!checked.ok) throw status(422, { error: "A row is not valid", issues: checked.issues });
  }
  if (!parent.evidenceTypeId) throw status(422, { error: "This template does not produce evidence" });

  const latest = entries.reduce(
    (max, entry) => (entry.recordedAt > max ? entry.recordedAt : max),
    entries[0]!.recordedAt,
  );
  const expiresAt = cadenceExpiry(parent.cadence as FormCadence, latest);

  const [saved] = await db
    .update(formRecords)
    .set({
      header: checkedHeader.data,
      status: "submitted",
      submittedBy: user.id,
      submittedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(formRecords.id, record.id))
    .returning();

  const evidenceValues = {
    organizationId: user.orgId,
    siteId: record.siteId,
    evidenceTypeId: parent.evidenceTypeId,
    formRecordId: record.id,
    ownerId: user.id,
    validFrom: latest,
    expiresAt,
    verificationStatus: "unverified" as const,
    source: "form" as const,
    updatedAt: new Date(),
  };

  let evidenceId = record.evidenceId;
  if (evidenceId) {
    await db.update(evidence).set(evidenceValues).where(eq(evidence.id, evidenceId));
  } else {
    const [created] = await db.insert(evidence).values(evidenceValues).returning();
    evidenceId = created!.id;
    await db.update(formRecords).set({ evidenceId }).where(eq(formRecords.id, record.id));
  }
  await attachEvidenceLinks(db, evidenceId, parent.evidenceTypeId);
  if (parent.category === "finding") {
    const description = String(
      checkedHeader.data.description ?? checkedHeader.data.what ?? checkedHeader.data.complaint ?? parent.title,
    );
    await db.insert(findings).values({
      organizationId: user.orgId,
      siteId: record.siteId,
      description,
      section: parent.title,
      severity: "minor",
      sourceFormRecordId: record.id,
    });
  }

  const [type] = await db.select().from(evidenceTypes).where(eq(evidenceTypes.id, parent.evidenceTypeId));
  return {
    ...presentRecord({ ...saved!, evidenceId }, parent, { id: evidenceId, expiresAt }),
    evidence: { id: evidenceId, evidenceType: type?.slug ?? null, validFrom: latest, expiresAt },
  };
}
