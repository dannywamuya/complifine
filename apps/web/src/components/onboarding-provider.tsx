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
        scrollToTop={false}
        cardTransition={{ ease: "easeOut", duration: 0.2 }}
      >
        {children}
      </NextStep>
    </NextStepProvider>
  );
}
