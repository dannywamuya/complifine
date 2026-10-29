/**
 * When the user did not pick a template, rank the site's templates by how
 * much of the source text overlaps their title and column labels, then ask
 * the model to choose among the closest few. The choice is a suggestion the
 * reviewer can change.
 */

export interface ClassifiableTemplate {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly labels: readonly string[];
}

export function rankTemplates(text: string, templates: readonly ClassifiableTemplate[]): ClassifiableTemplate[] {
  const hay = text.toLowerCase();
  const scored = templates.map((template) => {
    const words = [...template.title.toLowerCase().split(/\W+/), ...template.labels.map((label) => label.toLowerCase())];
    const score = words.filter((word) => word.length > 2 && hay.includes(word)).length;
    return { template, score };
  });
  return scored.sort((a, b) => b.score - a.score).map((row) => row.template);
}

export async function classifyTemplate(
  text: string,
  templates: readonly ClassifiableTemplate[],
  pick: (candidates: readonly ClassifiableTemplate[]) => Promise<string>,
): Promise<ClassifiableTemplate | null> {
  const ranked = rankTemplates(text, templates).slice(0, 5);
  if (ranked.length === 0) return null;
  if (ranked.length === 1) return ranked[0]!;
  const chosen = await pick(ranked);
  return ranked.find((template) => template.id === chosen || template.slug === chosen) ?? ranked[0]!;
}
