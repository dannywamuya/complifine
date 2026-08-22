"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useNextStep } from "nextstepjs";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { ONBOARDING_TOUR, onboardingIsDone } from "@/lib/onboarding";

export function OnboardingTrigger() {
  const { startNextStep, isNextStepVisible } = useNextStep();
  const { setOpen } = useSidebar();
  const path = usePathname();
  const router = useRouter();
  const pending = useRef(false);
  const autoStarted = useRef(false);
  const startRef = useRef<() => void>(() => undefined);

  startRef.current = () => {
    setOpen(true);
    if (path !== "/") {
      pending.current = true;
      router.push("/");
      return;
    }
    startNextStep(ONBOARDING_TOUR);
  };

  useEffect(() => {
    if (!pending.current || path !== "/") return;
    pending.current = false;
    const timer = window.setTimeout(() => startNextStep(ONBOARDING_TOUR), 250);
    return () => window.clearTimeout(timer);
  }, [path, startNextStep]);

  useEffect(() => {
    if (autoStarted.current || onboardingIsDone()) return;
    autoStarted.current = true;
    const timer = window.setTimeout(() => {
      if (onboardingIsDone()) return;
      startRef.current();
    }, 700);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <Button
      id="tour-help"
      type="button"
      variant="ghost"
      size="sm"
      className="text-muted-foreground"
      disabled={isNextStepVisible}
      onClick={() => startRef.current()}
    >
      <CircleHelp />
      Tour
    </Button>
  );
}
