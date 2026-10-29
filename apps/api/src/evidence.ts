/**
 * Uploaded evidence and the gap list.
 *
 * A file becomes evidence only when someone files it against an evidence type.
 * Form records do that on submit; this module is the path for lab reports,
 * certificates and photos that no register produces.
 */

import { Elysia, status, t } from "elysia";
import { and, desc, eq, type Database } from "@complifine/db";
import { evidence, evidenceTypes, sites, standardVersions } from "@complifine/db";
import { evidenceGap, textFromBytes } from "@complifine/ai";
import { readAuth, requireOrg, type AuthUser } from "./auth/plugin.ts";
import { publishedOnly, assertPublishedVersion } from "./knowledge-access.ts";
import { attachEvidenceLinks } from "./evidence-links.ts";
import { companyDocuments } from "@complifine/db";
import { maxBytesFor, normaliseMime, storeOrgFile } from "./org-storage.ts";

export function evidenceRoutes(db: Database) {
  return new Elysia({ name: "complifine-evidence" })
    .derive((ctx): { auth: AuthUser | null } => ({ auth: readAuth(ctx) }))
    .post(
      "/documents",
      async ({ auth, body }) => {
        const user = requireOrg(auth);
        if (user.role === "viewer") throw status(403, { error: "Viewers cannot upload" });
        if (body.siteId) await ownedSite(db, user.orgId, body.siteId);
        const mime = normaliseMime(body.file.type, body.file.name);
        if (!mime || mime.startsWith("audio/")) throw status(422, { error: "Upload a PDF, image, spreadsheet or CSV" });
        const bytes = new Uint8Array(await body.file.arrayBuffer());
        if (bytes.byteLength > maxBytesFor(mime)) throw status(422, { error: "File is larger than 10 MB" });
        const stored = await storeOrgFile(user.orgId, "evidence", mime, bytes);
        const extracted = await extractQuietly(mime, bytes, body.file.name);
        const [document] = await db
          .insert(companyDocuments)
          .values({
            organizationId: user.orgId,
            siteId: body.siteId ?? null,
            uploadedBy: user.id,
            purpose: "evidence",
            filename: body.file.name,
            mimeType: mime,
            byteSize: bytes.byteLength,
            fileHash: stored.hash,
            storageKey: stored.key,
            extractedText: extracted,
            extractedAt: extracted ? new Date() : null,
          })
          .returning();
        return document;
      },
      {
        body: t.Object({
          file: t.File(),
          siteId: t.Optional(t.String()),
        }),
      },
    )
    .get(
      "/evidence",
      async ({ auth, query }) => {
        const user = requireOrg(auth);
        if (query.siteId) await ownedSite(db, user.orgId, query.siteId);
        const rows = await db
          .select({
            id: evidence.id,
            siteId: evidence.siteId,
            evidenceTypeId: evidence.evidenceTypeId,
            evidenceType: evidenceTypes.slug,
            title: evidenceTypes.title,
            documentId: evidence.documentId,
            formRecordId: evidence.formRecordId,
            validFrom: evidence.validFrom,
            expiresAt: evidence.expiresAt,
            verificationStatus: evidence.verificationStatus,
            source: evidence.source,
            notes: evidence.notes,
          })
          .from(evidence)
          .innerJoin(evidenceTypes, eq(evidenceTypes.id, evidence.evidenceTypeId))
          .where(
            and(
              eq(evidence.organizationId, user.orgId),
              query.siteId ? eq(evidence.siteId, query.siteId) : undefined,
            ),
          )
          .orderBy(desc(evidence.createdAt));
        return { evidence: rows };
      },
      { query: t.Object({ siteId: t.Optional(t.String()) }) },
    )
    .post(
      "/evidence",
      async ({ auth, body }) => {
        const user = requireOrg(auth);
        if (user.role === "viewer") throw status(403, { error: "Viewers cannot file evidence" });
        const site = await ownedSite(db, user.orgId, body.siteId);
        const [type] = await db.select().from(evidenceTypes).where(eq(evidenceTypes.id, body.evidenceTypeId));
        if (!type) throw status(404, { error: "Evidence type not found" });
        if (body.documentId) {
          const [document] = await db
            .select()
            .from(companyDocuments)
            .where(and(eq(companyDocuments.id, body.documentId), eq(companyDocuments.organizationId, user.orgId)));
          if (!document) throw status(404, { error: "Document not found" });
        }
        const [created] = await db
          .insert(evidence)
          .values({
            organizationId: user.orgId,
            siteId: site.id,
            evidenceTypeId: type.id,
            documentId: body.documentId ?? null,
            ownerId: user.id,
            validFrom: body.validFrom ? new Date(body.validFrom) : new Date(),
            expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
            source: body.documentId ? "upload" : "note",
            notes: body.notes ?? null,
          })
          .returning();
        await attachEvidenceLinks(db, created!.id, type.id);
        return created;
      },
      {
        body: t.Object({
          siteId: t.String(),
          evidenceTypeId: t.String(),
          documentId: t.Optional(t.String()),
          validFrom: t.Optional(t.String()),
          expiresAt: t.Optional(t.String()),
          notes: t.Optional(t.String()),
        }),
      },
    )
    .patch(
      "/evidence/:id",
      async ({ auth, params, body }) => {
        const user = requireOrg(auth);
        if (user.role === "viewer") throw status(403, { error: "Viewers cannot change evidence" });
        if (body.verificationStatus === "verified" && user.role !== "owner" && user.role !== "compliance_manager") {
          throw status(403, { error: "Only an owner or compliance manager can verify evidence" });
        }
        const [row] = await db
          .select()
          .from(evidence)
          .where(and(eq(evidence.id, params.id), eq(evidence.organizationId, user.orgId)));
        if (!row) throw status(404, { error: "Evidence not found" });
        const [updated] = await db
          .update(evidence)
          .set({
            validFrom: body.validFrom === undefined ? row.validFrom : body.validFrom ? new Date(body.validFrom) : null,
            expiresAt: body.expiresAt === undefined ? row.expiresAt : body.expiresAt ? new Date(body.expiresAt) : null,
            notes: body.notes === undefined ? row.notes : body.notes,
            verificationStatus: body.verificationStatus ?? row.verificationStatus,
            updatedAt: new Date(),
          })
          .where(eq(evidence.id, row.id))
          .returning();
        return updated;
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({
          validFrom: t.Optional(t.Union([t.String(), t.Null()])),
          expiresAt: t.Optional(t.Union([t.String(), t.Null()])),
          notes: t.Optional(t.Union([t.String(), t.Null()])),
          verificationStatus: t.Optional(
            t.Union([t.Literal("unverified"), t.Literal("verified"), t.Literal("rejected")]),
          ),
        }),
      },
    )
    .get(
      "/sites/:id/evidence-gap",
      async ({ auth, params, query }) => {
        const user = requireOrg(auth);
        const site = await ownedSite(db, user.orgId, params.id);
        const version = assertPublishedVersion(
          (await db.select().from(standardVersions).where(eq(standardVersions.code, query.versionCode)))[0],
          !publishedOnly(user),
          query.versionCode,
        );
        const gap = await evidenceGap(db, { siteId: site.id, siteType: site.siteType, versionId: version.id });
        return { versionCode: version.code, ...gap };
      },
      {
        params: t.Object({ id: t.String() }),
        query: t.Object({ versionCode: t.String() }),
      },
    );
}

async function extractQuietly(mime: string, bytes: Uint8Array, filename: string): Promise<string | null> {
  try {
    const text = (await textFromBytes(mime, bytes, filename)).trim();
    return text || null;
  } catch {
    return null;
  }
}

async function ownedSite(db: Database, orgId: string, siteId: string) {
  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.organizationId, orgId)));
  if (!site) throw status(404, { error: "Site not found" });
  return site;
}
