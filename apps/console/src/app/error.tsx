"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Error</p>
      <h1 className="font-heading text-2xl font-medium">The console could not load this page.</h1>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <Button type="button" variant="outline" onClick={() => reset()}>
        Retry
      </Button>
    </div>
  );
}
