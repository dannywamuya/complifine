"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface EditionOption {
  value: string;
  label: string;
}

interface Catalog {
  standards: Array<{
    versions: Array<{ code: string; name: string; status: string }>;
  }>;
}

export function usePublishedEditions(): EditionOption[] {
  const [editions, setEditions] = useState<EditionOption[]>([]);

  useEffect(() => {
    api<Catalog>("/standards")
      .then((data) => {
        setEditions(
          data.standards.flatMap((standard) =>
            standard.versions.map((version) => ({
              value: version.code,
              label: version.name,
            })),
          ),
        );
      })
      .catch(() => setEditions([]));
  }, []);

  return editions;
}

export function editionLabel(code: string, editions: readonly EditionOption[]): string {
  return editions.find((item) => item.value === code)?.label ?? code;
}
