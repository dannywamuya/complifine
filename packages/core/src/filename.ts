/**
 * Parser for the GLOBALG.A.P. document filename convention.
 *
 * Every file in their document centre follows a consistent shape:
 *
 *   240321_IFA_Smart_checklist_FV_v6_0_Sep22_protected_en.xlsx
 *   `------' `--------------------' `----' `----' `-------' `'
 *   file date        subject         version  ver.  locked  lang
 *                                            date
 *
 * This is worth parsing rather than hand-entering because it encodes the one
 * distinction that trips people up: the leading date is when the *file* was
 * last regenerated, while the `Sep22` token is the *version* it contains. The
 * example above is a March 2024 file carrying the September 2022 version of
 * the standard. Conflating them would make change detection lie.
 */

export interface ParsedFilename {
  readonly filename: string;
  /** Leading YYMMDD, as an ISO date. Null when the file does not lead with one. */
  readonly fileDate: string | null;
  /** Version token, e.g. "6.0", "6.0-GFS", "1.2". Null when absent. */
  readonly version: string | null;
  /** Month the version was published, as ISO year-month, e.g. "2022-09". */
  readonly versionDate: string | null;
  /** ISO 639-1 language code. Defaults to "en" when the file omits it. */
  readonly language: string;
  /** True when the workbook ships with sheet protection enabled. */
  readonly isProtected: boolean;
  /** Lowercase extension without the dot. */
  readonly extension: string;
  /** The descriptive middle of the filename, underscores turned into spaces. */
  readonly subject: string;
}

/** Three-letter month abbreviations as they appear in version date tokens. */
const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/**
 * Two-digit years in these filenames are all 21st century. GLOBALG.A.P. was
 * founded in 1997 but the document centre only carries current material, and
 * the convention itself postdates 2015.
 */
function expandYear(twoDigit: string): number {
  return 2000 + Number.parseInt(twoDigit, 10);
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
  );
}

export function parseGlobalGapFilename(filename: string): ParsedFilename {
  const base = filename.replace(/^.*[\\/]/, "");
  const dotIndex = base.lastIndexOf(".");
  const extension = dotIndex === -1 ? "" : base.slice(dotIndex + 1).toLowerCase();
  let stem = dotIndex === -1 ? base : base.slice(0, dotIndex);

  // --- leading file date -------------------------------------------------
  let fileDate: string | null = null;
  const dateMatch = /^(\d{2})(\d{2})(\d{2})[_-]/.exec(stem);
  if (dateMatch) {
    const year = expandYear(dateMatch[1]!);
    const month = Number.parseInt(dateMatch[2]!, 10);
    const day = Number.parseInt(dateMatch[3]!, 10);
    if (isValidDate(year, month, day)) {
      fileDate = `${year}-${dateMatch[2]}-${dateMatch[3]}`;
      stem = stem.slice(dateMatch[0].length);
    }
  }

  // --- trailing language and protection flag -----------------------------
  // Order is always `[_protected]_<lang>`, and both are optional.
  let language = "en";
  let isProtected = false;

  const langMatch = /[_-]([a-z]{2})$/i.exec(stem);
  if (langMatch) {
    language = langMatch[1]!.toLowerCase();
    stem = stem.slice(0, -langMatch[0].length);
  }
  const protectedMatch = /[_-]protected$/i.exec(stem);
  if (protectedMatch) {
    isProtected = true;
    stem = stem.slice(0, -protectedMatch[0].length);
  }

  // --- version date ------------------------------------------------------
  // Matched before the version token so that `v6_0_Sep22` cleanly yields
  // version "6.0" once the date has been peeled off the end.
  let versionDate: string | null = null;
  const versionDateMatch = new RegExp(
    `[_-](${Object.keys(MONTHS).join("|")})(\\d{2})(?=$|[_-])`,
    "i",
  ).exec(stem);
  if (versionDateMatch) {
    const month = MONTHS[versionDateMatch[1]!.toLowerCase()]!;
    versionDate = `${expandYear(versionDateMatch[2]!)}-${month}`;
    stem = stem.slice(0, versionDateMatch.index) + stem.slice(versionDateMatch.index + versionDateMatch[0].length);
  }

  // --- version token -----------------------------------------------------
  // Handles `v6_0`, `v6.0`, `v6_0-GFS`, `v1.2`, and the bare `v1` used by the
  // transition tools. The edition suffix is kept because `6.0` and `6.0-GFS`
  // are genuinely different documents.
  let version: string | null = null;
  const versionMatch = /[_-]v(\d+)(?:[._](\d+))?(?:-([A-Za-z]+))?(?=$|[_-])/.exec(stem);
  if (versionMatch) {
    const major = versionMatch[1]!;
    const minor = versionMatch[2];
    const suffix = versionMatch[3];
    version = minor === undefined ? major : `${major}.${minor}`;
    if (suffix) version += `-${suffix.toUpperCase()}`;
    stem = stem.slice(0, versionMatch.index) + stem.slice(versionMatch.index + versionMatch[0].length);
  }

  const subject = stem.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

  return { filename: base, fileDate, version, versionDate, language, isProtected, extension, subject };
}

/**
 * Derive the storage path for a preserved source file.
 *
 * Mirrors the layout the PRD specifies in section 20, with one deliberate
 * change: the leaf filename is the content hash, not the original name.
 * Filenames are not identity - GLOBALG.A.P. reuses them across regenerations -
 * whereas the hash is. Storing by hash means re-fetching an unchanged document
 * is a no-op and two versions of "the same" file can coexist without either
 * clobbering the other. The original name survives in the database.
 */
export function sourceStoragePath(params: {
  standardSlug: string;
  scopeSlug: string;
  versionSlug: string;
  stage: "source" | "parsed" | "normalized";
  contentHash: string;
  extension: string;
}): string {
  const { standardSlug, scopeSlug, versionSlug, stage, contentHash, extension } = params;
  const suffix = extension ? `.${extension}` : "";
  return `${standardSlug}/${scopeSlug}/${versionSlug}/${stage}/${contentHash}${suffix}`;
}
