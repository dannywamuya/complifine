export function rewriteAskQuestion(input: {
  question: string;
  version?: string;
  contextNote?: string;
}): string {
  const parts = [input.question.trim()];
  if (input.version && input.version !== "all") {
    parts.push(`Use the ${input.version} version unless I named another.`);
  }
  if (input.contextNote?.trim()) {
    parts.push(input.contextNote.trim());
  }
  return parts.join("\n\n");
}

export function farmContextNote(input: {
  organizationName?: string;
  siteLabel?: string;
  editionLabels?: readonly string[];
}): string | undefined {
  const bits: string[] = [];
  if (input.organizationName?.trim()) bits.push(`company ${input.organizationName.trim()}`);
  if (input.siteLabel?.trim()) bits.push(`site ${input.siteLabel.trim()}`);
  const editions = (input.editionLabels ?? []).map((label) => label.trim()).filter(Boolean);
  if (bits.length === 0 && editions.length === 0) return undefined;
  const about = bits.length > 0 ? `This question is about ${bits.join(", ")}.` : "";
  const scope =
    editions.length > 0
      ? `Cite only these published editions in the company's scope: ${editions.join("; ")}.`
      : "";
  const farm = bits.length > 0 ? " Use farm tools for that company and site." : "";
  return `${about}${about && scope ? " " : ""}${scope}${farm}`.trim();
}
