"use client";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageShell className="space-y-3">
      <p className="text-sm text-muted-foreground">Something went wrong</p>
      <h1 className="font-heading text-2xl font-medium">This page could not load.</h1>
      <p className="text-muted-foreground">{error.message}</p>
      <Button type="button" variant="outline" onClick={() => reset()}>
        Try again
      </Button>
    </PageShell>
  );
}
