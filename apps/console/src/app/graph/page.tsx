import Link from "next/link";
import { api } from "@/lib/api";
import { certScopeFromCookie } from "@/lib/scope-server";
import { scopeQuery } from "@/lib/scope";
import { KnowledgeGraph, type GraphPayload } from "@/components/knowledge-graph";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Graph" };

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
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Knowledge base
          </p>
          <h1 className="font-heading text-2xl font-medium">Graph</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Certifications on the left, their published versions, then the controls that
            satisfy requirements across them. The header filter changes what is in view.
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
