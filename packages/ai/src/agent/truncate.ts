/** Soft cap on tool JSON fed back into the next model step (~7k chars). */
export const TOOL_RESULT_MAX_CHARS = 7_000;

/**
 * Shrink a tool result so search dumps cannot balloon the following step.
 * Strings are sliced; objects/arrays are JSON-stringified then truncated with a
 * marker. Already-small values pass through unchanged.
 */
export function truncateToolResult(value: unknown, maxChars = TOOL_RESULT_MAX_CHARS): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (value.length <= maxChars) return value;
    return `${value.slice(0, maxChars)}…[truncated]`;
  }
  const json = JSON.stringify(value);
  if (json.length <= maxChars) return value;
  return {
    truncated: true,
    preview: `${json.slice(0, maxChars)}…[truncated]`,
  };
}
