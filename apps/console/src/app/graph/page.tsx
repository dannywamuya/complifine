import Link from "next/link";
import { api } from "@/lib/api";
import { certScopeFromCookie } from "@/lib/scope-server";
import { scopeQuery } from "@/lib/scope";
import { KnowledgeGraph, type GraphPayload } from "@/components/knowledge-graph";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Map" };

export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<{ detail?: string }>;
}) {
  const params = await searchParams;
  const detail = params.detail === "sections" ? "sections" : "overview";
  const scope = await certScopeFromCookie();
  const query = [scopeQuery(scope), `detail=${detail}`].filter(Boolean).join("&");
  const data = await api<GraphPayload>(`/graph?${query}`);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div id="tour-graph" className="w-fit max-w-full space-y-2">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Knowledge</p>
          <h1 className="font-heading text-2xl font-medium">Map</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Same catalog as a graph: certification → edition → shared controls. Click a version to
            open it. For sources and outline, use the{" "}
            <Link href="/registry" className="underline underline-offset-4">
              catalog
            </Link>
            .
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant={detail === "overview" ? "default" : "outline"} size="sm" asChild>
            <Link href="/graph">Overview</Link>
          </Button>
          <Button variant={detail === "sections" ? "default" : "outline"} size="sm" asChild>
            <Link href="/graph?detail=sections">Sections</Link>
          </Button>
        </div>
      </div>
      <KnowledgeGraph data={data} />
    </div>
  );
}
