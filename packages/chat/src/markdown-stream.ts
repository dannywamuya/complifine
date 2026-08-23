/**
 * Close unfinished markdown constructs so a streaming buffer still renders.
 * Incomplete fences, inline code, math, and links are the usual breakage.
 */
export function stabilizeMarkdown(input: string): string {
  let text = input.replace(/\r\n/g, "\n");
  if (!text) return text;

  const lines = text.split("\n");
  let inFence = false;
  let fenceMarker = "```";
  for (const line of lines) {
    const fence = /^(```+|~~~+)/.exec(line);
    if (!fence) continue;
    const marker = fence[1]!;
    if (!inFence) {
      inFence = true;
      fenceMarker = marker.slice(0, 3);
    } else if (line.trim().startsWith(fenceMarker)) {
      inFence = false;
    }
  }
  if (inFence) text += `\n${fenceMarker}`;

  const dollarBlocks = (text.match(/\$\$/g) ?? []).length;
  if (dollarBlocks % 2 === 1) text += "\n$$";

  if (!inFence) {
    const withoutFences = stripFenced(text);
    const ticks = (withoutFences.match(/`/g) ?? []).length;
    if (ticks % 2 === 1) text += "`";

    const opens = withoutFences.match(/\[[^\]\n]{0,200}\](?!\()/g);
    const dangling = /\[[^\]\n]*$/.test(withoutFences);
    if (dangling) text += "]";
    void opens;
  }

  return text;
}

function stripFenced(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "").replace(/~~~[\s\S]*?~~~/g, "");
}

export function extractArtifacts(markdown: string): Array<{ language: string; code: string; title: string }> {
  const artifacts: Array<{ language: string; code: string; title: string }> = [];
  const pattern = /```([^\n`]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown))) {
    const meta = match[1]!.trim();
    const language = meta.split(/\s+/)[0] || "text";
    const code = match[2]!.replace(/\n$/, "");
    if (code.trim().length < 8) continue;
    artifacts.push({
      language,
      code,
      title: meta.slice(language.length).trim() || `${language} artifact`,
    });
  }
  return artifacts;
}
