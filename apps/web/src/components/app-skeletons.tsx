import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function AppChromeSkeleton({
  path = "/app",
  sidebarOpen = true,
}: {
  path?: string;
  sidebarOpen?: boolean;
}) {
  const chatHome = path === "/app";
  const setup = path.startsWith("/app/setup");

  return (
    <div className="flex min-h-svh bg-muted p-2">
      <aside
        className={cn(
          "hidden shrink-0 flex-col rounded-2xl bg-sidebar p-3 sm:flex",
          sidebarOpen ? "w-60" : "w-12 items-center",
        )}
      >
        <Skeleton className={cn("h-8 rounded-md bg-sidebar-accent", sidebarOpen ? "w-32" : "w-8")} />
        {setup ? null : sidebarOpen ? (
          <>
            <div className="mt-4 space-y-2">
              <Skeleton className="h-8 w-full rounded-xl bg-sidebar-accent" />
              <Skeleton className="h-8 w-full rounded-xl bg-sidebar-accent" />
              <Skeleton className="h-8 w-full rounded-xl bg-sidebar-accent" />
            </div>
            <Skeleton className="mt-6 h-8 w-full rounded-xl bg-sidebar-accent" />
            <div className="mt-4 space-y-2">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton
                  key={index}
                  className="h-8 rounded-xl bg-sidebar-accent"
                  style={{ width: `${72 - index * 6}%` }}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="mt-4 space-y-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="size-8 rounded-xl bg-sidebar-accent" />
            ))}
          </div>
        )}
      </aside>
      <div className="ml-0 flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-card shadow-sm sm:ml-2">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
          {setup ? null : (
            <>
              <Skeleton className="size-7 rounded-xl" />
              <Skeleton className="h-4 w-px" />
            </>
          )}
          <Skeleton className="h-4 w-16" />
          <div className="ml-auto flex items-center gap-2">
            {setup ? null : <Skeleton className="size-8 rounded-xl" />}
            <Skeleton className="size-8 rounded-xl" />
            <Skeleton className="size-8 rounded-full" />
          </div>
        </div>
        <div
          className={
            chatHome
              ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
              : "relative min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-6 sm:px-8 sm:py-8"
          }
        >
          {path.startsWith("/app/company") ? (
            <CompanyPageSkeleton />
          ) : path.startsWith("/app/setup") ? (
            <SetupPageSkeleton />
          ) : path.startsWith("/app/criteria/") ? (
            <CriterionDetailSkeleton />
          ) : path.startsWith("/app/criteria") ? (
            <CriteriaPageSkeleton />
          ) : (
            <ChatPageSkeleton />
          )}
        </div>
      </div>
    </div>
  );
}

function PageHeaderSkeleton({
  titleClassName = "h-9 w-56 sm:h-10",
  bodyClassName = "h-4 w-full max-w-lg",
}: {
  titleClassName?: string;
  bodyClassName?: string;
}) {
  return (
    <div className="w-fit max-w-full space-y-2">
      <Skeleton className="h-5 w-20" />
      <Skeleton className={titleClassName} />
      <Skeleton className={bodyClassName} />
    </div>
  );
}

export function ChatPageSkeleton() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col" aria-busy="true" aria-label="Loading chat">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center px-4 pt-8 pb-6 text-center sm:px-8 sm:pt-12 sm:pb-8">
          <Skeleton className="h-9 w-72 max-w-full sm:h-10 sm:w-96" />
          <Skeleton className="mt-10 size-64 rounded-full sm:size-72" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mb-3 flex gap-2 overflow-hidden">
          <Skeleton className="h-9 w-44 shrink-0 rounded-full" />
          <Skeleton className="h-9 w-52 shrink-0 rounded-full" />
          <Skeleton className="h-9 w-40 shrink-0 rounded-full" />
          <Skeleton className="h-9 w-48 shrink-0 rounded-full" />
        </div>
        <Skeleton className="h-14 w-full rounded-2xl" />
      </div>
    </div>
  );
}

export function CatalogNavSkeleton() {
  return (
    <div className="h-fit w-full max-w-60 space-y-5">
      <Skeleton className="mb-3 h-4 w-28" />
      {Array.from({ length: 2 }, (_, group) => (
        <div key={group} className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-20" />
          <div className="space-y-0.5">
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CatalogSearchSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-64 max-w-full" />
      <div className="flex w-full max-w-xl flex-col gap-3 rounded-[1.75rem] border border-border bg-card p-3 sm:flex-row sm:items-center">
        <Skeleton className="h-10 min-w-0 flex-1 rounded-full" />
        <Skeleton className="h-10 w-full rounded-full sm:w-44" />
        <Skeleton className="h-10 w-full rounded-full sm:w-20" />
      </div>
    </div>
  );
}

export function CatalogBodySkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <CatalogNavSkeleton />
      <div className="min-w-0 space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-6 w-56 max-w-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <CatalogSearchSkeleton />
        <CriteriaTableSkeleton />
      </div>
    </div>
  );
}

export function CriteriaPageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8" aria-busy="true" aria-label="Loading catalog">
      <PageHeaderSkeleton titleClassName="h-9 w-64 sm:h-10" />
      <CatalogBodySkeleton />
    </div>
  );
}

export function CriteriaTableSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      <Skeleton className="h-4 w-32" />
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="grid grid-cols-[22%_18%_1fr_3.5rem] gap-3 bg-muted/80 px-4 py-3">
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-8" />
        </div>
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className="grid grid-cols-[22%_18%_1fr_3.5rem] items-center gap-3 border-t border-border px-4 py-3.5"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-full max-w-sm" />
            <Skeleton className="h-4 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CompanyPageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8" aria-busy="true" aria-label="Loading company">
      <PageHeaderSkeleton titleClassName="h-9 w-64 sm:h-10" bodyClassName="h-4 w-full max-w-xl" />
      <div className="flex h-10 w-fit max-w-full items-center gap-1 rounded-full bg-muted p-1">
        <Skeleton className="h-8 w-16 rounded-full" />
        <Skeleton className="h-8 w-28 rounded-full" />
        <Skeleton className="h-8 w-28 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-2 rounded-2xl border border-border bg-card p-4">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SetupPageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8" aria-busy="true" aria-label="Loading setup">
      <PageHeaderSkeleton titleClassName="h-9 w-48 sm:h-10" />
      <Skeleton className="h-2 w-full rounded-full" />
      <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>
    </div>
  );
}

export function EditionCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-2">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <Skeleton className="h-4 w-48 max-w-full" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function ScopingListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-3 w-28" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-14 rounded-full" />
            <Skeleton className="h-8 w-12 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CriterionDetailSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8" aria-busy="true" aria-label="Loading criterion">
      <Skeleton className="h-4 w-40" />
      <div className="space-y-2">
        <Skeleton className="h-5 w-64 max-w-full" />
        <Skeleton className="h-9 w-36 font-mono" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
      <div className="space-y-3 rounded-2xl border border-border bg-card p-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-56" />
        <Skeleton className="mt-2 h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="space-y-3 rounded-2xl border border-border bg-card p-6">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-2 h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <Skeleton className="h-9 w-40 rounded-full" />
    </div>
  );
}
