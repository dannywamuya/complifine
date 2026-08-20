"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { EDITIONS } from "@/lib/editions";
import { LevelBadge } from "@/components/level-badge";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/page-shell";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  exclusions: Array<{
    criterion: string;
    level: string;
    reason: string;
    question: string;
  }>;
  note: string;
}

export default function ScopePage() {
  const [version, setVersion] = useState("ifa-v6-smart-fv");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, "yes" | "no">>({});
  const [result, setResult] = useState<Resolution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setResult(null);
    api<{ questions: Question[] }>(`/versions/${version}/applicability`)
      .then((data) => setQuestions(data.questions))
      .catch((err: Error) => setError(err.message));
  }, [version]);

  async function resolve() {
    setPending(true);
    setError(null);
    try {
      const payload = Object.entries(answers).map(([number, answer]) => ({
        questionNumber: Number(number),
        answer,
      }));
      setResult(
        await api<Resolution>(`/versions/${version}/scope`, {
          method: "POST",
          body: JSON.stringify({ answers: payload }),
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <PageShell className="space-y-6">
      <div className="max-w-2xl">
        <p className="text-sm text-muted-foreground">Applicability</p>
        <h1 className="font-heading text-3xl font-medium tracking-tight">My farm</h1>
        <p className="mt-2 text-muted-foreground">
          These are GLOBALG.A.P.&apos;s own scoping questions from the official checklist. Answering
          them does not change the standard; it hides criteria that the publisher says do not
          apply.
        </p>
      </div>
      <Select value={version} onValueChange={setVersion}>
        <SelectTrigger className="w-full max-w-52 min-w-0">
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
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not resolve</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-3">
        {questions.map((question) => (
          <Card key={question.id} size="sm">
            <CardHeader>
              <CardTitle className="text-sm">
                {question.number}. {question.question}
              </CardTitle>
              <CardDescription>
                Exempting answer: {question.exemptingAnswer} · {question.affected} criteria
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-4">
              {(["yes", "no"] as const).map((value) => (
                <Label key={value} className="flex items-center gap-2 text-sm font-normal">
                  <input
                    type="radio"
                    name={`q-${question.number}`}
                    checked={answers[question.number] === value}
                    onChange={() =>
                      setAnswers((current) => ({ ...current, [question.number]: value }))
                    }
                  />
                  {value}
                </Label>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
      <Button type="button" onClick={() => void resolve()} disabled={pending}>
        {pending ? "Resolving…" : "Show applicable checklist"}
      </Button>
      {result ? (
        <div className="space-y-4">
          <p className="text-sm">
            <span className="font-medium">{result.applicable} applicable</span>
            <span className="text-muted-foreground"> · {result.excluded} excluded</span>
          </p>
          <p className="text-sm text-muted-foreground">{result.note}</p>
          {result.exclusions.length > 0 ? (
            <ul className="space-y-2">
              {result.exclusions.map((exclusion) => (
                <li key={exclusion.criterion} className="flex flex-wrap items-baseline gap-2 text-sm">
                  <span className="font-mono font-medium">{exclusion.criterion}</span>
                  <LevelBadge level={exclusion.level} />
                  <span className="text-muted-foreground">{exclusion.reason}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No criteria were excluded.</p>
          )}
        </div>
      ) : null}
    </PageShell>
  );
}
