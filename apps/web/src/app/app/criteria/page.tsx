"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import { CatalogNav, type CatalogTreePayload, type CatalogVersion } from "@/components/catalog-tree";
import { LevelBadge } from "@/components/level-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CriteriaTableSkeleton } from "@/components/app-skeletons";

interface Listing {
  total: number;
  requirements: Array<{
    id: string;
    criterion: string;
    level: string;
    principle: string;
    page: number | null;
  }>;
}

interface VersionDetail {
  levelOptions?: Array<{ code: string; label: string; count: number }>;
}

function findVersion(catalog: CatalogTreePayload, code: string): CatalogVersion | undefined {
  for (const standard of catalog.standards) {
    const match = standard.versions.find((version) => version.code === code);
    if (match) return match;
  }
  return undefined;
}

export default function AppCriteriaPage() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<CatalogTreePayload | null>(null);
  const [version, setVersion] = useState("");
  const [level, setLevel] = useState("all");
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [data, setData] = useState<Listing | null>(null);
  const [levels, setLevels] = useState<Array<{ code: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);

  const editions = useMemo(
    () =>
      (catalog?.standards ?? []).flatMap((standard) =>
        standard.versions.map((item) => ({ value: item.code, label: item.name })),
      ),
    [catalog],
  );

  const selected = catalog ? findVersion(catalog, version) : undefined;
  const selectedStandard = catalog?.standards.find((standard) =>
    standard.versions.some((item) => item.code === version),
  );

  useEffect(() => {
    api<CatalogTreePayload>("/registry")
      .then((payload) => {
        setCatalog(payload);
        setVersion((current) => {
          if (
            current &&
            payload.standards.some((standard) =>
              standard.versions.some((item) => item.code === current),
            )
          ) {
            return current;
          }
          return payload.standards[0]?.versions[0]?.code ?? "";
        });
      })
      .catch(() => setCatalog({ standards: [] }));
  }, []);

  useEffect(() => {
    if (!version) {
      setLoading(false);
      setLevels([]);
      return;
    }
    const query = new URLSearchParams();
    if (submitted) query.set("q", submitted);
    if (level !== "all") query.set("level", level);
    query.set("limit", "80");
    setLoading(true);
    Promise.all([
      api<Listing>(`/versions/${version}/requirements?${query}`),
      api<VersionDetail>(`/versions/${version}`),
    ])
      .then(([listing, detail]) => {
        setData(listing);
        setLevels(detail.levelOptions ?? []);
      })
      .catch(() => {
        setData({ total: 0, requirements: [] });
        setLevels([]);
      })
      .finally(() => setLoading(false));
  }, [version, level, submitted]);

  function selectVersion(code: string) {
    setLevel("all");
    setSubmitted("");
    setQ("");
    setVersion(code);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <header className="w-fit max-w-full space-y-2" id="tour-catalog">
        <p className="text-lg text-muted-foreground">Published knowledge</p>
        <h1 className="font-heading text-3xl font-medium tracking-tight text-balance sm:text-4xl">
          Catalog
        </h1>
        <p className="max-w-lg text-base leading-relaxed text-muted-foreground">
          Choose a published edition, then read the official wording. Only live knowledge is listed.
        </p>
      </header>

      {catalog === null ? (
        <p className="text-sm text-muted-foreground">Loading catalog…</p>
      ) : editions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No published editions yet.</p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[16.5rem_minmax(0,1fr)]">
          <CatalogNav data={catalog} selected={version} onSelect={selectVersion} />
          <div className="min-w-0 space-y-5">
            {selected ? (
              <div className="space-y-1">
                <h2 className="font-heading text-xl font-medium">{selected.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {selectedStandard?.name}
                  {selectedStandard ? " · " : ""}
                  {selected.criteria} criteria
                </p>
                {selected.documents.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {selected.documents
                      .map((document) => `${document.title}${document.binding ? "" : " (guidance)"}`)
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
            ) : null}

            <form
              id="tour-catalog-search"
              className="flex w-fit max-w-full flex-col gap-3 rounded-[1.75rem] border border-border bg-card p-3 shadow-[0_8px_28px_rgb(0_0_0/0.06)] sm:flex-row sm:items-center"
              onSubmit={(event) => {
                event.preventDefault();
                setSubmitted(q.trim());
              }}
            >
              <label className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <span className="sr-only">Number or principle</span>
                <Input
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder="Number or principle"
                  className="h-10 rounded-full border-0 bg-muted pl-9 shadow-none focus-visible:bg-card"
                />
              </label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger className="h-10 w-full rounded-full sm:w-44" size="sm">
                  <SelectValue placeholder="All levels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All levels</SelectItem>
                  {levels.map((option) => (
                    <SelectItem key={option.code} value={option.code}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="submit" className="h-10 rounded-full px-4">
                Search
              </Button>
            </form>

            {loading || !data ? (
              <CriteriaTableSkeleton />
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {data.total} in this edition
                  {submitted ? ` · matching “${submitted}”` : ""}
                </p>
                <div className="overflow-hidden rounded-2xl border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-[22%] bg-muted/80">ID</TableHead>
                        <TableHead className="w-[18%] bg-muted/80">Level</TableHead>
                        <TableHead className="bg-muted/80">Principle</TableHead>
                        <TableHead className="w-14 bg-muted/80">Page</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.requirements.length === 0 ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={4} className="h-40 text-center text-muted-foreground">
                            No criteria match those filters.
                          </TableCell>
                        </TableRow>
                      ) : (
                        data.requirements.map((row) => (
                          <TableRow
                            key={row.id}
                            className="cursor-pointer"
                            onClick={() =>
                              router.push(`/app/criteria/${encodeURIComponent(row.criterion)}`)
                            }
                          >
                            <TableCell>
                              <Link
                                className="font-mono text-sm font-medium text-primary underline-offset-4 hover:underline"
                                href={`/app/criteria/${encodeURIComponent(row.criterion)}`}
                                onClick={(event) => event.stopPropagation()}
                              >
                                {row.criterion}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <LevelBadge level={row.level} />
                            </TableCell>
                            <TableCell className="min-w-0">{row.principle}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {row.page ? `p.${row.page}` : "—"}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
