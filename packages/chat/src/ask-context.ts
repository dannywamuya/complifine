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
}): string | undefined {
  const bits: string[] = [];
  if (input.organizationName?.trim()) bits.push(`company ${input.organizationName.trim()}`);
  if (input.siteLabel?.trim()) bits.push(`site ${input.siteLabel.trim()}`);
  if (bits.length === 0) return undefined;
  return `This question is about ${bits.join(", ")}. Use farm tools for that company and site.`;
}
