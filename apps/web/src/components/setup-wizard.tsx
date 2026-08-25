"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Tractor, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { usePublishedCatalog } from "@/lib/editions";
import {
  SITE_TYPE_HELP,
  SITE_TYPE_LABELS,
  ORG_CHANGED,
  type FarmOrg,
  type FarmSite,
  type OrgPayload,
} from "@/lib/farm";
import { markTourPending } from "@/lib/onboarding";
import { CreateOrgForm } from "@/components/create-org-form";
import { ScopingQuestionList, type ScopingQuestion } from "@/components/scoping-questions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const STEPS = ["Company", "Certifications", "Sites", "Questions"] as const;

export function SetupWizard({ initial }: { initial: OrgPayload }) {
  const router = useRouter();
  const catalog = usePublishedCatalog();
  const [org, setOrg] = useState(initial.organization);
  const [step, setStep] = useState(() => {
    if (!initial.organization) return 0;
    if (initial.scopes.length === 0) return 1;
    if (initial.sites.length === 0) return 2;
    return 3;
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedCodes, setSelectedCodes] = useState<string[]>(() =>
    initial.scopes.map((scope) => scope.code),
  );
  const [siteName, setSiteName] = useState(initial.sites[0]?.name ?? "");
  const [siteType, setSiteType] = useState(initial.sites[0]?.siteType ?? "farm");
  const [siteLocation, setSiteLocation] = useState(initial.sites[0]?.location ?? "");
  const [createdSiteId, setCreatedSiteId] = useState(initial.sites[0]?.id ?? "");
  const [questionGroups, setQuestionGroups] = useState<
    Array<{ code: string; label: string; questions: ScopingQuestion[] }>
  >([]);
  const [answers, setAnswers] = useState<Record<string, "yes" | "no" | "unanswered">>({});
  const [questionsLoading, setQuestionsLoading] = useState(false);

  const orderedSelected = useMemo(() => {
    const fromCatalog = catalog.standards.flatMap((standard) =>
      standard.versions.map((edition) => edition.value).filter((code) => selectedCodes.includes(code)),
    );
    return fromCatalog.length > 0 ? fromCatalog : selectedCodes;
  }, [catalog.standards, selectedCodes]);
  const selectedKey = orderedSelected.join(",");

  const labelFor = useCallback(
    (code: string) => {
      for (const standard of catalog.standards) {
        const match = standard.versions.find((version) => version.value === code);
        if (match) return match.label;
      }
      return code;
    },
    [catalog.standards],
  );

  useEffect(() => {
    if (step !== 3) return;
    if (orderedSelected.length === 0) {
      setQuestionGroups([]);
      setAnswers({});
      return;
    }
    let cancelled = false;
    setQuestionsLoading(true);
    setQuestionGroups([]);
    Promise.all(
      orderedSelected.map(async (code) => {
        const payload = await api<{ questions: ScopingQuestion[] }>(`/versions/${code}/applicability`).catch(
          () => ({ questions: [] as ScopingQuestion[] }),
        );
        return { code, label: labelFor(code), questions: payload.questions };
      }),
    )
      .then((groups) => {
        if (cancelled) return;
        const withQuestions = groups.filter((group) => group.questions.length > 0);
        setQuestionGroups(withQuestions);
        const ids = new Set(withQuestions.flatMap((group) => group.questions.map((question) => question.id)));
        setAnswers((current) => {
          const next: Record<string, "yes" | "no" | "unanswered"> = {};
          for (const [id, value] of Object.entries(current)) {
            if (ids.has(id)) next[id] = value;
          }
          return next;
        });
      })
      .finally(() => {
        if (!cancelled) setQuestionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, selectedKey, orderedSelected, labelFor]);

  const progress = Math.round(((step + 1) / STEPS.length) * 100);
  const questionCount = questionGroups.reduce((total, group) => total + group.questions.length, 0);
  const unanswered = questionGroups.flatMap((group) =>
    group.questions.filter((question) => answers[question.id] !== "yes" && answers[question.id] !== "no"),
  );

  async function saveCompanyStep() {
    setError(null);
    setStep(1);
  }

  async function saveCerts() {
    if (selectedCodes.length === 0) {
      setError("Choose at least one published certification. Chat will only cite these.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api("/org/scopes", {
        method: "POST",
        body: JSON.stringify({ versionCodes: selectedCodes, replace: true }),
      });
      setStep(2);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function saveSite() {
    const name = siteName.trim();
    if (!name) {
      setError("Name this site. That is the place scoping answers belong to.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      if (!createdSiteId) {
        const site = await api<FarmSite>("/sites", {
          method: "POST",
          body: JSON.stringify({
            name,
            siteType,
            location: siteLocation.trim() || undefined,
          }),
        });
        setCreatedSiteId(site.id);
      }
      setStep(3);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function finish() {
    if (questionCount > 0 && unanswered.length > 0) {
      setError(`Answer every question for this site (${unanswered.length} left).`);
      return;
    }
    setPending(true);
    setError(null);
    try {
      if (createdSiteId) {
        const filled = Object.entries(answers).filter(
          (entry): entry is [string, "yes" | "no"] => entry[1] === "yes" || entry[1] === "no",
        );
        if (filled.length > 0) {
          await api(`/sites/${createdSiteId}/answers`, {
            method: "POST",
            body: JSON.stringify({
              answers: filled.map(([questionId, answer]) => ({ questionId, answer })),
            }),
          });
        }
      }
      toast.success("Company setup saved");
      markTourPending();
      const payload = await api<OrgPayload>("/org");
      window.dispatchEvent(new CustomEvent(ORG_CHANGED, { detail: payload }));
      router.replace("/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8">
      <header className="space-y-2">
        <p className="text-lg text-muted-foreground">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </p>
        <h1 className="font-heading text-3xl font-medium tracking-tight text-balance sm:text-4xl">
          {step === 0 && "Your company"}
          {step === 1 && "Which certifications?"}
          {step === 2 && "Add a site"}
          {step === 3 && "What applies at this site?"}
        </h1>
        <p className="max-w-lg text-base leading-relaxed text-muted-foreground">
          {step === 0 &&
            "The company is the legal entity that holds certificates. Sites belong to it — they are not the same thing."}
          {step === 1 &&
            "Chat and the catalog will only cite the published editions you attach here. You can add more later."}
          {step === 2 &&
            "A site is a place this company operates. Choose a type: growing, packing, collection, or storage. Scoping answers are stored per site, because two sites often answer differently."}
          {step === 3 &&
            `Answer for ${siteName.trim() || "this site"}, not the whole company. Official questions are rephrased as “Do you…”.`}
        </p>
      </header>

      <Progress value={progress} />

      {step === 0 ? (
        org ? (
          <div className="space-y-6">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-[0_8px_28px_rgb(0_0_0/0.06)]">
              <p className="flex items-center gap-2 font-heading text-base font-medium tracking-tight">
                <Building2 className="size-4 text-primary" />
                {org.name}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {org.country}
                {org.sedexZc ? ` · Sedex ${org.sedexZc}` : ""}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                This name is the company. Next you will choose certifications, then add a site.
              </p>
            </div>
            <div className="flex justify-end">
              <Button className="rounded-full" onClick={() => void saveCompanyStep()}>
                Continue
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6 shadow-[0_8px_28px_rgb(0_0_0/0.06)]">
            <CreateOrgForm
              submitLabel="Save company"
              onCreated={async (created: FarmOrg) => {
                setOrg(created);
                setStep(1);
              }}
            />
          </div>
        )
      ) : null}

      {step === 1 ? (
        <div className="space-y-6">
          <div className="space-y-4">
            {catalog.loading ? (
              <p className="text-sm text-muted-foreground">Loading published editions…</p>
            ) : catalog.standards.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No published editions are live yet. An operator has to publish before you can attach
                them.
              </p>
            ) : (
              catalog.standards.map((standard) => (
                <div key={standard.code} className="space-y-2">
                  <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                    {standard.name}
                  </p>
                  <div className="grid gap-2">
                    {standard.versions.map((edition) => {
                      const on = selectedCodes.includes(edition.value);
                      return (
                        <button
                          key={edition.value}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setSelectedCodes((current) =>
                              on
                                ? current.filter((code) => code !== edition.value)
                                : [...current, edition.value],
                            )
                          }
                          className={cn(
                            "rounded-2xl border p-4 text-left shadow-sm transition-colors",
                            on
                              ? "border-primary/20 bg-primary/5 ring-2 ring-primary/20"
                              : "border-border bg-card hover:border-grey-olive-300 hover:bg-muted/80",
                          )}
                        >
                          <p className="font-heading text-sm font-medium tracking-tight">{edition.label}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {on ? "Attached to this company" : "Tap to attach"}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-between gap-2">
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button
              className="rounded-full"
              disabled={pending || catalog.standards.length === 0}
              onClick={() => void saveCerts()}
            >
              {pending ? "Saving…" : "Continue"}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-6">
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(SITE_TYPE_LABELS).map(([value, label]) => {
              const Icon = value === "packhouse" || value === "warehouse" ? Warehouse : Tractor;
              const on = siteType === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSiteType(value)}
                  className={cn(
                    "rounded-2xl border p-4 text-left shadow-sm transition-colors",
                    on
                      ? "border-primary/20 bg-primary/5 ring-2 ring-primary/20"
                      : "border-border bg-card hover:border-grey-olive-300 hover:bg-muted/80",
                  )}
                >
                  <p className="flex items-center gap-2 font-heading text-sm font-medium tracking-tight">
                    <Icon className="size-4 text-primary" />
                    {label}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {SITE_TYPE_HELP[value]}
                  </p>
                </button>
              );
            })}
          </div>
          <div className="space-y-3 rounded-2xl border border-border bg-card p-6">
            <div className="space-y-1.5">
              <Label htmlFor="setup-site-name">Site name</Label>
              <Input
                id="setup-site-name"
                value={siteName}
                onChange={(event) => setSiteName(event.target.value)}
                placeholder={
                  siteType === "packhouse"
                    ? "Naivasha packhouse"
                    : siteType === "warehouse"
                      ? "Mombasa warehouse"
                      : siteType === "collection_centre"
                        ? "Nakuru collection"
                        : "North field"
                }
                className="rounded-xl"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="setup-site-location">Location (optional)</Label>
              <Input
                id="setup-site-location"
                value={siteLocation}
                onChange={(event) => setSiteLocation(event.target.value)}
                placeholder="Naivasha"
                className="rounded-xl"
              />
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-between gap-2">
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button className="rounded-full" disabled={pending} onClick={() => void saveSite()}>
              {pending ? "Saving…" : "Continue"}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {questionGroups.length === 1
              ? `Questions for ${questionGroups[0]!.label}.`
              : questionGroups.length > 1
                ? "Questions for each certification you attached. Answers are stored on this site."
                : "Questions for the certifications you chose."}
          </p>
          {questionsLoading ? (
            <p className="text-sm text-muted-foreground">Loading questions…</p>
          ) : questionGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No scoping questions for these editions yet. You can finish setup and add answers later.
            </p>
          ) : (
            <div className="space-y-6">
              {questionGroups.map((group) => (
                <div key={group.code} className="space-y-3">
                  {questionGroups.length > 1 ? (
                    <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                      {group.label}
                    </p>
                  ) : null}
                  <ScopingQuestionList
                    questions={group.questions}
                    answers={answers}
                    onAnswer={(id, value) => setAnswers((current) => ({ ...current, [id]: value }))}
                  />
                </div>
              ))}
            </div>
          )}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => setStep(2)}>
              Back
            </Button>
            <div className="flex flex-wrap gap-2">
              {questionCount === 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  disabled={pending}
                  onClick={() => void finish()}
                >
                  Continue without questions
                </Button>
              ) : null}
              <Button
                className="rounded-full"
                disabled={pending || questionsLoading || (questionCount > 0 && unanswered.length > 0)}
                onClick={() => void finish()}
              >
                {pending ? "Saving…" : "Finish"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
