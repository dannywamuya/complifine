/**
 * A chat citation becomes a catalog link only when it names a real criterion.
 * Section titles and tool labels stay text.
 */

const FV =
  /\bFV[\s-]?(Smart|GFS)\s*(\d{1,2})\.(\d{1,2})(?:\.(\d{1,2}))?(?!\d)/i;
const ETI = /\b(?:eti:|ETI\s+)(\d+(?:\.\d+)?)/i;
const WR = /\bsmeta-wr:([A-Za-z0-9.]+)/i;
const SMETA = /\bSMETA\s+(\d+(?:\.\d+)*)/i;

/** Canonical catalog id, or null when the text is not a criterion number. */
export function criterionLinkId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const eti = ETI.exec(trimmed);
  if (eti) return `eti:${eti[1]}`;
  const wr = WR.exec(trimmed);
  if (wr) return `smeta-wr:${wr[1]}`;
  const smeta = SMETA.exec(trimmed);
  if (smeta) return `SMETA ${smeta[1]}`;

  const match = FV.exec(trimmed);
  if (!match) return null;
  const edition = match[1]!.toLowerCase() === "gfs" ? "FV-GFS" : "FV-Smart";
  const pad = (value: string | undefined) => (value ? value.padStart(2, "0") : undefined);
  return `${edition} ${[pad(match[2]), pad(match[3]), pad(match[4])].filter(Boolean).join(".")}`;
}

const CONTINUATION = /^(\s*(?:,|and|or)\s+)(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)(?!\d)/i;

function padNumber(raw: string): string {
  return raw
    .split(".")
    .map((part) => part.padStart(2, "0"))
    .join(".");
}

/**
 * Turn a raw review path into a markdown link, and repeat the edition on
 * criterion numbers that follow one (`FV-GFS 01.03 and 01.04`).
 * Leaves fenced and inline code alone.
 */
export function prettifyAnswerLinks(text: string): string {
  return text
    .split(/(```[\s\S]*?```|`[^`\n]+`)/g)
    .map((part, index) => (index % 2 === 1 ? part : rewriteAnswerLinks(part)))
    .join("");
}

function rewriteAnswerLinks(text: string): string {
  const recordReview =
    /(?:Review:\s*)?(\/app\/records\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
  const editionCriterion = /\bFV[\s-]?(Smart|GFS)\s*(\d{1,2})\.(\d{1,2})(?:\.(\d{1,2}))?(?!\d)/gi;
  const withReviews = text.replace(recordReview, (_match, href: string, offset: number, source: string) => {
    const before = source.slice(Math.max(0, offset - 2), offset);
    if (before.endsWith("](")) return _match;
    return `[Review](${href})`;
  });

  let out = "";
  let cursor = 0;
  for (const match of withReviews.matchAll(editionCriterion)) {
    const index = match.index ?? 0;
    if (index < cursor) continue;
    out += withReviews.slice(cursor, index);
    const edition = match[1]!.toLowerCase() === "gfs" ? "FV-GFS" : "FV-Smart";
    const canonical = `${edition} ${[match[2], match[3], match[4]].filter(Boolean).map((part) => part!.padStart(2, "0")).join(".")}`;
    out += canonical;
    cursor = index + match[0].length;
    let rest = withReviews.slice(cursor);
    let continuation = CONTINUATION.exec(rest);
    while (continuation) {
      out += `${continuation[1]}${edition} ${padNumber(continuation[2]!)}`;
      cursor += continuation[0].length;
      rest = withReviews.slice(cursor);
      continuation = CONTINUATION.exec(rest);
    }
  }
  out += withReviews.slice(cursor);
  return out;
}

/** True when a markdown href points at the criteria page with a non-criterion id. */
export function isInventedCriterionHref(href: string): boolean {
  let pathname = href;
  try {
    pathname = new URL(href, "http://local").pathname;
  } catch {
    return false;
  }
  const match = pathname.match(/\/criteria\/([^/]+)\/?$/);
  if (!match?.[1]) return false;
  let id = match[1];
  try {
    id = decodeURIComponent(id);
  } catch {
    return true;
  }
  return criterionLinkId(id) === null;
}
