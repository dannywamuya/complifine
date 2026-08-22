export const CERT_SCOPE_COOKIE = "cf_cert_scope";

export interface CatalogVersion {
  id: string;
  code: string;
  name: string;
  edition: string;
  version: string;
  scope: string;
  status: string;
  levelScheme: string;
  criteria: number;
}

export interface CatalogStandard {
  id: string;
  code: string;
  name: string;
  publisher: string;
  description: string | null;
  homepageUrl: string | null;
  versions: CatalogVersion[];
}

export interface Catalog {
  standards: CatalogStandard[];
}

export function parseScope(raw: string | undefined | null): string[] {
  if (!raw) return [];
  try {
    return decodeURIComponent(raw)
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  } catch {
    return raw.split(",").map((part) => part.trim()).filter(Boolean);
  }
}

export function scopeQuery(codes: string[]): string {
  return codes.length ? `standards=${encodeURIComponent(codes.join(","))}` : "";
}

export function versionsInScope(
  catalog: Catalog,
  selected: string[],
): Array<CatalogVersion & { standardCode: string; standardName: string }> {
  const standards = selected.length
    ? catalog.standards.filter((standard) => selected.includes(standard.code))
    : catalog.standards;
  return standards.flatMap((standard) =>
    standard.versions.map((version) => ({
      ...version,
      standardCode: standard.code,
      standardName: standard.name,
    })),
  );
}

export function writeScopeCookie(codes: string[]): void {
  const value = encodeURIComponent(codes.join(","));
  document.cookie = `${CERT_SCOPE_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
