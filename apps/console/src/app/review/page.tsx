"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { EDITIONS } from "@/lib/editions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  allowedNext: string[];
}

function ReviewForm() {
  const searchParams = useSearchParams();
  const [version, setVersion] = useState(searchParams.get("version") ?? "ifa-v6-smart-fv");
  const [detail, setDetail] = useState<VersionDetail | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewer, setReviewer] = useState("");
  const [decision, setDecision] = useState("approved");
  const [notes, setNotes] = useState("");
  const [promoteTo, setPromoteTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function load(code: string) {
    const [rev, ver] = await Promise.all([
      api<{ reviews: Review[] }>(`/versions/${code}/reviews`),
      api<VersionDetail>(`/versions/${code}`),
    ]);
    setReviews(rev.reviews);
    setDetail(ver);
    setPromoteTo(ver.allowedNext[0] ?? "");
  }

  useEffect(() => {
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
    setPending(true);
    setError(null);
    try {
      await api(`/versions/${version}/promote`, {
        method: "POST",
        body: JSON.stringify({ to: promoteTo, actor: reviewer || "console" }),
      });
      await load(version);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Governance</p>
        <h1 className="font-heading text-2xl font-medium">Review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Status: <Badge variant="secondary">{detail?.status ?? "…"}</Badge>
        </p>
      </div>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <form className="flex min-w-0 flex-wrap gap-2" onSubmit={submitReview}>
        <Select value={version} onValueChange={setVersion}>
          <SelectTrigger className="w-full min-w-0 max-w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EDITIONS.map((edition) => (
              <SelectItem key={edition.value} value={edition.value}>
                {edition.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={reviewer}
          onChange={(event) => setReviewer(event.target.value)}
          placeholder="Reviewer"
          required
          className="w-full min-w-0 max-w-40"
        />
        <Select value={decision} onValueChange={setDecision}>
          <SelectTrigger className="w-full min-w-0 max-w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="approved">approved</SelectItem>
            <SelectItem value="rejected">rejected</SelectItem>
            <SelectItem value="changes_requested">changes requested</SelectItem>
          </SelectContent>
        </Select>
        <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes" className="w-full min-w-0 max-w-56" />
        <Button type="submit" disabled={pending || !reviewer}>
          Record review
        </Button>
      </form>
      {detail && detail.allowedNext.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={promoteTo} onValueChange={setPromoteTo}>
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
          <Button type="button" variant="outline" disabled={pending || !promoteTo} onClick={() => void promote()}>
            Promote
          </Button>
        </div>
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
          {reviews.map((review) => (
            <TableRow key={review.id}>
              <TableCell className="text-muted-foreground">
                {new Date(review.createdAt).toLocaleString()}
              </TableCell>
              <TableCell>{review.reviewer}</TableCell>
              <TableCell>
                <Badge variant="secondary">{review.decision}</Badge>
              </TableCell>
              <TableCell>{review.notes ?? "—"}</TableCell>
            </TableRow>
          ))}
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
