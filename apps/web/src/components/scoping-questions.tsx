"use client";

import { toFirstPersonQuestion } from "@/lib/first-person";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

export interface ScopingQuestion {
  id: string;
  number: number;
  question: string;
  justification: string | null;
  exemptingAnswer: "yes" | "no";
  affected: number;
}

export const SCOPING_WHY =
  "These yes/no questions turn parts of the checklist on or off for your site, so Chat does not treat your packhouse like a field.";

export function ScopingQuestionList({
  questions,
  answers,
  onAnswer,
}: {
  questions: ScopingQuestion[];
  answers: Record<string, "yes" | "no" | "unanswered">;
  onAnswer: (questionId: string, value: "yes" | "no") => void;
}) {
  return (
    <div className="grid gap-3">
      {questions.map((question) => (
        <div key={question.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="font-heading text-sm font-medium tracking-tight">
            {question.number}. {toFirstPersonQuestion(question.question)}
          </p>
          {question.affected ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {question.affected} {question.affected === 1 ? "rule" : "rules"} depend on this
            </p>
          ) : null}
          <RadioGroup
            value={
              answers[question.id] === "yes" || answers[question.id] === "no"
                ? answers[question.id]
                : undefined
            }
            onValueChange={(value) => onAnswer(question.id, value as "yes" | "no")}
            className="mt-3 flex gap-2"
          >
            {(["yes", "no"] as const).map((value) => {
              const selected = answers[question.id] === value;
              return (
                <div key={value}>
                  <RadioGroupItem value={value} id={`${question.id}-${value}`} className="peer sr-only" />
                  <Label
                    htmlFor={`${question.id}-${value}`}
                    className={cn(
                      "inline-flex h-8 cursor-pointer items-center rounded-full border px-3 text-sm font-normal capitalize transition-colors",
                      selected
                        ? "border-primary/20 bg-primary/10 text-primary"
                        : "border-border bg-muted text-muted-foreground hover:bg-secondary",
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
  );
}
