"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Filter } from "lucide-react";
import { api } from "@/lib/api";
import {
  parseScope,
  versionsInScope as scopedVersions,
  writeScopeCookie,
  CERT_SCOPE_COOKIE,
  type Catalog,
  type CatalogStandard,
  type CatalogVersion,
} from "@/lib/scope";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CertScopeValue {
  catalog: Catalog | null;
  selected: string[];
  isAll: boolean;
  standards: CatalogStandard[];
  versions: Array<CatalogVersion & { standardCode: string; standardName: string }>;
  defaultVersionCode: string | undefined;
  toggle: (code: string) => void;
  selectAll: () => void;
  label: string;
}

const CertScopeContext = createContext<CertScopeValue | null>(null);

function readCookie(): string[] {
  if (typeof document === "undefined") return [];
  const match = document.cookie.split("; ").find((part) => part.startsWith(`${CERT_SCOPE_COOKIE}=`));
  return parseScope(match?.slice(CERT_SCOPE_COOKIE.length + 1));
}

export function CertScopeProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    setSelected(readCookie());
    api<Catalog>("/standards")
      .then(setCatalog)
      .catch(() => setCatalog({ standards: [] }));
  }, []);

  const commit = useCallback(
    (next: string[]) => {
      setSelected(next);
      writeScopeCookie(next);
      router.refresh();
    },
    [router],
  );

  const value = useMemo<CertScopeValue>(() => {
    const standards = catalog?.standards ?? [];
    const versions = catalog ? scopedVersions(catalog, selected) : [];
    const isAll = selected.length === 0;
    const label = isAll
      ? "All certifications"
      : selected.length === 1
        ? (standards.find((standard) => standard.code === selected[0])?.name ?? selected[0] ?? "1 certification")
        : `${selected.length} certifications`;

    return {
      catalog,
      selected,
      isAll,
      standards,
      versions,
      defaultVersionCode: versions[0]?.code,
      toggle: (code: string) => {
        const next = selected.includes(code)
          ? selected.filter((item) => item !== code)
          : [...selected, code];
        commit(next);
      },
      selectAll: () => commit([]),
      label,
    };
  }, [catalog, selected, commit]);

  return <CertScopeContext.Provider value={value}>{children}</CertScopeContext.Provider>;
}

export function useCertScope(): CertScopeValue {
  const value = useContext(CertScopeContext);
  if (!value) {
    throw new Error("useCertScope must be used within CertScopeProvider");
  }
  return value;
}

export function CertScopeFilter() {
  const { standards, selected, isAll, toggle, selectAll, label } = useCertScope();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-[min(100%,18rem)] gap-1.5 font-normal">
          <Filter className="size-3.5" />
          <span className="truncate">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Certifications in view</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={isAll} onCheckedChange={() => selectAll()}>
          All certifications
        </DropdownMenuCheckboxItem>
        {standards.map((standard) => (
          <DropdownMenuCheckboxItem
            key={standard.code}
            checked={!isAll && selected.includes(standard.code)}
            onCheckedChange={() => toggle(standard.code)}
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{standard.name}</span>
              <span className="truncate font-mono text-[10px] text-muted-foreground">
                {standard.code} · {standard.versions.length} version
                {standard.versions.length === 1 ? "" : "s"}
              </span>
            </span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
