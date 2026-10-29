/**
 * When evidence is created, copy the control library's expectation onto it:
 * which controls it satisfies, and through them which requirements.
 *
 * The copy is rebuilt on every submit so a mapping change reaches existing
 * evidence the next time it is saved. Readiness still decides applicability
 * from the live control library; these rows are the audit trail of what the
 * evidence was filed against.
 */

import { eq, inArray, type Database } from "@complifine/db";
import { controlEvidenceTypes, controlRequirements, evidenceControls, evidenceRequirements } from "@complifine/db";

export async function attachEvidenceLinks(
  db: Database,
  evidenceId: string,
  evidenceTypeId: string,
): Promise<void> {
  await db.delete(evidenceControls).where(eq(evidenceControls.evidenceId, evidenceId));
  await db.delete(evidenceRequirements).where(eq(evidenceRequirements.evidenceId, evidenceId));

  const controlsForType = await db
    .select({ controlId: controlEvidenceTypes.controlId })
    .from(controlEvidenceTypes)
    .where(eq(controlEvidenceTypes.evidenceTypeId, evidenceTypeId));
  if (controlsForType.length === 0) return;

  await db.insert(evidenceControls).values(
    controlsForType.map((row) => ({ evidenceId, controlId: row.controlId })),
  );

  const requirements = await db
    .select({ requirementVersionId: controlRequirements.requirementVersionId })
    .from(controlRequirements)
    .where(
      inArray(
        controlRequirements.controlId,
        controlsForType.map((row) => row.controlId),
      ),
    );

  const seen = new Set<string>();
  const rows = requirements.filter((row) => {
    if (seen.has(row.requirementVersionId)) return false;
    seen.add(row.requirementVersionId);
    return true;
  });
  if (rows.length === 0) return;
  await db.insert(evidenceRequirements).values(rows.map((row) => ({ evidenceId, ...row })));
}
