"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useNextStep } from "nextstepjs";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import {
  ONBOARDING_TOUR,
  clearTourPending,
  onboardingIsDone,
  tourIsPending,
} from "@/lib/onboarding";

function waitForSelector(selector: string, timeoutMs = 5000): Promise<boolean> {
  const found = document.querySelector(selector);
  if (found) return Promise.resolve(true);
  return new Promise((resolve) => {
    const start = Date.now();
    const timer = window.setInterval(() => {
      if (document.querySelector(selector)) {
        window.clearInterval(timer);
        resolve(true);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        window.clearInterval(timer);
        resolve(false);
      }
    }, 80);
  });
}

export function OnboardingTrigger() {
  const { startNextStep, isNextStepVisible, currentStep } = useNextStep();
  const { setOpen, setOpenMobile } = useSidebar();
  const path = usePathname();
  const router = useRouter();
  const pendingNav = useRef(false);
  const autoStarted = useRef(false);
  const startRef = useRef<(force?: boolean) => void>(() => undefined);

  function openSidebar() {
    setOpen(true);
    setOpenMobile(true);
  }

  startRef.current = (force = false) => {
    if (isNextStepVisible) return;
    openSidebar();
    if (path !== "/app") {
      pendingNav.current = true;
      router.push("/app");
      return;
    }
    void (async () => {
      await waitForSelector("#tour-sidebar");
      await waitForSelector("#cf-composer");
      await waitForSelector("#tour-site");
      await waitForSelector("#tour-chats");
      await waitForSelector("#tour-help");
      if (!force && onboardingIsDone()) return;
      clearTourPending();
      startNextStep(ONBOARDING_TOUR);
    })();
  };

  useEffect(() => {
    if (!isNextStepVisible) return;
    if (currentStep === 3 || currentStep === 4) openSidebar();
  }, [currentStep, isNextStepVisible]);

  useEffect(() => {
    if (!pendingNav.current || path !== "/app") return;
    pendingNav.current = false;
    const timer = window.setTimeout(() => startRef.current(true), 400);
    return () => window.clearTimeout(timer);
  }, [path]);

  useEffect(() => {
    if (autoStarted.current || onboardingIsDone() || !tourIsPending()) return;
    autoStarted.current = true;
    const timer = window.setTimeout(() => {
      if (onboardingIsDone()) return;
      startRef.current();
    }, 500);
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
      onClick={() => startRef.current(true)}
    >
      <CircleHelp />
      Tour
    </Button>
  );
}
