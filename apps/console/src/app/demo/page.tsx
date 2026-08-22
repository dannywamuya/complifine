"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

  const refresh = useCallback(async () => {
    try {
      setRows(await api<DemoRequest[]>("/demo-requests"));
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
        <p className="text-sm text-muted-foreground">Inbound Book a Demo form from the public site.</p>
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
              <TableCell>{row.company}</TableCell>
              <TableCell>{row.interests}</TableCell>
              <TableCell>
                <Badge variant="outline">{row.status}</Badge>
              </TableCell>
              <TableCell className="space-x-2">
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
    </div>
  );
}
