"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, ApiError, startSessionKeepAlive } from "@/lib/api";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { AppSidebar } from "@/components/app-sidebar";
import { CertScopeFilter, CertScopeProvider } from "@/components/cert-scope";
import { OnboardingTrigger } from "@/components/onboarding-trigger";

interface Me {
  id: string;
  name: string;
  kind: string;
}

export function ConsoleChrome({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  useEffect(() => {
    if (path === "/login") {
      setMe(null);
      return;
    }
    api<Me>("/auth/me")
      .then((user) => {
        if (user.kind !== "operator") {
          router.replace("/login");
          return;
        }
        setMe(user);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status !== 401) return;
        router.replace("/login");
      });
  }, [path, router]);

  useEffect(() => {
    if (!me) return;
    return startSessionKeepAlive();
  }, [me]);

  if (path === "/login") {
    return <>{children}</>;
  }

  if (!me) {
    return (
      <div className="flex min-h-svh">
        <div className="hidden w-64 shrink-0 border-r bg-sidebar p-3 md:block">
          <Skeleton className="h-10 w-40" />
          <div className="mt-6 space-y-2">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-12 items-center gap-2 border-b px-3">
            <Skeleton className="size-7 rounded-md" />
            <Skeleton className="ml-auto h-4 w-28" />
          </div>
          <div className="flex-1 space-y-4 p-6">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72 max-w-full" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <CertScopeProvider>
      <TooltipProvider>
        <SidebarProvider className="min-h-svh overflow-x-hidden">
          <AppSidebar />
          <SidebarInset className="min-h-svh min-w-0 overflow-x-hidden">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
              <SidebarTrigger />
              <span className="truncate text-sm text-muted-foreground md:hidden">CompliFine</span>
              <span className="ml-auto flex min-w-0 items-center gap-2">
                <span id="tour-cert-scope">
                  <CertScopeFilter />
                </span>
                <OnboardingTrigger />
                <span className="hidden truncate text-sm text-muted-foreground sm:inline">{me.name}</span>
              </span>
            </header>
            <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden p-6">{children}</div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </CertScopeProvider>
  );
}
