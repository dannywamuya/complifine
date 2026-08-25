"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, FileText, Library } from "lucide-react";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  documentFetchLabel,
  editionLane,
  laneLabel,
  nextStep,
  STATUS_STORY,
} from "@/lib/kb";

export interface RegistryDocument {
  slug: string;
  title: string;
  type: string;
  authority: string;
  edition: string;
  sourceUrl: string | null;
  pages: number | null;
  status: string;
  sha256: string | null;
  binding: boolean;
}

export interface RegistryVersion {
  id: string;
  code: string;
  name: string;
  edition: string;
  status: string;
  criteria: number;
  documents: RegistryDocument[];
}

export interface RegistryStandard {
  code: string;
  name: string;
  publisher: string;
  homepageUrl: string | null;
  versions: RegistryVersion[];
}

export interface RegistryTreePayload {
  standards: RegistryStandard[];
}

type LaneFilter = "all" | "live" | "pipeline";

type Selection =
  | { kind: "standard"; code: string }
  | { kind: "version"; code: string };

interface SectionRow {
  id: string;
  number: string | null;
  title: string;
  depth: number;
}

function versionsInLane(versions: RegistryVersion[], lane: LaneFilter): RegistryVersion[] {
  if (lane === "all") return versions;
  return versions.filter((version) =>
    lane === "live" ? editionLane(version.status) === "live" : editionLane(version.status) === "pipeline",
  );
}

export function RegistryExplorer({
  data,
  initialEdition,
  initialStandard,
}: {
  data: RegistryTreePayload;
  initialEdition?: string;
  initialStandard?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [lane, setLane] = useState<LaneFilter>("all");
  const [selection, setSelection] = useState<Selection | null>(() => {
    if (initialEdition) return { kind: "version", code: initialEdition };
    if (initialStandard) return { kind: "standard", code: initialStandard };
    const first = data.standards[0];
    if (first?.versions[0]) return { kind: "version", code: first.versions[0].code };
    if (first) return { kind: "standard", code: first.code };
    return null;
  });

  useEffect(() => {
    if (initialEdition) setSelection({ kind: "version", code: initialEdition });
    else if (initialStandard) setSelection({ kind: "standard", code: initialStandard });
  }, [initialEdition, initialStandard]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows: RegistryStandard[] = [];
    for (const standard of data.standards) {
      const versions = versionsInLane(standard.versions, lane).filter((version) => {
        if (!needle) return true;
        return `${standard.name} ${standard.code} ${standard.publisher} ${version.name} ${version.code} ${version.edition}`
          .toLowerCase()
          .includes(needle);
      });
      if (versions.length > 0) rows.push({ ...standard, versions });
    }
    return rows;
  }, [data.standards, query, lane]);

  const selectedStandard =
    selection?.kind === "standard"
      ? data.standards.find((standard) => standard.code === selection.code)
      : data.standards.find((standard) => standard.versions.some((version) => version.code === selection?.code));
  const selectedVersion =
    selection?.kind === "version"
      ? data.standards.flatMap((standard) => standard.versions).find((version) => version.code === selection.code)
      : undefined;

  function select(next: Selection) {
    setSelection(next);
    const params = new URLSearchParams();
    if (next.kind === "version") params.set("edition", next.code);
    else params.set("standard", next.code);
    const qs = params.toString();
    router.replace(qs ? `/registry?${qs}` : "/registry", { scroll: false });
  }

  const editions = data.standards.reduce((sum, standard) => sum + standard.versions.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a certification or edition"
          className="sm:max-w-xs"
          aria-label="Find a certification or edition"
        />
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["all", "All"],
              ["live", "Live"],
              ["pipeline", "In pipeline"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={lane === value ? "default" : "outline"}
              onClick={() => setLane(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {data.standards.length} certification{data.standards.length === 1 ? "" : "s"} · {editions} edition
        {editions === 1 ? "" : "s"}
      </p>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing matches. Widen Live / In pipeline, clear the search, or run Registry on Ingest.
        </p>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <nav
            aria-label="Knowledge catalog"
            className="min-w-0 rounded-xl ring-1 ring-foreground/10 lg:sticky lg:top-0 lg:w-80 lg:shrink-0"
          >
            <ul className="max-h-[min(28rem,70svh)] overflow-y-auto p-2 lg:max-h-[calc(100svh-16rem)]">
              {filtered.map((standard) => (
                <StandardNav
                  key={standard.code}
                  standard={standard}
                  selection={selection}
                  onSelect={select}
                />
              ))}
            </ul>
          </nav>
          <div className="min-w-0 flex-1 rounded-xl ring-1 ring-foreground/10">
            {selectedVersion && selectedStandard ? (
              <VersionDetail standard={selectedStandard} version={selectedVersion} />
            ) : selectedStandard ? (
              <StandardDetail standard={selectedStandard} onSelect={select} />
            ) : (
              <p className="p-6 text-sm text-muted-foreground">Choose a certification or edition.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StandardNav({
  standard,
  selection,
  onSelect,
}: {
  standard: RegistryStandard;
  selection: Selection | null;
  onSelect: (next: Selection) => void;
}) {
  const selectedHere =
    (selection?.kind === "standard" && selection.code === standard.code) ||
    (selection?.kind === "version" && standard.versions.some((version) => version.code === selection.code));
  const [open, setOpen] = useState(selectedHere || standard.versions.length <= 3);

  useEffect(() => {
    if (selectedHere) setOpen(true);
  }, [selectedHere]);

  return (
    <li>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          className="shrink-0 rounded-md p-1 hover:bg-muted"
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${standard.name}`}
          onClick={() => setOpen((current) => !current)}
        >
          <Chevron open={open} />
        </button>
        <button
          type="button"
          className={cn(
            "flex min-w-0 flex-1 items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted/60",
            selection?.kind === "standard" && selection.code === standard.code ? "bg-muted" : null,
          )}
          onClick={() => {
            setOpen(true);
            onSelect({ kind: "standard", code: standard.code });
          }}
        >
          <Library className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{standard.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {standard.versions.length} edition{standard.versions.length === 1 ? "" : "s"}
            </span>
          </span>
        </button>
      </div>
      {open ? (
        <ul className="mb-1 ml-6 border-l border-border pl-2">
          {standard.versions.length === 0 ? (
            <li className="px-2 py-1.5 text-xs text-muted-foreground">No editions in this filter.</li>
          ) : (
            standard.versions.map((version) => {
              const active = selection?.kind === "version" && selection.code === version.code;
              return (
                <li key={version.code}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted/60",
                      active ? "bg-muted" : null,
                    )}
                    onClick={() => onSelect({ kind: "version", code: version.code })}
                  >
                    <span className="min-w-0 truncate text-sm">{version.name}</span>
                    <span className="shrink-0 text-[10px] tracking-wide text-muted-foreground uppercase">
                      {laneLabel(version.status)}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </li>
  );
}

function StandardDetail({
  standard,
  onSelect,
}: {
  standard: RegistryStandard;
  onSelect: (next: Selection) => void;
}) {
  return (
    <div className="space-y-5 p-5">
      <header className="space-y-1">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">Certification</p>
        <h2 className="font-heading text-xl font-medium">{standard.name}</h2>
        <p className="text-sm text-muted-foreground">
          {standard.publisher}
          {standard.homepageUrl ? (
            <>
              {" · "}
              <a href={standard.homepageUrl} className="hover:underline" target="_blank" rel="noreferrer">
                Publisher site
              </a>
            </>
          ) : null}
        </p>
      </header>
      <ul className="space-y-2">
        {standard.versions.map((version) => {
          const story = STATUS_STORY[version.status];
          return (
            <li key={version.code}>
              <button
                type="button"
                className="w-full rounded-lg px-3 py-3 text-left ring-1 ring-foreground/10 hover:bg-muted/40"
                onClick={() => onSelect({ kind: "version", code: version.code })}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{version.name}</span>
                  <StatusBadge status={version.status} />
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {story?.headline ?? laneLabel(version.status)} · {version.criteria} criteria ·{" "}
                  {version.documents.length} source{version.documents.length === 1 ? "" : "s"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function VersionDetail({
  standard,
  version,
}: {
  standard: RegistryStandard;
  version: RegistryVersion;
}) {
  const story = STATUS_STORY[version.status];
  const step = nextStep(version.status, version.code);
  const fetched = version.documents.filter((document) => document.status !== "registered").length;
  const binding = version.documents.filter((document) => document.binding);
  const guidance = version.documents.filter((document) => !document.binding);
  const browseCriteria = `/criteria?version=${version.code}`;
  const showBrowse = step.href !== browseCriteria && version.criteria > 0;

  return (
    <div className="space-y-6 p-5">
      <header className="space-y-2">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          {standard.name} · Edition
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-xl font-medium">{version.name}</h2>
          <StatusBadge status={version.status} />
        </div>
        {story ? (
          <p className="max-w-xl text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{story.headline}.</span> {story.detail}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {version.criteria} criteria · {fetched}/{version.documents.length} sources on file
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href={step.href}>{step.label}</Link>
        </Button>
        {showBrowse ? (
          <Button asChild variant="outline" size="sm">
            <Link href={browseCriteria}>Browse criteria</Link>
          </Button>
        ) : null}
        <Button asChild variant="outline" size="sm">
          <Link href={`/versions/${version.code}`}>Edition page</Link>
        </Button>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Sources</h3>
        {version.documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No sources registered. Run Registry, then Fetch, on Ingest.
          </p>
        ) : (
          <div className="space-y-4">
            <SourceGroup title="Binding — answers cite these" documents={binding} />
            <SourceGroup title="Guidance — not normative" documents={guidance} />
          </div>
        )}
      </section>

      <OutlinePanel versionCode={version.code} />
    </div>
  );
}

function SourceGroup({ title, documents }: { title: string; documents: RegistryDocument[] }) {
  if (documents.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
      <ul className="space-y-1">
        {documents.map((document) => (
          <li key={document.slug} className="flex min-w-0 items-start gap-2 py-1 text-sm">
            <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              {document.sourceUrl ? (
                <a href={document.sourceUrl} className="hover:underline" target="_blank" rel="noreferrer">
                  {document.title}
                </a>
              ) : (
                document.title
              )}
              <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                <span>{document.type}</span>
                <span>{documentFetchLabel(document.status)}</span>
                {document.pages ? <span>{document.pages} pp.</span> : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OutlinePanel({ versionCode }: { versionCode: string }) {
  const [sections, setSections] = useState<SectionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setSections(null);
    setError(null);
    setOpen(true);
    setPending(true);
    api<{ sections: SectionRow[] }>(`/versions/${versionCode}/sections`)
      .then((data) => {
        if (!cancelled) setSections(data.sections);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [versionCode]);

  const roots = (sections ?? []).filter((section) => section.depth <= 1);

  return (
    <section>
      <button
        type="button"
        className="flex items-center gap-1.5 text-sm font-medium hover:underline"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <Chevron open={open} className="size-3.5" />
        {pending ? "Loading outline…" : "Checklist outline"}
      </button>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
      {open && !pending && roots.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No sections extracted yet. Run extract on Ingest.</p>
      ) : null}
      {open && roots.length > 0 ? (
        <ul className="mt-2 space-y-0.5">
          {roots.map((section) => (
            <li
              key={section.id}
              className="text-sm text-muted-foreground"
              style={{ paddingLeft: `${Math.max(section.depth, 0) * 12}px` }}
            >
              {section.number ? <span className="font-mono text-xs">{section.number} </span> : null}
              {section.title}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Chevron({ open, className }: { open: boolean; className?: string }) {
  const Icon = open ? ChevronDown : ChevronRight;
  return <Icon className={cn("size-4 shrink-0 text-muted-foreground", className)} />;
}
