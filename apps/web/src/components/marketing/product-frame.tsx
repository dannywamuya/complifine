"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { WorkspacePreview } from "@/components/marketing/workspace-preview";

export function ProductFrame() {
  const reduced = useReducedMotion();
  const [citationsReady, setCitationsReady] = useState(false);

  useEffect(() => {
    if (reduced) {
      setCitationsReady(true);
      return;
    }
    const id = window.setTimeout(() => setCitationsReady(true), 420);
    return () => window.clearTimeout(id);
  }, [reduced]);

  return (
    <div
      className="marketing-fade-up relative lg:-mr-6 xl:-mr-10"
      style={{ animationDelay: "0.18s" }}
    >
      <div
        className="pointer-events-none absolute -inset-8 rounded-[2rem] bg-primary/15 blur-3xl"
        aria-hidden
      />
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0a] shadow-[0_40px_80px_-32px_rgb(0_0_0_/_0.85)]">
        <BrowserChrome />
        <div className="relative h-[22rem] sm:h-[26rem] lg:h-[32rem]">
          <WorkspacePreview
            className="h-[28rem] sm:h-[34rem] lg:h-[40rem]"
            citationsReady={reduced || citationsReady}
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent"
            aria-hidden
          />
        </div>
      </div>
    </div>
  );
}

function BrowserChrome() {
  return (
    <div className="flex items-center gap-3 border-b border-white/10 bg-black px-3 py-2.5">
      <div className="flex gap-1.5" aria-hidden>
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
      </div>
      <div className="mx-auto flex h-6 w-full max-w-sm items-center justify-center rounded-md border border-white/8 bg-white/5 px-3">
        <p className="truncate font-mono text-[11px] text-white/45">
          app.complifine.com
        </p>
      </div>
    </div>
  );
}
