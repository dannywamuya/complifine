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
import { FarmPageSkeleton } from "@/components/app-skeletons";
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
  const [scopeCode, setScopeCode] = useState<string>(EDITIONS[0]?.value ?? "");

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
      <div className="mx-auto w-full max-w-4xl">
        <Alert>
          <AlertTitle>Farm profile</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!data) {
    return <FarmPageSkeleton />;
  }

  if (!data.organization) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-8">
        <header className="space-y-2">
          <p className="text-lg text-muted-foreground">Farm management</p>
          <h1 className="font-heading text-3xl font-medium tracking-tight text-balance sm:text-4xl">
            Create your farm profile
          </h1>
          <p className="max-w-lg text-base leading-relaxed text-muted-foreground">
            The assistant uses this organisation to name your sites and keep answers in scope.
          </p>
        </header>
        <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-[0_8px_28px_rgb(0_0_0/0.06)]">
          <CreateOrgForm
            onCreated={async () => {
              await refresh();
              toast.success("Farm profile created");
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <header className="space-y-2">
        <p className="text-lg text-muted-foreground">Farm management</p>
        <h1 className="font-heading text-3xl font-medium tracking-tight text-balance sm:text-4xl">
          {data.organization.name}
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
          {data.organization.country}
          {data.organization.sedexZc ? ` · Sedex ${data.organization.sedexZc}` : ""}
          {" · "}
          Sites, certification scope and scoping answers the assistant reads by name.
        </p>
      </header>

      <Tabs defaultValue="sites" className="gap-6">
        <TabsList className="h-10 rounded-full bg-zinc-100 p-1">
          <TabsTrigger value="sites" className="rounded-full px-4">
            Sites
          </TabsTrigger>
          <TabsTrigger value="scope" className="rounded-full px-4">
            Scope
          </TabsTrigger>
          <TabsTrigger value="applicability" className="rounded-full px-4">
            Applicability
          </TabsTrigger>
          <TabsTrigger value="organisation" className="rounded-full px-4">
            Organisation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sites" className="mt-0 space-y-4">
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
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/60 px-6 py-12 text-center">
              <p className="font-heading text-base font-medium tracking-tight">No sites yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
                A named site is what lets you ask “what applies in Naivasha?”
              </p>
            </div>
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
                      "rounded-2xl border p-4 text-left shadow-sm transition-colors",
                      active
                        ? "border-primary/20 bg-primary/5 ring-2 ring-primary/20"
                        : "border-zinc-100 bg-white hover:border-zinc-200 hover:bg-zinc-50/80",
                    )}
                  >
                    <p className="flex items-center gap-2 font-heading text-sm font-medium tracking-tight">
                      <Icon className="size-4 text-primary" />
                      {site.name}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {SITE_TYPE_LABELS[site.siteType] ?? site.siteType}
                      {site.location ? ` · ${site.location}` : ""}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="scope" className="mt-0">
          <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-[0_8px_28px_rgb(0_0_0/0.04)]">
            <div className="mb-5 space-y-1">
              <h2 className="font-heading text-base font-medium tracking-tight">Certification scope</h2>
              <p className="text-sm text-muted-foreground">Published versions this company is pursuing.</p>
            </div>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {data.scopes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None selected yet.</p>
                ) : (
                  data.scopes.map((scope) => (
                    <Badge key={scope.id} variant="secondary" className="h-7 rounded-full px-3">
                      {scope.name}
                    </Badge>
                  ))
                )}
              </div>
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!scopeCode) return;
                  await api("/org/scopes", {
                    method: "POST",
                    body: JSON.stringify({ versionCode: scopeCode }),
                  });
                  await refresh();
                  toast.success("Scope updated");
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="versionCode">Add a version</Label>
                  <Select value={scopeCode} onValueChange={setScopeCode}>
                    <SelectTrigger id="versionCode" className="w-56 rounded-full" size="sm">
                      <SelectValue placeholder="Choose a version" />
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
                <Button type="submit" variant="outline" size="sm" className="rounded-full">
                  Add to scope
                </Button>
              </form>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="applicability" className="mt-0 space-y-4">
          {data.sites.length === 0 ? (
            <Alert>
              <AlertTitle>Add a site first</AlertTitle>
              <AlertDescription>Scoping answers are stored per site, not per company.</AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-[0_8px_28px_rgb(0_0_0/0.04)]">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <h2 className="font-heading text-base font-medium tracking-tight">Scoping questionnaire</h2>
                    <p className="text-sm text-muted-foreground">
                      Saved against {selected?.name ?? "this site"}, then used when you ask what applies.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Select value={siteId} onValueChange={setSiteId}>
                      <SelectTrigger className="w-44 rounded-full" size="sm">
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
                      <SelectTrigger className="w-48 rounded-full" size="sm">
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
                </div>
                <div className="mt-5 space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {answered} of {questions.length} answered
                    </span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} />
                </div>
              </div>

              <div className="grid gap-3">
                {questions.map((question) => (
                  <div
                    key={question.id}
                    className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm"
                  >
                    <p className="font-heading text-sm font-medium tracking-tight">
                      {question.number}. {question.question}
                    </p>
                    {question.affected ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {question.affected} criteria depend on this answer
                      </p>
                    ) : null}
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
                      className="mt-3 flex gap-2"
                    >
                      {(["yes", "no"] as const).map((value) => {
                        const selectedAnswer = answers[question.id] === value;
                        return (
                          <div key={value}>
                            <RadioGroupItem
                              value={value}
                              id={`${question.id}-${value}`}
                              className="peer sr-only"
                            />
                            <Label
                              htmlFor={`${question.id}-${value}`}
                              className={cn(
                                "inline-flex h-8 cursor-pointer items-center rounded-full border px-3 text-sm font-normal capitalize transition-colors",
                                selectedAnswer
                                  ? "border-primary/20 bg-primary/10 text-primary"
                                  : "border-zinc-200 bg-zinc-50 text-muted-foreground hover:bg-zinc-100",
                              )}
                            >
                              {value}
                            </Label>
                          </div>
                        );
                      })}
                    </RadioGroup>
                  </div>
                ))}
              </div>

              <Button
                type="button"
                className="rounded-full"
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
                <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-[0_8px_28px_rgb(0_0_0/0.04)]">
                  <h2 className="font-heading text-base font-medium tracking-tight">Resolved checklist</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{result.note}</p>
                  <p className="mt-4 text-sm">
                    <span className="font-medium">{result.applicable} applicable</span>
                    <span className="text-muted-foreground"> · {result.excluded} excluded</span>
                  </p>
                  <div className="mt-3 space-y-2">
                    {result.exclusions.map((exclusion) => (
                      <p key={exclusion.criterion} className="flex flex-wrap items-baseline gap-2 text-sm">
                        <span className="font-mono">{exclusion.criterion}</span>
                        <LevelBadge level={exclusion.level} />
                        <span className="text-muted-foreground">{exclusion.reason}</span>
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </TabsContent>

        <TabsContent value="organisation" className="mt-0">
          <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-[0_8px_28px_rgb(0_0_0/0.04)]">
            <div className="mb-5 space-y-1">
              <h2 className="font-heading text-base font-medium tracking-tight">Organisation</h2>
              <p className="text-sm text-muted-foreground">
                Country and optional Sedex ZC. Sedex is the platform, not a standard.
              </p>
            </div>
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
                <Input id="org-name" name="name" className="rounded-xl" defaultValue={data.organization.name} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="org-country">Country</Label>
                <Input id="org-country" name="country" className="rounded-xl" defaultValue={data.organization.country} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="org-sedex">Sedex ZC</Label>
                <Input
                  id="org-sedex"
                  name="sedexZc"
                  placeholder="ZC…"
                  className="rounded-xl"
                  defaultValue={data.organization.sedexZc ?? ""}
                />
              </div>
              <Button type="submit" disabled={pending} className="w-fit rounded-full">
                Save organisation
              </Button>
            </form>
          </div>
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
  const [siteType, setSiteType] = useState("farm");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setSiteType("farm");
        onOpenChange(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="rounded-full">
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
                  siteType,
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
              <Select value={siteType} onValueChange={setSiteType}>
                <SelectTrigger id="site-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SITE_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

