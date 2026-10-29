"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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

type AccountStatus = "pending" | "active" | "rejected" | "disabled";

interface CrmUser {
  id: string;
  email: string;
  name: string;
  accountStatus: AccountStatus;
  statusNote: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  organizationName: string | null;
}

const FILTERS: { value: "" | AccountStatus; label: string }[] = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "rejected", label: "Rejected" },
  { value: "disabled", label: "Disabled" },
];

export default function PeoplePage() {
  const [rows, setRows] = useState<CrmUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"" | AccountStatus>("pending");
  const [q, setQ] = useState("");
  const [emailTarget, setEmailTarget] = useState<CrmUser | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const qs = params.toString();
      setRows(await api<CrmUser[]>(`/crm/users${qs ? `?${qs}` : ""}`));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [status, q]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function setAccountStatus(id: string, next: AccountStatus, note?: string) {
    setBusyId(id);
    try {
      await api(`/crm/users/${id}/status`, {
        method: "POST",
        body: JSON.stringify({ status: next, note }),
      });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="w-fit max-w-full">
        <h1 className="font-heading text-2xl font-medium">People</h1>
        <p className="text-sm text-muted-foreground">
          Approve producer signups and email accounts from the console.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((filter) => (
          <Button
            key={filter.label}
            size="sm"
            variant={status === filter.value ? "default" : "outline"}
            onClick={() => setStatus(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
        <Input
          className="ml-auto w-56"
          placeholder="Search name, email, company"
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
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
            <TableHead>Signed up</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last login</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {new Date(row.createdAt).toLocaleString()}
              </TableCell>
              <TableCell>
                <div>{row.name}</div>
                <div className="text-xs text-muted-foreground">{row.email}</div>
              </TableCell>
              <TableCell>{row.organizationName ?? "—"}</TableCell>
              <TableCell>
                <Badge variant="outline">{row.accountStatus}</Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString() : "—"}
              </TableCell>
              <TableCell className="space-x-2 text-right">
                {row.accountStatus === "pending" ? (
                  <>
                    <Button
                      size="sm"
                      disabled={busyId === row.id}
                      onClick={() => void setAccountStatus(row.id, "active")}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === row.id}
                      onClick={() => void setAccountStatus(row.id, "rejected")}
                    >
                      Reject
                    </Button>
                  </>
                ) : null}
                {row.accountStatus === "active" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === row.id}
                    onClick={() => void setAccountStatus(row.id, "disabled")}
                  >
                    Disable
                  </Button>
                ) : null}
                {row.accountStatus === "disabled" || row.accountStatus === "rejected" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === row.id}
                    onClick={() => void setAccountStatus(row.id, "active")}
                  >
                    Re-enable
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => setEmailTarget(row)}>
                  Email
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {rows.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground">No accounts match this filter.</p>
      ) : null}

      <ComposeEmailDialog
        open={emailTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEmailTarget(null);
        }}
        to={emailTarget?.email ?? ""}
        title={emailTarget ? `Email ${emailTarget.name}` : "Send email"}
        onSend={async ({ subject, body }) => {
          if (!emailTarget) return;
          const result = await api<{ sent: boolean }>(`/crm/users/${emailTarget.id}/email`, {
            method: "POST",
            body: JSON.stringify({ subject, body }),
          });
          if (!result.sent) {
            setError("Message saved, but Resend is not configured so nothing was delivered.");
          }
        }}
      />
    </div>
  );
}
