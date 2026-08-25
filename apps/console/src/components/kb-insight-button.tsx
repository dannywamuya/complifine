"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function KbInsightButton({ disabled }: { disabled?: boolean }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    setError(null);
    try {
      const result = await api<{ text: string }>("/kb/insight", { method: "POST" });
      setText(result.text);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" size="sm" disabled={disabled || pending} onClick={() => void run()}>
        {pending ? "Writing…" : "Ask for an AI briefing"}
      </Button>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Briefing unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {text ? (
        <div className="max-w-3xl space-y-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {text}
        </div>
      ) : null}
    </div>
  );
}
