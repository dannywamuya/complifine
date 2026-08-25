"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface EditionOption {
  value: string;
  label: string;
}

export interface CatalogStandard {
  code: string;
  name: string;
  publisher?: string;
  versions: EditionOption[];
}

interface Catalog {
  standards: Array<{
    code: string;
    name: string;
    publisher?: string;
    versions: Array<{ code: string; name: string; status: string }>;
  }>;
}

export function usePublishedCatalog(): {
  standards: CatalogStandard[];
  editions: EditionOption[];
  loading: boolean;
} {
  const [standards, setStandards] = useState<CatalogStandard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Catalog>("/standards")
      .then((data) => {
        setStandards(
          data.standards
            .map((standard) => ({
              code: standard.code,
              name: standard.name,
              publisher: standard.publisher,
              versions: standard.versions
                .filter((version) => version.status === "published")
                .map((version) => ({
                  value: version.code,
                  label: version.name,
                })),
            }))
            .filter((standard) => standard.versions.length > 0),
        );
      })
      .catch(() => setStandards([]))
      .finally(() => setLoading(false));
  }, []);

  return {
    standards,
    editions: standards.flatMap((standard) => standard.versions),
    loading,
  };
}

export function usePublishedEditions(): EditionOption[] {
  return usePublishedCatalog().editions;
}

export function editionLabel(code: string, editions: readonly EditionOption[]): string {
  return editions.find((item) => item.value === code)?.label ?? code;
}
