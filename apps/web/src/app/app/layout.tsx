import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { AppChrome } from "@/components/app-chrome";
import { OnboardingProvider } from "@/components/onboarding-provider";

export const metadata = { title: "Chat" };

/** Must match `SIDEBAR_COOKIE_NAME` in `components/ui/sidebar.tsx`. */
const SIDEBAR_COOKIE_NAME = "sidebar_state";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const stored = (await cookies()).get(SIDEBAR_COOKIE_NAME)?.value;
  const defaultSidebarOpen = stored !== "false";

  return (
    <OnboardingProvider>
      <AppChrome defaultSidebarOpen={defaultSidebarOpen}>{children}</AppChrome>
    </OnboardingProvider>
  );
}
