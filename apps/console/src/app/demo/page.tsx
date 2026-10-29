"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ComposeEmailDialog } from "@/components/compose-email-dialog";

interface DemoRequest {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string | null;
  interests: string;
  message: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
}

export default function DemoInboxPage() {
  const [rows, setRows] = useState<DemoRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [emailTarget, setEmailTarget] = useState<DemoRequest | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [savingNotes, setSavingNotes] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api<DemoRequest[]>("/demo-requests");
      setRows(next);
      setNotesDraft(Object.fromEntries(next.map((row) => [row.id, row.notes ?? ""])));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-6">
      <div id="tour-demo" className="w-fit max-w-full">
        <h1 className="font-heading text-2xl font-medium">Demo requests</h1>
        <p className="text-sm text-muted-foreground">
          Inbound Book a Demo form from the public site.
        </p>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Interest</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap align-top text-muted-foreground">
                {new Date(row.createdAt).toLocaleString()}
              </TableCell>
              <TableCell className="align-top">
                <div>{row.name}</div>
                <div className="text-xs text-muted-foreground">{row.email}</div>
                {row.message ? (
                  <p className="mt-2 max-w-xs text-xs text-muted-foreground">{row.message}</p>
                ) : null}
              </TableCell>
              <TableCell className="align-top">{row.company}</TableCell>
              <TableCell className="align-top">{row.interests}</TableCell>
              <TableCell className="align-top">
                <Badge variant="outline">{row.status}</Badge>
              </TableCell>
              <TableCell className="align-top">
                <Textarea
                  className="min-w-[12rem]"
                  rows={2}
                  value={notesDraft[row.id] ?? ""}
                  onChange={(event) =>
                    setNotesDraft((prev) => ({ ...prev, [row.id]: event.target.value }))
                  }
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-1"
                  disabled={savingNotes === row.id || (notesDraft[row.id] ?? "") === (row.notes ?? "")}
                  onClick={async () => {
                    setSavingNotes(row.id);
                    try {
                      await api(`/demo-requests/${row.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ notes: notesDraft[row.id] || null }),
                      });
                      await refresh();
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setSavingNotes(null);
                    }
                  }}
                >
                  {savingNotes === row.id ? "Saving…" : "Save notes"}
                </Button>
              </TableCell>
              <TableCell className="space-x-2 align-top whitespace-nowrap">
                <Button size="sm" variant="ghost" onClick={() => setEmailTarget(row)}>
                  Email
                </Button>
                {row.status === "new" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await api(`/demo-requests/${row.id}/status`, {
                        method: "POST",
                        body: JSON.stringify({ status: "contacted" }),
                      });
                      await refresh();
                    }}
                  >
                    Mark contacted
                  </Button>
                ) : null}
                {row.status !== "closed" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await api(`/demo-requests/${row.id}/status`, {
                        method: "POST",
                        body: JSON.stringify({ status: "closed" }),
                      });
                      await refresh();
                    }}
                  >
                    Close
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground">No demo requests yet.</p>
      ) : null}

      <ComposeEmailDialog
        open={emailTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEmailTarget(null);
        }}
        to={emailTarget?.email ?? ""}
        title={emailTarget ? `Email ${emailTarget.name}` : "Send email"}
        defaultSubject="CompliFine demo"
        onSend={async ({ subject, body }) => {
          if (!emailTarget) return;
          const result = await api<{ sent: boolean }>(`/demo-requests/${emailTarget.id}/email`, {
            method: "POST",
            body: JSON.stringify({ subject, body }),
          });
          await refresh();
          if (!result.sent) {
            setError("Message saved, but Resend is not configured so nothing was delivered.");
          }
        }}
      />
    </div>
  );
}
