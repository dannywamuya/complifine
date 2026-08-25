import { api } from "@/lib/api";
import { certScopeFromCookie } from "@/lib/scope-server";
import { scopeQuery } from "@/lib/scope";
import { RegistryExplorer, type RegistryTreePayload } from "@/components/registry-tree";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Catalog" };

export default async function RegistryPage({
  searchParams,
}: {
  searchParams: Promise<{ edition?: string; standard?: string }>;
}) {
  const params = await searchParams;
  const scope = await certScopeFromCookie();
  const qs = scopeQuery(scope);
  const data = await api<RegistryTreePayload>(`/registry${qs ? `?${qs}` : ""}`);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div id="tour-registry" className="w-fit max-w-3xl space-y-2">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Knowledge</p>
          <h1 className="font-heading text-2xl font-medium">Catalog</h1>
          <p className="text-sm text-muted-foreground">
            Certification → edition → sources. Pick a node on the left. Live editions are what
            producers and the agent can cite; everything else stays here until a human publishes it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/ingest">Sync registry</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/graph">Map</Link>
          </Button>
        </div>
      </div>
      <RegistryExplorer
        data={data}
        initialEdition={params.edition}
        initialStandard={params.standard}
      />
    </div>
  );
}
