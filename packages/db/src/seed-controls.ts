/**
 * Pilot control library: overlapping GLOBALG.A.P. / SMETA labour and H&S topics.
 *
 * Controls are knowledge, not company rows. Requirement links are attached only
 * when those requirement versions already exist, so this seed is safe to run
 * before SMETA Workplace Requirements are dropped and after IFA ingest.
 */

import { eq, inArray } from "drizzle-orm";
import type { Database } from "./client.ts";
import { applicabilityQuestions, requirementVersions, standardVersions } from "./schema/index.ts";
import {
  controlEvidenceTypes,
  controlRequirements,
  controls,
  evidenceTypes,
} from "./schema/controls.ts";

const EVIDENCE = [
  {
    slug: "training-attendance-register",
    title: "Training attendance register",
    description: "Dated register of who was trained, on what, by whom.",
  },
  {
    slug: "hs-induction-record",
    title: "H&S induction record",
    description: "Record that each worker received a health and safety induction before starting work.",
  },
  {
    slug: "ppe-issue-log",
    title: "PPE issue log",
    description: "What protective equipment was issued, when, and to whom.",
  },
  {
    slug: "reentry-signage-photo",
    title: "Re-entry interval signage",
    description: "Photograph or log showing the re-entry interval posted after spraying.",
  },
  {
    slug: "drinking-water-test",
    title: "Drinking water test report",
    description: "Laboratory report for potable water used by workers.",
  },
  {
    slug: "hygiene-procedure",
    title: "Hygiene procedure",
    description: "Written procedure covering handwashing, toilets, and harvest hygiene.",
  },
  {
    slug: "grievance-procedure",
    title: "Grievance / disciplinary procedure",
    description: "Written procedure prohibiting harsh or inhumane treatment and explaining how workers raise a complaint.",
  },
] as const;

interface ControlSeed {
  slug: string;
  title: string;
  description: string;
  objective: string;
  controlType: "policy" | "procedure" | "training" | "inspection" | "record" | "physical";
  ownerRole: string;
  frequency: string;
  implementationGuidance: string;
  reviewFrequency: string;
  evidence: readonly string[];
  /** GLOBALG.A.P. sourceRequirementId values (Smart and GFS share the number). */
  ggap: readonly string[];
  /** ETI stable keys, e.g. eti:3.3 */
  eti: readonly string[];
}

const LIBRARY: readonly ControlSeed[] = [
  {
    slug: "hs-induction-training",
    title: "Health and safety induction and refresher training",
    description:
      "Every worker receives recorded H&S training covering site hazards before they start, and at regular intervals after that.",
    objective: "Workers know the hazards of this site and how to avoid them.",
    controlType: "training",
    ownerRole: "site_manager",
    frequency: "On hiring, then at least annually and after a serious incident",
    implementationGuidance:
      "Keep a dated register. Include seasonal and contractor workers. Cover chemicals, machinery, and emergency routes.",
    reviewFrequency: "Annual",
    evidence: ["training-attendance-register", "hs-induction-record"],
    ggap: ["FV-Smart 32.04.01", "FV-GFS 32.04.01"],
    eti: ["eti:3.3"],
  },
  {
    slug: "ppe-and-reentry",
    title: "PPE and spray re-entry",
    description:
      "Workers who mix or apply plant protection products have the right PPE, and nobody re-enters a treated area before the interval expires.",
    objective: "Prevent chemical exposure during and after spraying.",
    controlType: "physical",
    ownerRole: "site_manager",
    frequency: "Every application",
    implementationGuidance:
      "Issue PPE against a log. Post the re-entry interval at field entry. Record the time spraying finished.",
    reviewFrequency: "Per spray round / season review",
    evidence: ["ppe-issue-log", "reentry-signage-photo"],
    ggap: ["FV-Smart 32.10.06", "FV-GFS 32.10.06", "FV-Smart 32.07.05", "FV-GFS 32.07.05"],
    eti: ["eti:3.1", "eti:3.2"],
  },
  {
    slug: "drinking-water-and-sanitation",
    title: "Drinking water, toilets and food hygiene",
    description:
      "Workers have potable water, clean toilets, and (where food is stored) sanitary facilities.",
    objective: "Meet basic welfare and food-hygiene conditions on site.",
    controlType: "inspection",
    ownerRole: "compliance_manager",
    frequency: "Water tests per the edition in scope; facilities inspected weekly",
    implementationGuidance:
      "Keep the latest water test with the farm file. Inspect toilets and handwash stations on a checklist.",
    reviewFrequency: "Monthly",
    evidence: ["drinking-water-test", "hygiene-procedure"],
    ggap: ["FV-Smart 30.05.04", "FV-GFS 30.05.04", "FV-Smart 20.04.02", "FV-GFS 20.04.02"],
    eti: ["eti:3.4"],
  },
  {
    slug: "no-harsh-treatment",
    title: "No harsh or inhumane treatment",
    description:
      "Physical abuse, harassment and intimidation are prohibited, and workers know how to report them.",
    objective: "A workplace where discipline is never violence.",
    controlType: "policy",
    ownerRole: "compliance_manager",
    frequency: "Always in force; briefed at induction",
    implementationGuidance:
      "A short written policy, translated if needed, plus a named person who receives complaints without retaliation.",
    reviewFrequency: "Annual",
    evidence: ["grievance-procedure", "hs-induction-record"],
    ggap: ["FV-Smart 24.01", "FV-GFS 24.01"],
    eti: ["eti:9", "eti:9.1"],
  },
];

const SMETA_PROFILE = [
  {
    guid: "complifine:smeta-labour-providers",
    number: 1,
    text: "Does this site use labour providers or labour brokers?",
    justification: "Labour-provider arrangements change which ETI clauses and SMETA WRs an auditor will sample.",
  },
  {
    guid: "complifine:smeta-worker-count",
    number: 2,
    text: "Are more than five workers employed at this site, including seasonal workers?",
    justification: "Worker-count band is a SMETA site-profile field until official SAQ answers are stored.",
  },
  {
    guid: "complifine:smeta-accommodation",
    number: 3,
    text: "Does the site provide worker accommodation?",
    justification: "ETI 3.5 applies where accommodation is provided.",
  },
] as const;

export async function seedControls(db: Database): Promise<{ controls: number; links: number }> {
  for (const item of EVIDENCE) {
    await db
      .insert(evidenceTypes)
      .values(item)
      .onConflictDoUpdate({
        target: evidenceTypes.slug,
        set: { title: item.title, description: item.description, updatedAt: new Date() },
      });
  }

  const evidenceRows = await db.select().from(evidenceTypes);
  const evidenceBySlug = new Map(evidenceRows.map((row) => [row.slug, row.id]));

  let linkCount = 0;

  for (const item of LIBRARY) {
    await db
      .insert(controls)
      .values({
        slug: item.slug,
        title: item.title,
        description: item.description,
        objective: item.objective,
        controlType: item.controlType,
        ownerRole: item.ownerRole,
        frequency: item.frequency,
        implementationGuidance: item.implementationGuidance,
        reviewFrequency: item.reviewFrequency,
      })
      .onConflictDoUpdate({
        target: controls.slug,
        set: {
          title: item.title,
          description: item.description,
          objective: item.objective,
          controlType: item.controlType,
          ownerRole: item.ownerRole,
          frequency: item.frequency,
          implementationGuidance: item.implementationGuidance,
          reviewFrequency: item.reviewFrequency,
          updatedAt: new Date(),
        },
      });

    const [control] = await db.select().from(controls).where(eq(controls.slug, item.slug));
    if (!control) continue;

    for (const slug of item.evidence) {
      const evidenceId = evidenceBySlug.get(slug);
      if (!evidenceId) continue;
      await db
        .insert(controlEvidenceTypes)
        .values({ controlId: control.id, evidenceTypeId: evidenceId, mandatory: true })
        .onConflictDoNothing();
    }

    const identifiers = [...item.ggap, ...item.eti];
    if (identifiers.length === 0) continue;

    const versions = await db
      .select({ id: requirementVersions.id })
      .from(requirementVersions)
      .where(inArray(requirementVersions.sourceRequirementId, identifiers as string[]));

    for (const version of versions) {
      await db
        .insert(controlRequirements)
        .values({ controlId: control.id, requirementVersionId: version.id })
        .onConflictDoNothing();
      linkCount += 1;
    }
  }

  await seedSmetaProfileQuestions(db);

  const [{ value: controlCount } = { value: LIBRARY.length }] = [{ value: LIBRARY.length }];
  return { controls: controlCount, links: linkCount };
}

async function seedSmetaProfileQuestions(db: Database): Promise<void> {
  const versions = await db
    .select()
    .from(standardVersions)
    .where(inArray(standardVersions.code, ["smeta-7-2-pillar", "smeta-7-4-pillar"]));

  for (const version of versions) {
    for (const question of SMETA_PROFILE) {
      await db
        .insert(applicabilityQuestions)
        .values({
          standardVersionId: version.id,
          sourceGuid: question.guid,
          sourceNumber: question.number,
          questionText: question.text,
          justificationTemplate: question.justification,
          exemptingAnswer: "no",
          displayOrder: question.number,
        })
        .onConflictDoUpdate({
          target: [applicabilityQuestions.standardVersionId, applicabilityQuestions.sourceGuid],
          set: {
            questionText: question.text,
            justificationTemplate: question.justification,
            displayOrder: question.number,
            updatedAt: new Date(),
          },
        });
    }
  }
}
