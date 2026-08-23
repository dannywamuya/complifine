"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Tractor, Warehouse } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { EDITIONS } from "@/lib/editions";
import { SITE_TYPE_LABELS, type FarmSite, type OrgPayload } from "@/lib/farm";
import { CreateOrgForm } from "@/components/create-org-form";
import { LevelBadge } from "@/components/level-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

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

export default function FarmPage() {
  const [data, setData] = useState<OrgPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [siteId, setSiteId] = useState("");
  const [version, setVersion] = useState("ifa-v6-smart-fv");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, "yes" | "no" | "unanswered">>({});
  const [result, setResult] = useState<Resolution | null>(null);
  const [pending, setPending] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const refresh = useCallback(async () => {
    const payload = await api<OrgPayload>("/org");
    setData(payload);
    setSiteId((current) => current || payload.sites[0]?.id || "");
    return payload;
  }, []);

  useEffect(() => {
    refresh().catch((err) => {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    });
  }, [refresh]);

  useEffect(() => {
    api<{ questions: Question[] }>(`/versions/${version}/applicability`)
      .then((payload) => setQuestions(payload.questions))
      .catch(() => setQuestions([]));
  }, [version]);

  useEffect(() => {
    if (!siteId) return;
    api<{ answers: Array<{ questionId: string; answer: "yes" | "no" | "unanswered" }> }>(
      `/sites/${siteId}`,
    )
      .then((payload) => {
        const next: Record<string, "yes" | "no" | "unanswered"> = {};
        for (const row of payload.answers) next[row.questionId] = row.answer;
        setAnswers(next);
        setResult(null);
      })
      .catch(() => undefined);
  }, [siteId]);

  const answered = useMemo(
    () => questions.filter((q) => answers[q.id] === "yes" || answers[q.id] === "no").length,
    [answers, questions],
  );
  const progress = questions.length ? Math.round((answered / questions.length) * 100) : 0;
  const selected = data?.sites.find((site) => site.id === siteId);

  if (error && !data) {
    return (
      <Alert>
        <AlertTitle>Farm profile</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!data.organization) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-6">
        <div>
          <p className="text-sm text-muted-foreground">Farm management</p>
          <h1 className="font-heading text-3xl font-medium tracking-tight">Create your farm profile</h1>
          <p className="mt-1 text-muted-foreground">
            The assistant uses this organisation to name your sites and keep answers in scope.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Organisation</CardTitle>
            <CardDescription>Company name and country. Sedex ZC is optional.</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateOrgForm
              onCreated={async () => {
                await refresh();
                toast.success("Farm profile created");
              }}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">Farm management</p>
        <h1 className="font-heading text-3xl font-medium tracking-tight">{data.organization.name}</h1>
        <p className="mt-1 text-muted-foreground">
          {data.organization.country}
          {data.organization.sedexZc ? ` · Sedex ${data.organization.sedexZc}` : ""}
          {" · "}
          Sites, certification scope and scoping answers the assistant reads by name.
        </p>
      </div>

      <Tabs defaultValue="sites">
        <TabsList variant="line">
          <TabsTrigger value="sites">Sites</TabsTrigger>
          <TabsTrigger value="scope">Scope</TabsTrigger>
          <TabsTrigger value="applicability">Applicability</TabsTrigger>
          <TabsTrigger value="organisation">Organisation</TabsTrigger>
        </TabsList>

        <TabsContent value="sites" className="mt-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {data.sites.length === 0
                ? "Add the farms and packhouses this company operates."
                : `${data.sites.length} location${data.sites.length === 1 ? "" : "s"}`}
            </p>
            <AddSiteDialog
              open={addOpen}
              onOpenChange={setAddOpen}
              onCreated={async (site) => {
                await refresh();
                setSiteId(site.id);
                toast.success("Site added");
              }}
            />
          </div>
          {data.sites.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No sites yet</CardTitle>
                <CardDescription>A named site is what lets you ask “what applies in Naivasha?”</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {data.sites.map((site) => {
                const Icon = site.siteType === "packhouse" || site.siteType === "warehouse" ? Warehouse : Tractor;
                const active = site.id === siteId;
                return (
                  <button
                    key={site.id}
                    type="button"
                    onClick={() => setSiteId(site.id)}
                    className={cn(
                      "rounded-xl text-left transition-colors",
                      active && "ring-2 ring-ring",
                    )}
                  >
                    <Card size="sm" className="h-full">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Icon className="size-4 text-muted-foreground" />
                          {site.name}
                        </CardTitle>
                        <CardDescription>
                          {SITE_TYPE_LABELS[site.siteType] ?? site.siteType}
                          {site.location ? ` · ${site.location}` : ""}
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  </button>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="scope" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Certification scope</CardTitle>
              <CardDescription>Published versions this company is pursuing.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {data.scopes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None selected yet.</p>
                ) : (
                  data.scopes.map((scope) => (
                    <Badge key={scope.id} variant="secondary">
                      {scope.name}
                    </Badge>
                  ))
                )}
              </div>
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  await api("/org/scopes", {
                    method: "POST",
                    body: JSON.stringify({ versionCode: String(form.get("versionCode") ?? "") }),
                  });
                  await refresh();
                  toast.success("Scope updated");
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="versionCode">Add a version</Label>
                  <select
                    id="versionCode"
                    name="versionCode"
                    className="flex h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
                  >
                    {EDITIONS.map((edition) => (
                      <option key={edition.value} value={edition.value}>
                        {edition.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" variant="outline" size="sm">
                  Add to scope
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="applicability" className="mt-6 space-y-4">
          {data.sites.length === 0 ? (
            <Alert>
              <AlertTitle>Add a site first</AlertTitle>
              <AlertDescription>Scoping answers are stored per site, not per company.</AlertDescription>
            </Alert>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Scoping questionnaire</CardTitle>
                  <CardDescription>
                    Saved against {selected?.name ?? "this site"}, then used when you ask what applies.
                  </CardDescription>
                  <CardAction>
                    <div className="flex flex-wrap gap-2">
                      <Select value={siteId} onValueChange={setSiteId}>
                        <SelectTrigger className="w-44" size="sm">
                          <SelectValue placeholder="Site" />
                        </SelectTrigger>
                        <SelectContent>
                          {data.sites.map((site) => (
                            <SelectItem key={site.id} value={site.id}>
                              {site.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={version} onValueChange={setVersion}>
                        <SelectTrigger className="w-48" size="sm">
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
                    </div>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {answered} of {questions.length} answered
                    </span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} />
                </CardContent>
              </Card>

              <div className="grid gap-3">
                {questions.map((question) => (
                  <Card key={question.id} size="sm">
                    <CardHeader>
                      <CardTitle>
                        {question.number}. {question.question}
                      </CardTitle>
                      {question.affected ? (
                        <CardDescription>{question.affected} criteria depend on this answer</CardDescription>
                      ) : null}
                    </CardHeader>
                    <CardContent>
                      <RadioGroup
                        value={
                          answers[question.id] === "yes" || answers[question.id] === "no"
                            ? answers[question.id]
                            : undefined
                        }
                        onValueChange={(value) =>
                          setAnswers((current) => ({
                            ...current,
                            [question.id]: value as "yes" | "no",
                          }))
                        }
                        className="flex gap-6"
                      >
                        {(["yes", "no"] as const).map((value) => (
                          <div key={value} className="flex items-center gap-2">
                            <RadioGroupItem value={value} id={`${question.id}-${value}`} />
                            <Label htmlFor={`${question.id}-${value}`} className="font-normal capitalize">
                              {value}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Button
                type="button"
                disabled={pending || !siteId}
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
                    toast.success("Answers saved");
                  } catch (err) {
                    setError((err as Error).message);
                    toast.error((err as Error).message);
                  } finally {
                    setPending(false);
                  }
                }}
              >
                {pending ? "Saving…" : "Save answers and resolve"}
              </Button>

              {result ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Resolved checklist</CardTitle>
                    <CardDescription>{result.note}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm">
                      <span className="font-medium">{result.applicable} applicable</span>
                      <span className="text-muted-foreground"> · {result.excluded} excluded</span>
                    </p>
                    {result.exclusions.map((exclusion) => (
                      <p key={exclusion.criterion} className="flex flex-wrap items-baseline gap-2 text-sm">
                        <span className="font-mono">{exclusion.criterion}</span>
                        <LevelBadge level={exclusion.level} />
                        <span className="text-muted-foreground">{exclusion.reason}</span>
                      </p>
                    ))}
                  </CardContent>
                </Card>
              ) : null}
            </>
          )}
        </TabsContent>

        <TabsContent value="organisation" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Organisation</CardTitle>
              <CardDescription>Country and optional Sedex ZC. Sedex is the platform, not a standard.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-4 sm:grid-cols-3"
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
                    toast.success("Organisation saved");
                  } catch (err) {
                    toast.error((err as Error).message);
                  } finally {
                    setPending(false);
                  }
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="org-name">Name</Label>
                  <Input id="org-name" name="name" defaultValue={data.organization.name} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="org-country">Country</Label>
                  <Input id="org-country" name="country" defaultValue={data.organization.country} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="org-sedex">Sedex ZC</Label>
                  <Input id="org-sedex" name="sedexZc" placeholder="ZC…" defaultValue={data.organization.sedexZc ?? ""} />
                </div>
                <Button type="submit" disabled={pending} className="w-fit">
                  Save organisation
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AddSiteDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (site: FarmSite) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus />
          Add site
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setPending(true);
            try {
              const created = await api<FarmSite>("/sites", {
                method: "POST",
                body: JSON.stringify({
                  name: String(form.get("name") ?? ""),
                  siteType: String(form.get("siteType") ?? "farm"),
                  location: String(form.get("location") ?? "") || undefined,
                }),
              });
              await onCreated(created);
              onOpenChange(false);
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setPending(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Add a site</DialogTitle>
            <DialogDescription>Farms, packhouses and other locations this company operates.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="site-name">Name</Label>
              <Input id="site-name" name="name" required placeholder="Naivasha packhouse" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="site-type">Type</Label>
              <select
                id="site-type"
                name="siteType"
                defaultValue="farm"
                className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
              >
                <option value="farm">Farm</option>
                <option value="packhouse">Packhouse</option>
                <option value="collection_centre">Collection centre</option>
                <option value="warehouse">Warehouse</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="site-location">Location</Label>
              <Input id="site-location" name="location" placeholder="Naivasha" />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add site"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

