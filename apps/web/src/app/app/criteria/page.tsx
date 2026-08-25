"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import { EDITIONS } from "@/lib/editions";
import { LevelBadge } from "@/components/level-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { CriteriaTableSkeleton } from "@/components/app-skeletons";

interface Listing {
  total: number;
  requirements: Array<{
    id: string;
    criterion: string;
    level: string;
    principle: string;
    page: number | null;
  }>;
}

export default function AppCriteriaPage() {
  const router = useRouter();
  const [version, setVersion] = useState("ifa-v6-smart-fv");
  const [level, setLevel] = useState("all");
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [data, setData] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const query = new URLSearchParams();
    if (submitted) query.set("q", submitted);
    if (level !== "all") query.set("level", level);
    query.set("limit", "80");
    setLoading(true);
    api<Listing>(`/versions/${version}/requirements?${query}`)
      .then(setData)
      .catch(() => setData({ total: 0, requirements: [] }))
      .finally(() => setLoading(false));
  }, [version, level, submitted]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <header className="space-y-2">
        <p className="text-lg text-muted-foreground">Published knowledge</p>
        <h1 className="font-heading text-3xl font-medium tracking-tight text-balance sm:text-4xl">
          Criteria
        </h1>
        <p className="max-w-lg text-base leading-relaxed text-muted-foreground">
          Principles and criteria from the ingested editions. Open a row to read the official wording.
        </p>
      </header>

      <form
        className="flex flex-col gap-3 rounded-[1.75rem] border border-border bg-card p-3 shadow-[0_8px_28px_rgb(0_0_0/0.06)] sm:flex-row sm:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(q.trim());
        }}
      >
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <span className="sr-only">Number or principle</span>
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Number or principle"
            className="h-10 rounded-full border-0 bg-muted pl-9 shadow-none focus-visible:bg-card"
          />
        </label>
        <Select value={level} onValueChange={setLevel}>
          <SelectTrigger className="h-10 w-full rounded-full sm:w-40" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            <SelectItem value="major_must">Major Must</SelectItem>
            <SelectItem value="minor_must">Minor Must</SelectItem>
            <SelectItem value="recommendation">Recommendation</SelectItem>
          </SelectContent>
        </Select>
        <Select value={version} onValueChange={setVersion}>
          <SelectTrigger className="h-10 w-full rounded-full sm:w-48" size="sm">
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
        <Button type="submit" className="h-10 rounded-full px-4">
          Search
        </Button>
      </form>

      {loading || !data ? (
        <CriteriaTableSkeleton />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {data.total} in this edition
            {submitted ? ` · matching “${submitted}”` : ""}
          </p>
          <div className="overflow-hidden rounded-2xl border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[22%] bg-muted/80">ID</TableHead>
                  <TableHead className="w-[18%] bg-muted/80">Level</TableHead>
                  <TableHead className="bg-muted/80">Principle</TableHead>
                  <TableHead className="w-14 bg-muted/80">Page</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.requirements.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className="h-40 text-center text-muted-foreground">
                      No criteria match those filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.requirements.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/app/criteria/${encodeURIComponent(row.criterion)}`)}
                    >
                      <TableCell>
                        <Link
                          className="font-mono text-sm font-medium text-primary underline-offset-4 hover:underline"
                          href={`/app/criteria/${encodeURIComponent(row.criterion)}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {row.criterion}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <LevelBadge level={row.level} />
                      </TableCell>
                      <TableCell className="min-w-0">{row.principle}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.page ? `p.${row.page}` : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
