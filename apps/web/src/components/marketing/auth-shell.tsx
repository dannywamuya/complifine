import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AuthShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="relative flex flex-1 flex-col">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="marketing-grid absolute inset-0 opacity-40" />
        <div className="marketing-glow absolute inset-0 opacity-80" />
      </div>
      <div
        className={cn(
          "relative mx-auto w-full max-w-md flex-1 px-4 py-16 sm:py-20",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
