/**
 * Photo, voice or file → draft record. Nothing here writes `evidence`.
 * Confirm (in the forms routes) is what submits.
 */

import {
  agentRuns,
  agentToolCalls,
  companyDocuments,
  conversations,
  formRecordEntries,
  formRecords,
  formTemplates,
  type Database,
} from "@complifine/db";
import { and, eq, isNull } from "@complifine/db";
import { z } from "zod";
import {
  classifyTemplate,
  extractDraft,
  normaliseCapture,
  transcribeAudio,
  type CaptureGenerator,
} from "@complifine/ai";
import type { FormDefinition } from "@complifine/core";
import { isAudio, normaliseMime, readOrgFile, storeOrgFile } from "./org-storage.ts";

export interface CaptureFile {
  readonly name: string;
  readonly mime: string;
  readonly bytes: Uint8Array;
}

export async function captureDrafts(
  db: Database,
  input: {
    readonly orgId: string;
    readonly userId: string;
    readonly siteId: string;
    readonly siteType: string;
    readonly templateId?: string;
    readonly language: "en" | "sw";
    readonly files: readonly CaptureFile[];
    readonly generate: CaptureGenerator;
  },
) {
  const stored = [];
  for (const file of input.files) {
    const mime = normaliseMime(file.mime, file.name);
    if (!mime) throw new Error(`Unsupported file type for ${file.name}`);
    const saved = await storeOrgFile(input.orgId, "captures", mime, file.bytes);
    const [document] = await db
      .insert(companyDocuments)
      .values({
        organizationId: input.orgId,
        siteId: input.siteId,
        uploadedBy: input.userId,
        purpose: "capture_source",
        filename: file.name,
        mimeType: mime,
        byteSize: file.bytes.byteLength,
        fileHash: saved.hash,
        storageKey: saved.key,
      })
      .returning();
    stored.push({ document: document!, mime, bytes: file.bytes, name: file.name });
  }

  const parts = [];
  for (const file of stored) {
    if (isAudio(file.mime)) {
      const text = await transcribeAudio(file.bytes, input.language);
      parts.push({ text });
    } else {
      parts.push(await normaliseCapture(file.mime, file.bytes, file.name));
    }
  }
  const text = parts
    .map((part) => part.text)
    .filter(Boolean)
    .join("\n\n");
  const images = parts.flatMap((part) => part.images ?? []);
  const normalised = { ...(text ? { text } : {}), ...(images.length ? { images } : {}) };

  const library = await db.select().from(formTemplates).where(isNull(formTemplates.organizationId));
  const applicable = library.filter(
    (template) => template.definition && template.siteTypes.includes(input.siteType),
  );

  const targets = input.templateId
    ? applicable.filter((template) => template.id === input.templateId)
    : await pickTemplates(applicable, text, input.generate);
  if (targets.length === 0) throw new Error("No template matches this capture");

  const [conversation] = await db
    .insert(conversations)
    .values({
      userId: input.userId,
      organizationId: input.orgId,
      siteId: input.siteId,
      title: "Record capture",
    })
    .returning();
  const [run] = await db
    .insert(agentRuns)
    .values({
      conversationId: conversation!.id,
      userId: input.userId,
      organizationId: input.orgId,
      siteId: input.siteId,
      model: "capture",
      question: stored.map((file) => file.name).join(", "),
      startedAt: new Date(),
    })
    .returning();

  const drafts = [];
  for (const template of targets) {
    const extracted = await extractDraft(template.definition as FormDefinition, normalised, input.generate);
    const [record] = await db
      .insert(formRecords)
      .values({
        organizationId: input.orgId,
        siteId: input.siteId,
        templateId: template.id,
        templateVersion: template.version,
        status: "draft",
        origin: "capture",
        header: extracted.header,
        headerExtraction: extracted.headerExtraction,
        createdBy: input.userId,
        sourceDocumentId: stored[0]?.document.id ?? null,
        captureRunId: run!.id,
      })
      .returning();
    for (const entry of extracted.entries) {
      const recordedAt =
        typeof entry.data.date === "string" ? new Date(`${entry.data.date}T00:00:00.000Z`) : new Date();
      await db.insert(formRecordEntries).values({
        recordId: record!.id,
        recordedAt: Number.isNaN(recordedAt.getTime()) ? new Date() : recordedAt,
        data: entry.data,
        extraction: entry.extraction,
        enteredBy: input.userId,
      });
    }
    drafts.push({
      id: record!.id,
      templateId: template.id,
      templateSlug: template.slug,
      title: template.title,
      header: extracted.header,
      headerExtraction: extracted.headerExtraction,
      entries: extracted.entries,
    });
  }

  await db.insert(agentToolCalls).values({
    agentRunId: run!.id,
    stepIndex: 0,
    toolName: "capture",
    arguments: { documentIds: stored.map((file) => file.document.id) },
    result: { recordIds: drafts.map((draft) => draft.id) },
  });
  await db
    .update(agentRuns)
    .set({ answer: drafts.map((draft) => draft.id).join(", "), finishedAt: new Date() })
    .where(eq(agentRuns.id, run!.id));

  return { drafts, sourceDocumentId: stored[0]?.document.id ?? null };
}

async function pickTemplates<T extends { id: string; slug: string; title: string; definition: unknown }>(
  templates: readonly T[],
  text: string,
  generate: CaptureGenerator,
): Promise<T[]> {
  const classifiable = templates.map((template) => ({
    id: template.id,
    slug: template.slug,
    title: template.title,
    labels: labelsOf(template.definition),
  }));
  const chosen = await classifyTemplate(text, classifiable, async (candidates) => {
    const picked = await generate({
      instructions: "Pick the template slug that this source fills. Reply with that slug only, as the value of slug.",
      schema: z.object({ slug: z.string() }),
      text: `${text}\n\nTemplates:\n${candidates.map((item) => `${item.slug}: ${item.title}`).join("\n")}`,
    });
    const slug = picked && typeof picked === "object" && "slug" in picked ? String(picked.slug) : "";
    return slug;
  });
  if (!chosen) return [];
  const match = templates.find((template) => template.id === chosen.id);
  return match ? [match] : [];
}

function labelsOf(definition: unknown): string[] {
  if (!definition || typeof definition !== "object") return [];
  const fields = (definition as { entryFields?: Array<{ label?: string }>; headerFields?: Array<{ label?: string }> });
  return [...(fields.headerFields ?? []), ...(fields.entryFields ?? [])].map((field) => field.label ?? "");
}

export async function readCaptureSource(db: Database, orgId: string, documentId: string) {
  const [document] = await db
    .select()
    .from(companyDocuments)
    .where(and(eq(companyDocuments.id, documentId), eq(companyDocuments.organizationId, orgId)));
  if (!document) return null;
  const bytes = await readOrgFile(document.storageKey);
  return { document, bytes };
}
