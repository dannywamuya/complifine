"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { EDITIONS } from "@/lib/editions";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LevelBadge } from "@/components/level-badge";

interface Site {
  id: string;
  name: string;
  siteType: string;
  location: string | null;
}

interface Scope {
  id: string;
  code: string;
  name: string;
  edition: string;
}

interface Question {
  id: string;
  number: number;
  question: string;
  justification: string | null;
  exemptingAnswer: "yes" | "no";
  affected: number;
}

interface Resolution {
  applicable: number;
  excluded: number;
  byLevel: Record<string, number>;
  exclusions: Array<{ criterion: string; level: string; reason: string; question: string }>;
  note: string;
}

interface OrgPayload {
  organization: { id: string; name: string; country: string; sedexZc: string | null };
  sites: Site[];
  scopes: Scope[];
  role: string;
}

export default function FarmPage() {
  const [data, setData] = useState<OrgPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [siteId, setSiteId] = useState<string>("");
  const [version, setVersion] = useState("ifa-v6-smart-fv");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, "yes" | "no" | "unanswered">>({});
  const [result, setResult] = useState<Resolution | null>(null);
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const payload = await api<OrgPayload>("/org");
      setData(payload);
      setSiteId((current) => current || payload.sites[0]?.id || "");
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "Sign in to manage your farm." : (err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    api<{ questions: Question[] }>(`/versions/${version}/applicability`)
      .then((payload) => setQuestions(payload.questions))
      .catch(() => setQuestions([]));
  }, [version]);

  useEffect(() => {
    if (!siteId) return;
    api<{ answers: Array<{ questionId: string; answer: "yes" | "no" | "unanswered" }> }>(`/sites/${siteId}`)
      .then((payload) => {
        const next: Record<string, "yes" | "no" | "unanswered"> = {};
        for (const row of payload.answers) next[row.questionId] = row.answer;
        setAnswers(next);
        setResult(null);
      })
      .catch(() => undefined);
  }, [siteId]);

  if (error && !data) {
    return (
      <PageShell className="space-y-4 pt-8">
        <Alert>
          <AlertTitle>Farm profile</AlertTitle>
          <AlertDescription>
            {error}{" "}
            <Link href="/login" className="underline">
              Sign in
            </Link>
            {" · "}
            <Link href="/signup" className="underline">
              Create an account
            </Link>
          </AlertDescription>
        </Alert>
      </PageShell>
    );
  }

  if (!data) {
    return (
      <PageShell className="pt-8">
        <p className="text-sm text-muted-foreground">Loading farm profile…</p>
      </PageShell>
    );
  }

  return (
    <PageShell className="space-y-8">
      <div>
        <p className="text-sm text-muted-foreground">Your organisation</p>
        <h1 className="font-heading text-3xl font-medium tracking-tight">{data.organization.name}</h1>
        <p className="mt-2 text-muted-foreground">
          Sites, certification scope and saved scoping answers. The agent reads this profile when you
          ask what applies to a named farm or packhouse.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Organisation</CardTitle>
          <CardDescription>Country and optional Sedex ZC. Sedex is the platform, not a standard.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setPending(true);
              try {
                await api("/org", {
                  method: "POST",
                  body: JSON.stringify({
                    name: String(form.get("name") ?? ""),
                    country: String(form.get("country") ?? ""),
                    sedexZc: String(form.get("sedexZc") ?? ""),
                  }),
                });
                await refresh();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setPending(false);
              }
            }}
          >
            <Input name="name" defaultValue={data.organization.name} />
            <Input name="country" defaultValue={data.organization.country} />
            <Input name="sedexZc" placeholder="ZC…" defaultValue={data.organization.sedexZc ?? ""} />
            <Button type="submit" disabled={pending} className="sm:col-span-3 w-fit">
              Save organisation
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Certification scope</CardTitle>
          <CardDescription>Which published versions this company is pursuing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {data.scopes.length === 0
              ? "None selected yet."
              : data.scopes.map((scope) => scope.name).join(" · ")}
          </p>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              await api("/org/scopes", {
                method: "POST",
                body: JSON.stringify({ versionCode: String(form.get("versionCode") ?? "") }),
              });
              await refresh();
            }}
          >
            <select name="versionCode" className="h-9 rounded-md border bg-transparent px-3 text-sm">
              {EDITIONS.map((edition) => (
                <option key={edition.value} value={edition.value}>
                  {edition.label}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline" size="sm">
              Add to scope
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sites</CardTitle>
          <CardDescription>Farms, packhouses and other locations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-1 text-sm">
            {data.sites.map((site) => (
              <li key={site.id}>
                <button
                  type="button"
                  className={site.id === siteId ? "font-medium underline" : "text-muted-foreground"}
                  onClick={() => setSiteId(site.id)}
                >
                  {site.name} · {site.siteType}
                  {site.location ? ` · ${site.location}` : ""}
                </button>
              </li>
            ))}
          </ul>
          <form
            className="grid gap-2 sm:grid-cols-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const created = await api<Site>("/sites", {
                method: "POST",
                body: JSON.stringify({
                  name: String(form.get("name") ?? ""),
                  siteType: String(form.get("siteType") ?? "farm"),
                  location: String(form.get("location") ?? "") || undefined,
                }),
              });
              await refresh();
              setSiteId(created.id);
              event.currentTarget.reset();
            }}
          >
            <Input name="name" placeholder="Site name" required />
            <select name="siteType" className="h-9 rounded-md border bg-transparent px-3 text-sm">
              <option value="farm">Farm</option>
              <option value="packhouse">Packhouse</option>
              <option value="collection_centre">Collection centre</option>
              <option value="warehouse">Warehouse</option>
            </select>
            <Input name="location" placeholder="Location" />
            <Button type="submit" variant="outline">
              Add site
            </Button>
          </form>
        </CardContent>
      </Card>

      {siteId ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label>Scoping answers for this site</Label>
              <p className="text-sm text-muted-foreground">Saved against the site, then used by the agent.</p>
            </div>
            <select
              value={version}
              onChange={(event) => setVersion(event.target.value)}
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
            >
              {EDITIONS.map((edition) => (
                <option key={edition.value} value={edition.value}>
                  {edition.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3">
            {questions.map((question) => (
              <Card key={question.id} size="sm">
                <CardHeader>
                  <CardTitle className="text-sm">
                    {question.number}. {question.question}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex gap-4">
                  {(["yes", "no"] as const).map((value) => (
                    <Label key={value} className="flex items-center gap-2 text-sm font-normal">
                      <input
                        type="radio"
                        name={`q-${question.id}`}
                        checked={answers[question.id] === value}
                        onChange={() =>
                          setAnswers((current) => ({ ...current, [question.id]: value }))
                        }
                      />
                      {value}
                    </Label>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={async () => {
                setPending(true);
                setError(null);
                try {
                  await api(`/sites/${siteId}/answers`, {
                    method: "POST",
                    body: JSON.stringify({
                      answers: Object.entries(answers).map(([questionId, answer]) => ({
                        questionId,
                        answer,
                      })),
                    }),
                  });
                  setResult(
                    await api<Resolution>(`/sites/${siteId}/resolution?versionCode=${version}`),
                  );
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setPending(false);
                }
              }}
              disabled={pending}
            >
              {pending ? "Saving…" : "Save answers and resolve"}
            </Button>
          </div>
          {result ? (
            <div className="space-y-3">
              <p className="text-sm">
                <span className="font-medium">{result.applicable} applicable</span>
                <span className="text-muted-foreground"> · {result.excluded} excluded</span>
              </p>
              <p className="text-sm text-muted-foreground">{result.note}</p>
              {result.exclusions.map((exclusion) => (
                <p key={exclusion.criterion} className="flex flex-wrap items-baseline gap-2 text-sm">
                  <span className="font-mono">{exclusion.criterion}</span>
                  <LevelBadge level={exclusion.level} />
                  <span className="text-muted-foreground">{exclusion.reason}</span>
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </PageShell>
  );
}
