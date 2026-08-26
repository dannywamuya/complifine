"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { CardComponentProps } from "nextstepjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useNarrowViewport } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

function useDockAwayFromTarget(selector: string | undefined, enabled: boolean): "top" | "bottom" {
  const [edge, setEdge] = useState<"top" | "bottom">("bottom");

  useEffect(() => {
    if (!enabled) return;

    function place() {
      if (!selector) {
        setEdge("bottom");
        return;
      }
      const el = document.querySelector(selector);
      if (!el) {
        setEdge("bottom");
        return;
      }
      const rect = el.getBoundingClientRect();
      setEdge(rect.top + rect.height / 2 > window.innerHeight * 0.45 ? "top" : "bottom");
    }

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [selector, enabled]);

  return edge;
}

export function OnboardingCard({
  step,
  currentStep,
  totalSteps,
  nextStep,
  prevStep,
  skipTour,
  arrow,
}: CardComponentProps) {
  const narrow = useNarrowViewport();
  const dock = useDockAwayFromTarget(step.selector, narrow);
  const last = currentStep === totalSteps - 1;

  const card = (
    <Card
      className={cn(
        "relative z-10 flex max-h-[min(48svh,22rem)] flex-col overflow-hidden shadow-lg",
        narrow
          ? "w-full"
          : "max-h-none w-[min(26rem,calc(100vw-2rem))] overflow-visible",
      )}
    >
      <CardHeader className="shrink-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base leading-snug">
          {step.icon ? <span className="text-lg leading-none">{step.icon}</span> : null}
          {step.title}
        </CardTitle>
        <CardDescription>
          {currentStep + 1} of {totalSteps}
        </CardDescription>
      </CardHeader>
      <CardContent
        className={cn(
          "min-h-0 overflow-y-auto overscroll-contain text-sm leading-relaxed text-muted-foreground",
          narrow ? "max-h-none" : "max-h-[min(50vh,22rem)]",
        )}
      >
        {step.content}
      </CardContent>
      {narrow ? null : arrow}
      <CardFooter className="shrink-0 flex-wrap justify-between gap-2 bg-transparent">
        <Button variant="ghost" size="sm" onClick={skipTour} disabled={!skipTour}>
          Skip
        </Button>
        <div className="flex gap-2">
          {currentStep > 0 ? (
            <Button variant="outline" size="sm" onClick={prevStep}>
              Back
            </Button>
          ) : null}
          <Button size="sm" onClick={nextStep}>
            {last ? "Done" : "Next"}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );

  if (!narrow || typeof document === "undefined") return card;

  return createPortal(
    <div
      data-onboarding-sheet=""
      className={cn(
        "pointer-events-auto fixed inset-x-3 z-[1100] mx-auto w-auto max-w-lg",
        dock === "top"
          ? "top-[max(0.75rem,env(safe-area-inset-top))]"
          : "bottom-[max(0.75rem,env(safe-area-inset-bottom))]",
      )}
    >
      {card}
    </div>,
    document.body,
  );
}
