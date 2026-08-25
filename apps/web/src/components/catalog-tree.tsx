"use client";

import { cn } from "@/lib/utils";

export interface CatalogDocument {
  slug: string;
  title: string;
  type: string;
  authority: string;
  sourceUrl: string | null;
  pages: number | null;
  binding: boolean;
}

export interface CatalogVersion {
  code: string;
  name: string;
  edition: string;
  criteria: number;
  documents: CatalogDocument[];
}

export interface CatalogStandard {
  code: string;
  name: string;
  publisher: string;
  versions: CatalogVersion[];
}

export interface CatalogTreePayload {
  standards: CatalogStandard[];
}

export function CatalogNav({
  data,
  selected,
  onSelect,
}: {
  data: CatalogTreePayload;
  selected: string;
  onSelect: (code: string) => void;
}) {
  if (data.standards.length === 0) {
    return <p className="text-sm text-muted-foreground">No published editions yet.</p>;
  }

  return (
    <nav aria-label="Published catalog" className="space-y-5">
      {data.standards.map((standard) => (
        <div key={standard.code}>
          <p className="px-2 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            {standard.name}
          </p>
          <p className="mt-0.5 px-2 text-xs text-muted-foreground">{standard.publisher}</p>
          <ul className="mt-2 space-y-0.5">
            {standard.versions.map((version) => {
              const active = version.code === selected;
              return (
                <li key={version.code}>
                  <button
                    type="button"
                    className={cn(
                      "w-full rounded-xl px-3 py-2 text-left text-sm",
                      active
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                    onClick={() => onSelect(version.code)}
                  >
                    <span className="block truncate">{version.name}</span>
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      {version.criteria} criteria
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
