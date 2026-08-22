"use client";

import type { ReactNode } from "react";
import { NextStep, NextStepProvider } from "nextstepjs";
import { OnboardingCard } from "@/components/onboarding-card";
import { markOnboardingDone, onboardingTours } from "@/lib/onboarding";

export function OnboardingProvider({ children }: { children: ReactNode }) {
  return (
    <NextStepProvider>
      <NextStep
        steps={onboardingTours}
        cardComponent={OnboardingCard}
        shadowRgb="0, 0, 0"
        shadowOpacity="0.55"
        disableConsoleLogs
        displayArrow
        onComplete={() => markOnboardingDone()}
        onSkip={() => markOnboardingDone()}
        cardTransition={{ ease: "anticipate", duration: 0.35 }}
      >
        {children}
      </NextStep>
    </NextStepProvider>
  );
}
