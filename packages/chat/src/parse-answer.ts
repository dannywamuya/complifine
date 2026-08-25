export interface AnswerSections {
  summary: string;
  detail: string;
  practical: string;
}

const HEADING = /^##\s+(.+?)\s*$/;
const SUMMARY_TITLE = /^(at a glance|summary|in short)$/i;
const DETAIL_TITLE = /^(what the standard says|the standard|detail|details)$/i;
const PRACTICAL_TITLE = /^(what this means|on the farm|on site|in practice)$/i;

/** Keep in step with `parseAnswerSections` in packages/ai/src/agent/prompt.ts. */
export function parseAnswerSections(answer: string): AnswerSections {
  const trimmed = answer.trim();
  if (!trimmed) return { summary: "", detail: "", practical: "" };

  const blocks: Array<{ title: string; body: string }> = [];
  let current: { title: string; lines: string[] } | null = null;
  const preamble: string[] = [];

  for (const line of trimmed.split("\n")) {
    const match = HEADING.exec(line);
    if (match) {
      if (current) {
        blocks.push({ title: current.title, body: current.lines.join("\n").trim() });
      }
      current = { title: match[1]!.trim(), lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
    else preamble.push(line);
  }
  if (current) {
    blocks.push({ title: current.title, body: current.lines.join("\n").trim() });
  }

  if (blocks.length === 0) {
    const paragraphs = trimmed.split(/\n{2,}/);
    return {
      summary: paragraphs[0] ?? "",
      detail: paragraphs.slice(1).join("\n\n"),
      practical: "",
    };
  }

  let summary = "";
  let detail = "";
  let practical = "";
  const extra: string[] = [];

  for (const block of blocks) {
    if (SUMMARY_TITLE.test(block.title)) summary = block.body;
    else if (DETAIL_TITLE.test(block.title)) detail = block.body;
    else if (PRACTICAL_TITLE.test(block.title)) practical = block.body;
    else extra.push(`## ${block.title}\n\n${block.body}`.trim());
  }

  const lead = preamble.join("\n").trim();
  if (!summary) summary = lead;
  else if (lead) extra.unshift(lead);

  if (extra.length > 0) {
    detail = [detail, ...extra].filter(Boolean).join("\n\n");
  }

  return { summary, detail, practical };
}

export function looksStructured(answer: string): boolean {
  const { summary, detail, practical } = parseAnswerSections(answer);
  return Boolean(summary && (detail || practical));
}
