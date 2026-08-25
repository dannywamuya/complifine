"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { VersionSelect, useScopedVersionState } from "@/components/version-select";
import { KbTrail } from "@/components/kb-trail";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Review {
  id: string;
  decision: string;
  reviewer: string;
  notes: string | null;
  createdAt: string;
}

interface VersionDetail {
  status: string;
  name: string;
  allowedNext: string[];
  guidance?: { headline: string; detail: string };
}

interface GateReport {
  passed: boolean;
  blockingFailures: number;
  advisoryFailures: number;
  results: Array<{
    gate: string;
    description: string;
    blocking: boolean;
    passed: boolean;
    expected: string | null;
    actual: string | null;
  }>;
}

function ReviewForm() {
  const searchParams = useSearchParams();
  const [version, setVersion] = useScopedVersionState(searchParams.get("version") ?? undefined);
  const [detail, setDetail] = useState<VersionDetail | null>(null);
  const [gates, setGates] = useState<GateReport | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewer, setReviewer] = useState("");
  const [decision, setDecision] = useState("approved");
  const [notes, setNotes] = useState("");
  const [promoteTo, setPromoteTo] = useState("");
  const [force, setForce] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function load(code: string) {
    const [rev, ver, gate] = await Promise.all([
      api<{ reviews: Review[] }>(`/versions/${code}/reviews`),
      api<VersionDetail>(`/versions/${code}`),
      api<GateReport>(`/versions/${code}/gates`),
    ]);
    setReviews(rev.reviews);
    setDetail(ver);
    setGates(gate);
    setPromoteTo(ver.allowedNext[0] ?? "");
    setConfirmPublish(false);
    setForce(false);
  }

  useEffect(() => {
    api<{ name: string }>("/auth/me")
      .then((me) => setReviewer((current) => current || me.name))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!version) return;
    load(version).catch((err: Error) => setError(err.message));
  }, [version]);

  async function submitReview(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api(`/versions/${version}/reviews`, {
        method: "POST",
        body: JSON.stringify({ reviewer, decision, notes: notes || undefined }),
      });
      setNotes("");
      await load(version);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function promote() {
    if (!promoteTo) return;
    if (promoteTo === "published" && !confirmPublish) {
      setConfirmPublish(true);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api(`/versions/${version}/promote`, {
        method: "POST",
        body: JSON.stringify({
          to: promoteTo,
          notes: notes || undefined,
          force: force || undefined,
        }),
      });
      await load(version);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  const blocking = gates?.results.filter((row) => row.blocking && !row.passed) ?? [];
  const lastApproval = reviews.find((review) => review.decision === "approved");
  const publishing = promoteTo === "published";

  return (
    <div className="space-y-6">
      <div id="tour-review" className="w-fit max-w-3xl space-y-2">
        <KbTrail
          items={[
            { href: "/registry", label: "Catalog" },
            ...(detail
              ? [{ href: `/registry?edition=${encodeURIComponent(version)}`, label: detail.name }]
              : []),
            { label: "Review" },
          ]}
        />
        <h1 className="font-heading text-2xl font-medium">Review and publish</h1>
        <p className="text-sm text-muted-foreground">
          Record a named decision, then promote. Producers and the agent only see an edition after
          a human promotes it to published.
        </p>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <VersionSelect value={version} onValueChange={setVersion} />
        {detail ? <StatusBadge status={detail.status} /> : null}
        <Button asChild variant="outline" size="sm">
          <Link href={`/gates?version=${version}`}>Gates</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/registry?edition=${encodeURIComponent(version)}`}>Catalog</Link>
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not save</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {detail?.guidance ? (
        <Card>
          <CardHeader>
            <CardDescription>Where this edition is</CardDescription>
            <CardTitle>{detail.guidance.headline}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{detail.guidance.detail}</CardContent>
        </Card>
      ) : null}

      {blocking.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>
            {gates?.blockingFailures} blocking gate{gates?.blockingFailures === 1 ? "" : "s"} failing
          </AlertTitle>
          <AlertDescription>
            Publishing is blocked until these pass, unless you force (that is audit-logged).{" "}
            <Link href={`/gates?version=${version}`} className="underline underline-offset-4">
              Open gates
            </Link>
            {blocking.slice(0, 3).map((row) => (
              <span key={row.gate} className="mt-1 block font-mono text-xs">
                {row.gate}: expected {row.expected ?? "—"}, actual {row.actual ?? "—"}
              </span>
            ))}
          </AlertDescription>
        </Alert>
      ) : gates && !gates.passed ? (
        <Alert>
          <AlertTitle>Advisory gate warnings</AlertTitle>
          <AlertDescription>
            Blocking gates passed. {gates.advisoryFailures} advisory check
            {gates.advisoryFailures === 1 ? "" : "s"} still fail.
          </AlertDescription>
        </Alert>
      ) : null}

      <form className="grid gap-3 rounded-xl ring-1 ring-foreground/10 p-4 sm:grid-cols-[1fr_12rem_1fr_auto]" onSubmit={submitReview}>
        <Input
          value={reviewer}
          onChange={(event) => setReviewer(event.target.value)}
          placeholder="Reviewer"
          required
        />
        <Select value={decision} onValueChange={setDecision}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="approved">approved</SelectItem>
            <SelectItem value="rejected">rejected</SelectItem>
            <SelectItem value="changes_requested">changes requested</SelectItem>
          </SelectContent>
        </Select>
        <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes" />
        <Button type="submit" disabled={pending || !reviewer}>
          Record review
        </Button>
      </form>

      {detail && detail.allowedNext.length > 0 ? (
        <Card>
          <CardHeader>
            <CardDescription>Promote</CardDescription>
            <CardTitle className="text-base">
              {publishing ? "Publish to producers" : `Next status: ${promoteTo || "choose"}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {publishing && !lastApproval ? (
              <p className="text-sm text-destructive">
                There is no approval on file. Record an approved review before publishing.
              </p>
            ) : null}
            {confirmPublish ? (
              <Alert>
                <AlertTitle>This makes the edition live</AlertTitle>
                <AlertDescription>
                  Web users and the agent will start citing {detail.name}. Retiring is the only way
                  to hide it again. Confirm only if you have read the gates and the review notes.
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Select
                value={promoteTo}
                onValueChange={(value) => {
                  setPromoteTo(value);
                  setConfirmPublish(false);
                }}
              >
                <SelectTrigger className="w-full min-w-0 max-w-44">
                  <SelectValue placeholder="Next status" />
                </SelectTrigger>
                <SelectContent>
                  {detail.allowedNext.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant={publishing ? "default" : "outline"}
                disabled={pending || !promoteTo}
                onClick={() => void promote()}
              >
                {confirmPublish && publishing ? "Confirm publish" : publishing ? "Publish…" : "Promote"}
              </Button>
              {confirmPublish ? (
                <Button type="button" variant="ghost" onClick={() => setConfirmPublish(false)}>
                  Cancel
                </Button>
              ) : null}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={force}
                onChange={(event) => setForce(event.target.checked)}
              />
              Skip gate check (audit-logged; recovery only)
            </label>
          </CardContent>
        </Card>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[22%]">When</TableHead>
            <TableHead className="w-[18%]">Reviewer</TableHead>
            <TableHead className="w-[16%]">Decision</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reviews.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground">
                No reviews recorded yet.
              </TableCell>
            </TableRow>
          ) : (
            reviews.map((review) => (
              <TableRow key={review.id}>
                <TableCell className="text-muted-foreground">
                  {new Date(review.createdAt).toLocaleString()}
                </TableCell>
                <TableCell>{review.reviewer}</TableCell>
                <TableCell>
                  <Badge variant={review.decision === "approved" ? "default" : "secondary"}>
                    {review.decision}
                  </Badge>
                </TableCell>
                <TableCell>{review.notes ?? "—"}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading review…</p>}>
      <ReviewForm />
    </Suspense>
  );
}
