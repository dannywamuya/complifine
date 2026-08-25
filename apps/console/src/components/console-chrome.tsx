"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, ApiError, startSessionKeepAlive } from "@/lib/api";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { AppSidebar } from "@/components/app-sidebar";
import { CertScopeFilter, CertScopeProvider } from "@/components/cert-scope";
import { OnboardingTrigger } from "@/components/onboarding-trigger";
import { ModeToggle } from "@/components/mode-toggle";

interface Me {
  id: string;
  name: string;
  kind: string;
}

export function ConsoleChrome({
  children,
  defaultSidebarOpen = true,
}: {
  children: ReactNode;
  defaultSidebarOpen?: boolean;
}) {
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
    return (
      <div className="relative flex min-h-svh flex-1 flex-col bg-background">
        <div className="absolute top-4 right-4">
          <ModeToggle />
        </div>
        {children}
      </div>
    );
  }

  if (!me) {
    return (
      <div className="flex min-h-svh bg-muted p-2">
        <div
          className={
            defaultSidebarOpen
              ? "hidden w-60 shrink-0 flex-col rounded-2xl bg-sidebar p-3 sm:flex"
              : "hidden w-12 shrink-0 flex-col items-center rounded-2xl bg-sidebar p-3 sm:flex"
          }
        >
          <Skeleton className={defaultSidebarOpen ? "h-8 w-32 rounded-md bg-sidebar-accent" : "size-8 rounded-md bg-sidebar-accent"} />
          <div className="mt-6 space-y-2">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton
                key={index}
                className={
                  defaultSidebarOpen
                    ? "h-8 w-full rounded-xl bg-sidebar-accent"
                    : "size-8 rounded-xl bg-sidebar-accent"
                }
              />
            ))}
          </div>
        </div>
        <div className="ml-0 flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-card shadow-sm sm:ml-2">
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
            <Skeleton className="size-7 rounded-xl" />
            <Skeleton className="ml-auto h-8 w-28 rounded-xl" />
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
        <SidebarProvider defaultOpen={defaultSidebarOpen} className="min-h-svh overflow-x-hidden bg-muted">
          <AppSidebar />
          <SidebarInset className="min-h-svh min-w-0 overflow-hidden bg-card md:my-2 md:mr-2 md:ml-0 md:h-[calc(100svh-1rem)] md:min-h-0 md:rounded-2xl md:shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_32px_rgb(0_0_0/0.05)]">
            <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-transparent px-3 sm:px-4">
              <SidebarTrigger className="rounded-xl" />
              <Separator orientation="vertical" className="h-4" />
              <span className="truncate text-sm font-medium tracking-tight md:hidden">CompliFine</span>
              <span className="ml-auto flex min-w-0 items-center gap-2">
                <span id="tour-cert-scope">
                  <CertScopeFilter />
                </span>
                <OnboardingTrigger />
                <ModeToggle />
                <span className="hidden truncate text-sm text-muted-foreground sm:inline">{me.name}</span>
              </span>
            </header>
            <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-6">{children}</div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </CertScopeProvider>
  );
}
