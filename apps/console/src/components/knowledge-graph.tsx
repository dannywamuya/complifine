"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

export type GraphKind = "standard" | "version" | "control" | "section";

export interface GraphNode {
  id: string;
  kind: GraphKind;
  code: string;
  label: string;
  subtitle?: string;
  standardCode?: string;
  status?: string;
  requirements?: number;
  versions?: number;
  versionCode?: string;
}

export interface GraphEdge {
  id: string;
  kind: "belongs" | "related" | "satisfies" | "section_of";
  from: string;
  to: string;
  type?: string;
  count?: number;
}

export interface GraphPayload {
  detail: string;
  standards: Array<{ code: string; name: string; publisher: string }>;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const COL_X: Record<GraphKind, number> = {
  standard: 32,
  version: 300,
  control: 568,
  section: 836,
};

const NODE_W = 236;
const NODE_H = 70;
const GAP_Y = 18;
const TOP = 28;

const KIND_LABEL: Record<GraphKind, string> = {
  standard: "Certification",
  version: "Version",
  control: "Control",
  section: "Section",
};

function hueFor(code: string): string {
  let hash = 0;
  for (const char of code) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 42% 58%)`;
}

interface LaidOut extends GraphNode {
  x: number;
  y: number;
}

function layout(nodes: GraphNode[]): { placed: LaidOut[]; width: number; height: number } {
  const groups: Record<GraphKind, GraphNode[]> = {
    standard: [],
    version: [],
    control: [],
    section: [],
  };
  for (const node of nodes) groups[node.kind].push(node);

  const placed: LaidOut[] = [];
  let maxY = TOP;

  for (const kind of ["standard", "version", "control", "section"] as const) {
    let y = TOP;
    for (const node of groups[kind]) {
      placed.push({ ...node, x: COL_X[kind], y });
      y += NODE_H + GAP_Y;
    }
    maxY = Math.max(maxY, y);
  }

  const kindsPresent = (Object.keys(groups) as GraphKind[]).filter((kind) => groups[kind].length > 0);
  const last = kindsPresent[kindsPresent.length - 1] ?? "standard";
  return {
    placed,
    width: COL_X[last] + NODE_W + 48,
    height: Math.max(maxY + 24, 280),
  };
}

function pathFor(from: LaidOut, to: LaidOut): string {
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const cx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
}

export function KnowledgeGraph({ data }: { data: GraphPayload }) {
  const router = useRouter();
  const [hover, setHover] = useState<string | null>(null);
  const { placed, width, height } = useMemo(() => layout(data.nodes), [data.nodes]);
  const byId = useMemo(() => new Map(placed.map((node) => [node.id, node])), [placed]);

  const neighborIds = useMemo(() => {
    if (!hover) return new Set<string>();
    const ids = new Set<string>([hover]);
    for (const edge of data.edges) {
      if (edge.from === hover) ids.add(edge.to);
      if (edge.to === hover) ids.add(edge.from);
    }
    return ids;
  }, [hover, data.edges]);

  const stats = {
    standards: data.nodes.filter((node) => node.kind === "standard").length,
    versions: data.nodes.filter((node) => node.kind === "version").length,
    controls: data.nodes.filter((node) => node.kind === "control").length,
    sections: data.nodes.filter((node) => node.kind === "section").length,
    links: data.edges.filter((edge) => edge.kind === "related" || edge.kind === "satisfies").length,
    requirements: data.nodes
      .filter((node) => node.kind === "version")
      .reduce((sum, node) => sum + (node.requirements ?? 0), 0),
  };

  function open(node: GraphNode) {
    if (node.kind === "version") router.push(`/versions/${node.code}`);
    if (node.kind === "section" && node.versionCode) {
      router.push(`/criteria?version=${encodeURIComponent(node.versionCode)}`);
    }
  }

  if (data.nodes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing in scope. Ingest a certification, or widen the filter.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{stats.standards} certs</Badge>
        <Badge variant="secondary">{stats.versions} versions</Badge>
        <Badge variant="secondary">{stats.requirements} requirements</Badge>
        {stats.controls ? <Badge variant="secondary">{stats.controls} controls</Badge> : null}
        {stats.sections ? <Badge variant="secondary">{stats.sections} sections</Badge> : null}
        <Badge variant="outline">{stats.links} cross-links</Badge>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {(Object.keys(KIND_LABEL) as GraphKind[])
          .filter((kind) => data.nodes.some((node) => node.kind === kind))
          .map((kind) => (
            <span key={kind} className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-sm border"
                style={{ background: kind === "standard" ? hueFor("legend") : undefined }}
              />
              {KIND_LABEL[kind]}
            </span>
          ))}
        <span>Solid = belongs · Dashed = related or shared control</span>
      </div>
      <div className="overflow-auto rounded-xl border bg-card">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="min-w-full"
          role="img"
          aria-label="Knowledge base graph"
        >
          <title>Certifications, versions, controls and relationships</title>
          {data.edges.map((edge) => {
            const from = byId.get(edge.from);
            const to = byId.get(edge.to);
            if (!from || !to) return null;
            const active = !hover || neighborIds.has(edge.from) || neighborIds.has(edge.to);
            const dashed = edge.kind === "related" || edge.kind === "satisfies";
            return (
              <path
                key={edge.id}
                d={pathFor(from, to)}
                fill="none"
                stroke="currentColor"
                strokeWidth={edge.kind === "related" ? 2 : 1.25}
                strokeDasharray={dashed ? "5 4" : undefined}
                className={active ? "text-muted-foreground/80" : "text-muted-foreground/15"}
              />
            );
          })}
          {placed.map((node) => {
            const dimmed = hover !== null && !neighborIds.has(node.id);
            const accent = node.kind === "standard" ? hueFor(node.code) : hueFor(node.standardCode ?? node.subtitle ?? node.code);
            const clickable = node.kind === "version" || node.kind === "section";
            return (
              <g
                key={node.id}
                transform={`translate(${node.x} ${node.y})`}
                className={clickable ? "cursor-pointer" : undefined}
                opacity={dimmed ? 0.28 : 1}
                onMouseEnter={() => setHover(node.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => open(node)}
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={10}
                  className="fill-background stroke-border"
                  strokeWidth={hover === node.id ? 2 : 1}
                  style={{ stroke: hover === node.id ? accent : undefined }}
                />
                <rect width={6} height={NODE_H} rx={3} fill={accent} />
                <text x={18} y={22} className="fill-muted-foreground" fontSize={10}>
                  {KIND_LABEL[node.kind]}
                </text>
                <text x={18} y={40} className="fill-foreground" fontSize={13} fontWeight={600}>
                  {truncate(node.label, 28)}
                </text>
                <text x={18} y={58} className="fill-muted-foreground" fontSize={10}>
                  {node.kind === "version"
                    ? `${node.requirements ?? 0} requirements · ${node.subtitle}`
                    : node.kind === "section"
                      ? `${node.requirements ?? 0} criteria`
                      : node.subtitle ?? node.code}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {hover ? (
        <HoverCard node={byId.get(hover)} edges={data.edges} />
      ) : (
        <p className="text-xs text-muted-foreground">
          Hover a node to see how it connects. Click a version to open it, or a section to list its criteria.
        </p>
      )}
    </div>
  );
}

function HoverCard({
  node,
  edges,
}: {
  node: LaidOut | undefined;
  edges: GraphEdge[];
}) {
  if (!node) return null;
  const links = edges.filter((edge) => edge.from === node.id || edge.to === node.id);
  return (
    <p className="text-sm text-muted-foreground">
      <span className="font-medium text-foreground">{node.label}</span>
      {node.kind === "version" ? (
        <>
          {" "}
          ·{" "}
          <Link className="underline" href={`/versions/${node.code}`}>
            open version
          </Link>
        </>
      ) : null}
      <span className="ml-2 font-mono text-xs">
        {links.length} connection{links.length === 1 ? "" : "s"}
        {links
          .filter((edge) => edge.kind === "related")
          .map((edge) => ` · ${edge.type} ×${edge.count}`)
          .join("")}
      </span>
    </p>
  );
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
