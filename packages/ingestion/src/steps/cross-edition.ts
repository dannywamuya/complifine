/**
 * Step 5: link the Smart and GFS editions to each other.
 *
 * The publisher gives us no help here. The two checklist workbooks share zero
 * criterion GUIDs - verified across all 381 criteria - so "is FV-Smart 12.01
 * the same requirement as FV-GFS 12.01?" is a question we must answer
 * ourselves. The answer matters commercially: a Kenyan exporter deciding
 * between the editions, or migrating from one to the other, needs to know
 * exactly which of their controls get stricter.
 *
 * The correspondence is derived, so it is recorded as `deterministic_match`
 * rather than `source_declared`, with the text similarity that justified it
 * stored alongside. Nothing here pretends GLOBALG.A.P. asserted the link.
 *
 * What the data actually looks like, measured from the official workbooks:
 *   - every one of the 190 Smart criterion numbers also exists in GFS;
 *   - GFS adds exactly one criterion, FV-GFS 33.07.01;
 *   - 14 criteria are escalated from Minor Must to Major Must in GFS;
 *   - none is ever relaxed;
 *   - 187 of the 190 shared criteria have byte-identical principle text.
 */

import { eq, type Database } from "@complifine/db";
import { requirementRelationships, requirementVersions, standardVersions } from "@complifine/db";
import { diceCoefficient, parseCriterionNumber } from "@complifine/core";
import type { JobContext } from "../jobs.ts";

/** Ordered from most to least demanding, for detecting escalation direction. */
const LEVEL_SEVERITY: Record<string, number> = {
  major_must: 3,
  minor_must: 2,
  recommendation: 1,
};

export interface EditionDelta {
  readonly sourceRequirementId: string;
  readonly smartLevel: string;
  readonly gfsLevel: string;
  readonly levelChanged: boolean;
  readonly escalated: boolean;
  readonly textSimilarity: number;
  readonly textChanged: boolean;
}

export interface CrossEditionReport {
  readonly matched: number;
  readonly smartOnly: readonly string[];
  readonly gfsOnly: readonly string[];
  readonly escalations: readonly EditionDelta[];
  readonly relaxations: readonly EditionDelta[];
  readonly textChanges: readonly EditionDelta[];
  readonly identicalTexts: number;
  readonly relationshipsWritten: number;
}

/**
 * Text similarity below which two criteria sharing a number are treated as
 * materially reworded rather than identical.
 *
 * Set from the observed distribution: the three genuinely reworded pairs score
 * 0.849, 0.902 and 0.922, and every other pair scores 1.000. Any threshold in
 * that gap works; 0.98 sits comfortably inside it and leaves room for a future
 * revision to reword a criterion slightly without tripping the flag.
 */
const TEXT_IDENTITY_THRESHOLD = 0.98;

export async function linkEditions(
  db: Database,
  ctx: JobContext,
  options: { smartVersionCode: string; gfsVersionCode: string; write?: boolean } = {
    smartVersionCode: "ifa-v6-smart-fv",
    gfsVersionCode: "ifa-v6-gfs-fv",
  },
): Promise<CrossEditionReport> {
  const write = options.write ?? true;

  const smartVersion = await requireVersion(db, options.smartVersionCode);
  const gfsVersion = await requireVersion(db, options.gfsVersionCode);

  const smart = await loadRequirements(db, smartVersion.id);
  const gfs = await loadRequirements(db, gfsVersion.id);

  if (smart.length === 0 || gfs.length === 0) {
    throw new Error(
      "Both editions must be parsed before they can be linked. Run `bun run kb parse` first.",
    );
  }

  // Match on the edition-independent part of the criterion number: `01.01` in
  // both `FV-Smart 01.01` and `FV-GFS 01.01`. This is the publisher's own
  // correspondence - they deliberately kept the numbering aligned - and it is
  // far more reliable than matching on text, which would confuse the many
  // criteria that share boilerplate phrasing.
  const gfsByNumber = new Map<string, (typeof gfs)[number]>();
  for (const row of gfs) {
    const parsed = parseCriterionNumber(row.sourceRequirementId);
    if (parsed) gfsByNumber.set(numberKey(parsed), row);
  }

  const matchedGfsKeys = new Set<string>();
  const escalations: EditionDelta[] = [];
  const relaxations: EditionDelta[] = [];
  const textChanges: EditionDelta[] = [];
  const smartOnly: string[] = [];
  let identicalTexts = 0;
  let written = 0;
  let matched = 0;

  for (const smartRow of smart) {
    const parsed = parseCriterionNumber(smartRow.sourceRequirementId);
    const key = parsed ? numberKey(parsed) : null;
    const gfsRow = key ? gfsByNumber.get(key) : undefined;

    if (!gfsRow || !key) {
      smartOnly.push(smartRow.sourceRequirementId);
      continue;
    }

    matched++;
    matchedGfsKeys.add(key);

    const similarity = diceCoefficient(smartRow.principleText, gfsRow.principleText);
    const textChanged = similarity < TEXT_IDENTITY_THRESHOLD;
    if (!textChanged) identicalTexts++;

    const levelChanged = smartRow.level !== gfsRow.level;
    const escalated = (LEVEL_SEVERITY[gfsRow.level] ?? 0) > (LEVEL_SEVERITY[smartRow.level] ?? 0);

    const delta: EditionDelta = {
      sourceRequirementId: key,
      smartLevel: smartRow.level,
      gfsLevel: gfsRow.level,
      levelChanged,
      escalated,
      textSimilarity: Number(similarity.toFixed(4)),
      textChanged,
    };

    if (levelChanged) (escalated ? escalations : relaxations).push(delta);
    if (textChanged) textChanges.push(delta);

    if (write) {
      // `equivalent_to` rather than `unchanged`: these are parallel editions of
      // one standard, not successive versions of one requirement. Calling it
      // `unchanged` would imply a temporal relationship that does not exist.
      await upsertRelationship(db, {
        fromRequirementVersionId: smartRow.id,
        toRequirementVersionId: gfsRow.id,
        textSimilarity: similarity,
        levelChanged,
        notes: buildNote(delta),
      });
      written++;
    }
  }

  const gfsOnly = gfs
    .filter((row) => {
      const parsed = parseCriterionNumber(row.sourceRequirementId);
      return !parsed || !matchedGfsKeys.has(numberKey(parsed));
    })
    .map((row) => row.sourceRequirementId);

  const report: CrossEditionReport = {
    matched,
    smartOnly,
    gfsOnly,
    escalations,
    relaxations,
    textChanges,
    identicalTexts,
    relationshipsWritten: written,
  };

  ctx.count({
    matched,
    smartOnly: smartOnly.length,
    gfsOnly: gfsOnly.length,
    escalations: escalations.length,
    relaxations: relaxations.length,
    textChanges: textChanges.length,
    identicalTexts,
  });

  await ctx.info(
    `Linked editions: ${matched} matched, ${gfsOnly.length} GFS-only, ${smartOnly.length} Smart-only, ` +
      `${escalations.length} level escalations, ${textChanges.length} reworded`,
  );

  if (relaxations.length > 0) {
    // GFS is the GFSI-recognised edition and is expected to be at least as
    // strict as Smart everywhere. A relaxation would be genuinely surprising
    // and worth a human deciding about.
    await ctx.warn(
      `${relaxations.length} criteria are LESS strict in GFS than in Smart, which contradicts the expected relationship`,
      { examples: relaxations.slice(0, 5) },
    );
  }

  return report;
}

function buildNote(delta: EditionDelta): string {
  const parts: string[] = [];
  if (delta.levelChanged) {
    parts.push(
      `${delta.escalated ? "Escalated" : "Relaxed"} from ${delta.smartLevel} (Smart) to ${delta.gfsLevel} (GFS)`,
    );
  }
  if (delta.textChanged) {
    parts.push(`Principle text reworded (similarity ${delta.textSimilarity.toFixed(3)})`);
  }
  if (parts.length === 0) parts.push("Identical principle text and level");
  return parts.join(". ");
}

/** Strip the edition prefix so the two numbering schemes can be compared. */
function numberKey(parsed: NonNullable<ReturnType<typeof parseCriterionNumber>>): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return parsed.subsection === null
    ? `${pad(parsed.section)}.${pad(parsed.ordinal)}`
    : `${pad(parsed.section)}.${pad(parsed.subsection)}.${pad(parsed.ordinal)}`;
}

async function requireVersion(db: Database, code: string) {
  const [version] = await db
    .select()
    .from(standardVersions)
    .where(eq(standardVersions.code, code));
  if (!version) throw new Error(`Unknown standard version code: ${code}`);
  return version;
}

async function loadRequirements(db: Database, standardVersionId: string) {
  return db
    .select({
      id: requirementVersions.id,
      sourceRequirementId: requirementVersions.sourceRequirementId,
      principleText: requirementVersions.principleText,
      criteriaText: requirementVersions.criteriaText,
      level: requirementVersions.level,
    })
    .from(requirementVersions)
    .where(eq(requirementVersions.standardVersionId, standardVersionId))
    .orderBy(requirementVersions.sortKey);
}

async function upsertRelationship(
  db: Database,
  params: {
    fromRequirementVersionId: string;
    toRequirementVersionId: string;
    textSimilarity: number;
    levelChanged: boolean;
    notes: string;
  },
): Promise<void> {
  await db
    .insert(requirementRelationships)
    .values({
      fromRequirementVersionId: params.fromRequirementVersionId,
      toRequirementVersionId: params.toRequirementVersionId,
      relationshipType: "equivalent_to",
      origin: "deterministic_match",
      // Confidence is the text similarity itself: the match was made on
      // criterion number, and the similarity is the independent evidence that
      // the number correspondence is meaningful.
      confidence: params.textSimilarity,
      textSimilarity: params.textSimilarity,
      levelChanged: params.levelChanged,
      notes: params.notes,
    })
    .onConflictDoUpdate({
      target: [
        requirementRelationships.fromRequirementVersionId,
        requirementRelationships.toRequirementVersionId,
        requirementRelationships.relationshipType,
      ],
      set: {
        confidence: params.textSimilarity,
        textSimilarity: params.textSimilarity,
        levelChanged: params.levelChanged,
        notes: params.notes,
        updatedAt: new Date(),
      },
    });
}
