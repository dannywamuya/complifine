"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Tractor, Warehouse } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { usePublishedCatalog } from "@/lib/editions";
import { SITE_TYPE_HELP, SITE_TYPE_LABELS, ORG_CHANGED, type FarmSite, type OrgPayload } from "@/lib/farm";
import { CreateOrgForm } from "@/components/create-org-form";
import { ScopingQuestionList, type ScopingQuestion } from "@/components/scoping-questions";
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

interface Resolution {
  applicable: number;
  excluded: number;
  byLevel: Record<string, number>;
  exclusions: Array<{ criterion: string; level: string; reason: string; question: string }>;
  note: string;
}

export default function CompanyPage() {
  const router = useRouter();
  const [data, setData] = useState<OrgPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [siteId, setSiteId] = useState("");
  const [version, setVersion] = useState("");
  const [questions, setQuestions] = useState<ScopingQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, "yes" | "no" | "unanswered">>({});
  const [result, setResult] = useState<Resolution | null>(null);
  const [pending, setPending] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [scopeCode, setScopeCode] = useState("");
  const [tab, setTab] = useState("sites");
  const catalog = usePublishedCatalog();
  const editions = catalog.editions;

  const refresh = useCallback(async () => {
    const payload = await api<OrgPayload>("/org");
    setData(payload);
    setSiteId((current) => current || payload.sites[0]?.id || "");
    window.dispatchEvent(new CustomEvent(ORG_CHANGED, { detail: payload }));
    return payload;
  }, []);

  useEffect(() => {
    const preferred = data?.scopes[0]?.code ?? editions[0]?.value;
    if (!preferred) return;
    setVersion((current) => current || preferred);
    setScopeCode((current) => current || preferred);
  }, [data, editions]);

  useEffect(() => {
    refresh().catch((err) => {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    });
  }, [refresh]);

  useEffect(() => {
    if (!version) return;
    let cancelled = false;
    setQuestions([]);
    api<{ questions: ScopingQuestion[] }>(`/versions/${version}/applicability`)
      .then((payload) => {
        if (!cancelled) setQuestions(payload.questions);
      })
      .catch(() => {
        if (!cancelled) setQuestions([]);
      });
    return () => {
      cancelled = true;
    };
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
  const scopedEditions =
    data?.scopes.length ? data.scopes.map((scope) => ({ value: scope.code, label: scope.name })) : editions;
  const attachedCodes = new Set(data?.scopes.map((scope) => scope.code) ?? []);
  const addableEditions = editions.filter((edition) => !attachedCodes.has(edition.value));

  async function attachCertification(code: string) {
    await api("/org/scopes", {
      method: "POST",
      body: JSON.stringify({ versionCode: code }),
    });
    const payload = await refresh();
    setVersion(code);
    const applicability = await api<{ questions: ScopingQuestion[] }>(`/versions/${code}/applicability`).catch(
      () => ({ questions: [] as ScopingQuestion[] }),
    );
    if (applicability.questions.length === 0) {
      toast.success("Certification attached. This edition has no scoping questions.");
      return;
    }
    if (payload.sites.length === 0) {
      setTab("sites");
      toast.success("Certification attached. Add a site, then answer what applies there.");
      return;
    }
    setTab("applicability");
    toast.success(
      payload.sites.length === 1
        ? "Certification attached. Answer what applies at this site."
        : "Certification attached. Answer what applies at each site.",
    );
  }

  async function saveOneAnswer(questionId: string, answer: "yes" | "no") {
    if (!siteId) return;
    setAnswers((current) => ({ ...current, [questionId]: answer }));
    try {
      await api(`/sites/${siteId}/answers`, {
        method: "POST",
        body: JSON.stringify({ answers: [{ questionId, answer }] }),
      });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (error && !data) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <Alert>
          <AlertTitle>Company</AlertTitle>
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
          <p className="text-lg text-muted-foreground">Company</p>
          <h1 className="font-heading text-3xl font-medium tracking-tight text-balance sm:text-4xl">
            Name the company
          </h1>
          <p className="max-w-lg text-base leading-relaxed text-muted-foreground">
            The company is the legal entity that holds certificates. Sites belong to it — growing,
            packing, or storage — and you will add those next.
          </p>
        </header>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[0_8px_28px_rgb(0_0_0/0.06)]">
          <CreateOrgForm
            submitLabel="Save company"
            onCreated={async () => {
              toast.success("Company saved");
              router.push("/app/setup");
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <header className="w-fit max-w-full space-y-2" id="tour-company">
        <p className="text-lg text-muted-foreground">Company</p>
        <h1 className="font-heading text-3xl font-medium tracking-tight text-balance sm:text-4xl">
          {data.organization.name}
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
          {data.organization.country}
          {data.organization.sedexZc ? ` · Sedex ${data.organization.sedexZc}` : ""}
          {" · "}
          The company holds certifications. Sites sit under it. Chat uses both.
        </p>
      </header>

      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <TabsList id="tour-company-tabs" className="h-10 w-fit max-w-full rounded-full bg-muted p-1">
          <TabsTrigger value="sites" className="rounded-full px-4">
            Sites
          </TabsTrigger>
          <TabsTrigger value="scope" className="rounded-full px-4">
            Certifications
          </TabsTrigger>
          <TabsTrigger value="applicability" className="rounded-full px-4">
            Site questions
          </TabsTrigger>
          <TabsTrigger value="organisation" className="rounded-full px-4">
            Company
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sites" className="mt-0 space-y-4">
          <div id="tour-company-sites" className="flex w-fit max-w-full items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {data.sites.length === 0
                ? "Add the sites this company operates. A site is a place — not the company itself."
                : `${data.sites.length} site${data.sites.length === 1 ? "" : "s"}`}
            </p>
            <AddSiteDialog
              open={addOpen}
              onOpenChange={setAddOpen}
              onCreated={async (site) => {
                const payload = await refresh();
                setSiteId(site.id);
                toast.success("Site added. Answer what applies for the certifications in scope.");
                if (payload.scopes.length > 0) {
                  setVersion((current) => current || payload.scopes[0]!.code);
                  setTab("applicability");
                }
              }}
            />
          </div>
          {data.sites.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/60 px-6 py-12 text-center">
              <p className="font-heading text-base font-medium tracking-tight">No sites yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Pick a type: growing, packing, collection, or storage. Scoping questions are answered
                per site, so two sites can differ.
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
                        : "border-border bg-card hover:border-grey-olive-300 hover:bg-muted/80",
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
          <div className="rounded-2xl border border-border bg-card p-6 shadow-[0_8px_28px_rgb(0_0_0/0.04)]">
            <div className="mb-5 space-y-1">
              <h2 className="font-heading text-base font-medium tracking-tight">Certifications</h2>
              <p className="text-sm text-muted-foreground">
                Published editions this company is certified against or preparing for. Chat cites only
                these.
              </p>
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
              {addableEditions.length === 0 ? (
                <p className="text-sm text-muted-foreground">All published editions are already in scope.</p>
              ) : (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!scopeCode) return;
                  setPending(true);
                  try {
                    await attachCertification(scopeCode);
                    setScopeCode("");
                  } catch (err) {
                    toast.error((err as Error).message);
                  } finally {
                    setPending(false);
                  }
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="versionCode">Add a version</Label>
                  <Select value={scopeCode} onValueChange={setScopeCode}>
                    <SelectTrigger id="versionCode" className="w-56 rounded-full" size="sm">
                      <SelectValue placeholder="Choose a version" />
                    </SelectTrigger>
                    <SelectContent>
                      {addableEditions.map((edition) => (
                        <SelectItem key={edition.value} value={edition.value}>
                          {edition.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" variant="outline" size="sm" className="rounded-full" disabled={pending || !scopeCode}>
                  {pending ? "Adding…" : "Add to scope"}
                </Button>
              </form>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="applicability" className="mt-0 space-y-4">
          {data.sites.length === 0 ? (
            <Alert>
              <AlertTitle>Add a site first</AlertTitle>
              <AlertDescription>
                These questions belong to a site, not to the company as a whole.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="rounded-2xl border border-border bg-card p-6 shadow-[0_8px_28px_rgb(0_0_0/0.04)]">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <h2 className="font-heading text-base font-medium tracking-tight">
                      Questions for this site
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Answer as “you” for {selected?.name ?? "this site"} (
                      {selected ? (SITE_TYPE_LABELS[selected.siteType] ?? selected.siteType) : "site"}
                      ). Two sites under the same company can answer differently.
                      {questions.length > 0 && answered < questions.length
                        ? ` ${questions.length - answered} left for this edition.`
                        : ""}
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
                        {scopedEditions.map((edition) => (
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

              <ScopingQuestionList
                questions={questions}
                answers={answers}
                onAnswer={(id, value) => void saveOneAnswer(id, value)}
              />

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
                <div className="rounded-2xl border border-border bg-card p-6 shadow-[0_8px_28px_rgb(0_0_0/0.04)]">
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
          <div className="rounded-2xl border border-border bg-card p-6 shadow-[0_8px_28px_rgb(0_0_0/0.04)]">
            <div className="mb-5 space-y-1">
              <h2 className="font-heading text-base font-medium tracking-tight">Company</h2>
              <p className="text-sm text-muted-foreground">
                The legal entity. Sites are listed under Sites. Sedex ZC is a platform identifier, not
                a standard.
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
                  toast.success("Company saved");
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
                Save company
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
            <DialogDescription>
              A site is a place this company operates. The company holds the certificates; the site is
              where work happens.
            </DialogDescription>
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
              <p className="text-xs leading-relaxed text-muted-foreground">{SITE_TYPE_HELP[siteType]}</p>
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
