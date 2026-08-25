"use client";

import type { CardComponentProps } from "nextstepjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function OnboardingCard({
  step,
  currentStep,
  totalSteps,
  nextStep,
  prevStep,
  skipTour,
  arrow,
}: CardComponentProps) {
  const last = currentStep === totalSteps - 1;

  return (
    <Card className="relative z-10 w-[min(22rem,calc(100vw-2.5rem))] max-w-[calc(100vw-2.5rem)] overflow-visible shadow-lg">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {step.icon ? <span className="text-lg leading-none">{step.icon}</span> : null}
          {step.title}
        </CardTitle>
        <CardDescription>
          {currentStep + 1} of {totalSteps}
        </CardDescription>
      </CardHeader>
      <CardContent className="max-h-[min(38svh,16rem)] overflow-y-auto text-sm leading-relaxed text-muted-foreground">
        {step.content}
      </CardContent>
      {arrow}
      <CardFooter className="justify-between gap-2 bg-transparent">
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
}
