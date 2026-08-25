/**
 * Producer-facing rephrasing of official scoping questions.
 *
 * The stored text is the publisher's ("Has the producer…"). CompliFine asks
 * the person answering, so the UI says "Have you…". Justifications and the
 * agent still quote the official wording.
 */
export function toFirstPersonQuestion(text: string): string {
  let out = text.trim();
  out = out.replace(/\b[Tt]he producer['’]s\b/g, (match) => (match[0] === "T" ? "Your" : "your"));
  out = out.replace(/\b[Tt]his producer['’]s\b/g, (match) => (match[0] === "T" ? "Your" : "your"));
  out = out.replace(/\b[Tt]he company['’]s\b/g, (match) => (match[0] === "T" ? "Your" : "your"));

  const phrases: Array<[RegExp, string]> = [
    [/\bHas the producer or producer group\b/gi, "Have you"],
    [/\bDoes the producer or producer group\b/gi, "Do you"],
    [/\bHas the producer\b/gi, "Have you"],
    [/\bHas this producer\b/gi, "Have you"],
    [/\bDoes the producer\b/gi, "Do you"],
    [/\bDoes this producer\b/gi, "Do you"],
    [/\bIs the producer\b/gi, "Are you"],
    [/\bIs this producer\b/gi, "Are you"],
    [/\bWas the producer\b/gi, "Were you"],
    [/\bWere the producer\b/gi, "Were you"],
    [/\bDid the producer\b/gi, "Did you"],
    [/\bHas the company\b/gi, "Have you"],
    [/\bDoes the company\b/gi, "Do you"],
    [/\bIs the company\b/gi, "Are you"],
    [/\bthe producer or producer group\b/gi, "you"],
    [/\bthis producer\b/gi, "you"],
    [/\bthe producers\b/gi, "you"],
    [/\bthe producer\b/gi, "you"],
  ];

  for (const [pattern, replacement] of phrases) {
    out = out.replace(pattern, replacement);
  }

  return out.replace(/\byou['’]s\b/g, "your");
}
