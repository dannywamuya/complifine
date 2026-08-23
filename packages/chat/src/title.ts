export function titleFromFirstMessage(text: string, max = 80): string {
  const compact = text.trim().replace(/\s+/g, " ");
  if (!compact) return "New chat";
  if (compact.length <= max) return compact;
  return `${compact.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}
