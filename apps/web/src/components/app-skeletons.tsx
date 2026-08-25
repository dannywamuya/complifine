import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function AppChromeSkeleton({ path = "/app" }: { path?: string }) {
  return (
    <div className="flex min-h-svh bg-muted p-2">
      <aside className="hidden w-60 shrink-0 flex-col rounded-2xl bg-graphite-950 p-3 sm:flex">
        <Skeleton className="h-8 w-32 rounded-md bg-white/15" />
        <div className="mt-4 space-y-2">
          <Skeleton className="h-8 w-full rounded-xl bg-white/10" />
          <Skeleton className="h-8 w-full rounded-xl bg-white/10" />
          <Skeleton className="h-8 w-full rounded-xl bg-white/10" />
        </div>
        <Skeleton className="mt-6 h-8 w-full rounded-xl bg-white/10" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton
              key={index}
              className="h-8 rounded-xl bg-white/10"
              style={{ width: `${72 - index * 6}%` }}
            />
          ))}
        </div>
      </aside>
      <div className="ml-0 flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-card shadow-sm sm:ml-2">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <Skeleton className="size-7 rounded-xl" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="ml-auto size-8 rounded-full" />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden p-6 sm:p-8">
          {path.startsWith("/app/farm") ? (
            <FarmPageSkeleton />
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

export function ChatPageSkeleton() {
  return (
    <div className="mx-auto flex h-full min-h-112 w-full max-w-2xl flex-col justify-between">
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
        <div className="mt-4 grid w-full gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-20 rounded-2xl" />
          ))}
        </div>
      </div>
      <Skeleton className="h-12 w-full rounded-2xl" />
    </div>
  );
}

export function CriteriaPageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <div className="space-y-3">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>
      <Skeleton className="h-16 w-full rounded-[1.75rem]" />
      <CriteriaTableSkeleton />
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

export function FarmPageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <Skeleton className="h-10 w-80 rounded-full" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export function CriterionDetailSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <Skeleton className="h-4 w-40" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-52 rounded-2xl" />
    </div>
  );
}
