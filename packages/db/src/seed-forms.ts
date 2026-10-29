/**
 * Seeds the library form templates and checks that forms, evidence types,
 * controls and requirements still join up.
 *
 * Templates are upserted by slug. A changed definition bumps `version`, so
 * records keep the version they were filled against.
 */

import { and, eq, isNull, like, or } from "drizzle-orm";
import type { Database } from "./client.ts";
import { evidenceTypes } from "./schema/controls.ts";
import { formTemplates } from "./schema/forms.ts";
import { requirementVersions } from "./schema/requirements.ts";
import { FORM_LIBRARY } from "./form-library.ts";
import { CONTROL_LIBRARY, controlIdentifiers } from "./seed-controls.ts";

/** Problems that would leave a form unable to count as evidence for anything. */
export function libraryProblems(): string[] {
  const problems: string[] = [];
  const linked = new Set(
    CONTROL_LIBRARY.flatMap((control) => [...control.evidence, ...(control.supporting ?? [])]),
  );
  const slugs = new Set<string>();
  for (const template of FORM_LIBRARY) {
    if (slugs.has(template.slug)) problems.push(`Duplicate template slug ${template.slug}`);
    slugs.add(template.slug);
    if (!linked.has(template.evidence)) {
      problems.push(`Template ${template.slug} produces ${template.evidence}, which no control expects`);
    }
  }
  return problems;
}

/** Identifiers a control names that do not exist in an ingested standard. */
async function unresolvedIdentifiers(db: Database): Promise<string[]> {
  const rows = await db
    .select({ id: requirementVersions.sourceRequirementId })
    .from(requirementVersions)
    .where(
      or(
        like(requirementVersions.sourceRequirementId, "FV-%"),
        like(requirementVersions.sourceRequirementId, "ETI %"),
      ),
    );
  const present = new Set(rows.map((row) => row.id));
  const ingested = {
    smart: rows.some((row) => row.id?.startsWith("FV-Smart ")),
    gfs: rows.some((row) => row.id?.startsWith("FV-GFS ")),
    eti: rows.some((row) => row.id?.startsWith("ETI ")),
  };

  const missing: string[] = [];
  for (const control of CONTROL_LIBRARY) {
    for (const identifier of controlIdentifiers(control)) {
      const family = identifier.startsWith("FV-Smart ")
        ? "smart"
        : identifier.startsWith("FV-GFS ")
          ? "gfs"
          : "eti";
      if (ingested[family] && !present.has(identifier)) {
        missing.push(`${control.slug}: ${identifier}`);
      }
    }
  }
  return missing;
}

/** JSON with sorted keys, so jsonb key reordering does not look like a change. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );
}

export async function seedForms(
  db: Database,
): Promise<{ templates: number; created: number; revised: number }> {
  const problems = [...libraryProblems(), ...(await unresolvedIdentifiers(db))];
  if (problems.length > 0) {
    throw new Error(`Form library does not join up:\n  ${problems.join("\n  ")}`);
  }

  const evidenceRows = await db.select().from(evidenceTypes);
  const evidenceBySlug = new Map(evidenceRows.map((row) => [row.slug, row.id]));

  let created = 0;
  let revised = 0;

  for (const template of FORM_LIBRARY) {
    const evidenceTypeId = evidenceBySlug.get(template.evidence);
    if (!evidenceTypeId) {
      throw new Error(`Template ${template.slug} names unknown evidence type ${template.evidence}`);
    }

    const values = {
      title: template.title,
      description: template.description,
      category: template.category,
      siteTypes: [...template.siteTypes],
      cadence: template.cadence,
      evidenceTypeId,
      sourceRef: template.sourceRef,
    };

    const [existing] = await db
      .select()
      .from(formTemplates)
      .where(and(eq(formTemplates.slug, template.slug), isNull(formTemplates.organizationId)))
      .limit(1);

    if (!existing) {
      await db
        .insert(formTemplates)
        .values({ ...values, slug: template.slug, definition: template.definition, version: 1 });
      created += 1;
      continue;
    }

    const changed = canonical(existing.definition) !== canonical(template.definition);
    await db
      .update(formTemplates)
      .set({
        ...values,
        definition: template.definition,
        version: changed ? existing.version + 1 : existing.version,
        updatedAt: new Date(),
      })
      .where(eq(formTemplates.id, existing.id));
    if (changed) revised += 1;
  }

  return { templates: FORM_LIBRARY.length, created, revised };
}
