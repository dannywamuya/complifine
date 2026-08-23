"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">Published knowledge</p>
        <h1 className="font-heading text-3xl font-medium tracking-tight">Criteria</h1>
        <p className="mt-1 text-muted-foreground">
          Principles and criteria from the ingested editions. Open a row to read the official wording.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter</CardTitle>
          <CardDescription>
            {data ? `${data.total} in this edition` : "Loading the published checklist…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setSubmitted(q.trim());
            }}
          >
            <Input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Number or principle"
              className="w-full min-w-0 sm:max-w-64"
            />
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger className="w-40">
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
              <SelectTrigger className="w-48">
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
            <Button type="submit" variant="outline">
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      {loading || !data ? (
        <Skeleton className="h-96" />
      ) : (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[22%]">ID</TableHead>
                <TableHead className="w-[18%]">Level</TableHead>
                <TableHead>Principle</TableHead>
                <TableHead className="w-14">Page</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.requirements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
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
                        className="font-mono text-sm font-medium underline-offset-4 hover:underline"
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
        </Card>
      )}
    </div>
  );
}
