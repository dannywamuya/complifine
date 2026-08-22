"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DriftItem {
  slug: string;
  url: string;
  reason: string;
}

interface DriftReport {
  checked: number;
  changed: DriftItem[];
  unreachable: DriftItem[];
  undeclared: string[];
}

export default function WatchPage() {
  const [report, setReport] = useState<DriftReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    setError(null);
    try {
      setReport(await api<DriftReport>("/watch", { method: "POST" }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  const items = [
    ...(report?.changed ?? []).map((item) => ({ ...item, kind: "changed" })),
    ...(report?.unreachable ?? []).map((item) => ({ ...item, kind: "unreachable" })),
  ];

  return (
    <div className="space-y-6">
      <div id="tour-watch" className="w-fit max-w-full">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Publisher</p>
        <h1 className="font-heading text-2xl font-medium">Watch</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          HEAD every known URL and scrape the solution pages for documents the manifest does not
          list. New URLs are reported, never ingested.
        </p>
      </div>
      <Button type="button" onClick={() => void run()} disabled={pending}>
        {pending ? "Checking…" : "Check for drift"}
      </Button>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Watch failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {report ? (
        <>
          <p className="text-sm text-muted-foreground">{report.checked} documents checked</p>
          {items.length === 0 && report.undeclared.length === 0 ? (
            <Alert>
              <AlertTitle>Unchanged</AlertTitle>
              <AlertDescription>Every known document matches what we stored.</AlertDescription>
            </Alert>
          ) : null}
          {items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[22%]">Kind</TableHead>
                  <TableHead className="w-[28%]">Slug</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={`${item.kind}-${item.slug}`}>
                    <TableCell>
                      <Badge variant={item.kind === "unreachable" ? "destructive" : "outline"}>
                        {item.kind}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{item.slug}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
          {report.undeclared.length > 0 ? (
            <div>
              <h2 className="mb-2 text-sm font-medium">Undeclared URLs</h2>
              <ul className="space-y-1 font-mono text-xs text-muted-foreground">
                {report.undeclared.map((url) => (
                  <li key={url}>{url}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
