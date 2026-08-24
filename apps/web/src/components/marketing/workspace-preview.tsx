"use client";

import Link from "next/link";
import { ArrowUp, BookOpen, PanelLeft, Plus } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export const PREVIEW_CHATS = [
  { title: "Packhouse hygiene FV 12", active: true },
  { title: "Harvest interval — Naivasha", active: false },
  { title: "Scoping the packhouse", active: false },
];

export const PREVIEW_CITATIONS = [
  {
    id: "FV-Smart 12.3.2",
    level: "Major Must",
    page: "p.41",
    excerpt: "Hygiene procedures for workers handling produce must be documented and implemented at the site.",
  },
  {
    id: "FV-Smart 12.3.1",
    level: "Major Must",
    page: "p.41",
    excerpt: "Workers packing produce must have access to clean toilets and hand-washing facilities.",
  },
  {
    id: "FV-Smart 12.2.1",
    level: "Minor Must",
    page: "p.40",
    excerpt: "Hygiene training is recorded. A missing log is a gap against the criterion.",
  },
];

export function CitationChip({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "mx-0.5 inline-flex translate-y-px cursor-pointer items-center rounded-full bg-zinc-900/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-zinc-700 transition-colors hover:bg-emerald-900/10 hover:text-emerald-950",
        className,
      )}
    >
      {id}
    </span>
  );
}

export function WorkspacePreview({
  className,
  footer,
  citationsReady = true,
  collapsedSidebar = false,
}: {
  className?: string;
  footer?: boolean;
  citationsReady?: boolean;
  collapsedSidebar?: boolean;
}) {
  return (
    <div className={cn("flex min-h-0 bg-black text-white", className)}>
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-white/10 bg-black md:flex",
          collapsedSidebar ? "w-14 items-center gap-2 p-2" : "w-[13.5rem] p-3",
        )}
      >
        <div
          className={cn(
            "flex items-center",
            collapsedSidebar ? "h-10 justify-center" : "h-10 px-2",
          )}
        >
          <BrandLogo
            collapsed={collapsedSidebar}
            className={collapsedSidebar ? "size-7" : "h-6 max-w-36"}
            priority={false}
          />
        </div>
        {collapsedSidebar ? (
          <>
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Plus className="size-3.5" />
            </div>
            <ul className="mt-3 flex flex-col items-center gap-1.5">
              {PREVIEW_CHATS.map((chat) => (
                <li
                  key={chat.title}
                  className={cn(
                    "size-2 rounded-full",
                    chat.active ? "bg-white" : "bg-white/25",
                  )}
                  aria-label={chat.title}
                />
              ))}
            </ul>
          </>
        ) : (
          <>
            <div className="mt-1 flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground">
              <Plus className="size-3.5" />
              New chat
            </div>
            <p className="mt-5 px-2 text-[10px] font-medium tracking-[0.14em] text-white/40 uppercase">
              Today
            </p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {PREVIEW_CHATS.map((chat) => (
                <li
                  key={chat.title}
                  className={
                    chat.active
                      ? "rounded-md bg-white/10 px-2 py-1.5 text-[13px] text-white"
                      : "rounded-md px-2 py-1.5 text-[13px] text-white/55"
                  }
                >
                  <span className="block truncate">{chat.title}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col bg-zinc-50 text-zinc-900">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-200 px-3">
          <span className="flex size-7 items-center justify-center rounded-md text-zinc-500">
            <PanelLeft className="size-4" />
          </span>
          <Separator orientation="vertical" className="h-4 bg-zinc-200" />
          <p className="shrink-0 text-sm font-medium tracking-tight">Chat</p>
          <span className="hidden min-w-0 truncate rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600 sm:inline">
            Naivasha packhouse · IFA v6 Smart
          </span>
          <Avatar size="sm" className="ml-auto">
            <AvatarFallback className="bg-zinc-200 text-[10px] text-zinc-700">
              NF
            </AvatarFallback>
          </Avatar>
        </header>
        <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_15.5rem]">
          <div className="flex min-h-0 min-w-0 flex-col">
            <article className="min-w-0 flex-1 space-y-4 overflow-hidden px-4 py-4 sm:px-6">
              <div className="flex justify-end">
                <p className="max-w-[min(85%,22rem)] rounded-2xl rounded-br-md bg-zinc-900 px-3.5 py-2 text-[13px] leading-snug text-white sm:text-sm">
                  What hygiene rules apply in the packhouse?
                </p>
              </div>
              <section className="rounded-2xl border border-emerald-900/10 bg-emerald-50/70 px-4 py-3.5 sm:px-5">
                <p className="text-[11px] font-medium tracking-[0.16em] text-emerald-900/60 uppercase">
                  At a glance
                </p>
                <p className="mt-2 text-[15px] leading-snug text-zinc-900 sm:text-[1.05rem]">
                  The packhouse needs documented hygiene procedures for workers
                  who handle produce
                  <CitationChip id="FV-Smart 12.3.2" />, toilets and hand-washing
                  close to packing
                  <CitationChip id="FV-Smart 12.3.1" />, and a training log —
                  a missing log is a gap, not a model guess
                  <CitationChip id="FV-Smart 12.2.1" />.
                </p>
              </section>
              <section className="space-y-2">
                <p className="text-[11px] font-medium tracking-[0.16em] text-zinc-500 uppercase">
                  What the standard says
                </p>
                <p className="text-[13px] leading-relaxed text-zinc-700 sm:text-[15px]">
                  Procedures must match the site you scoped, not a generic farm
                  checklist. Workers packing fruit need clean facilities next to
                  the packing area. Training against those procedures is recorded.
                </p>
              </section>
            </article>
            <div className="shrink-0 border-t border-zinc-200 px-4 py-3">
              <div className="flex items-end gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2">
                <p className="min-w-0 flex-1 truncate text-sm text-zinc-400">
                  Ask a question, or paste a criterion number…
                </p>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white">
                  <ArrowUp className="size-3.5" aria-hidden />
                </span>
              </div>
            </div>
          </div>
          <aside className="hidden min-h-0 flex-col border-l border-zinc-200 lg:flex">
            <div className="flex items-center gap-2 px-4 py-3">
              <BookOpen className="size-3.5 text-zinc-500" />
              <p className="text-[11px] font-medium tracking-[0.16em] text-zinc-500 uppercase">
                Sources
              </p>
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-hidden px-3 pb-4">
              <p className="px-3 pb-1 text-[11px] font-medium tracking-[0.14em] text-zinc-500 uppercase">
                Cited criteria
              </p>
              {PREVIEW_CITATIONS.map((citation, index) => (
                <div
                  key={citation.id}
                  className={cn(
                    "rounded-xl px-3 py-2 text-sm transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    citationsReady
                      ? "translate-y-0 opacity-100"
                      : "translate-y-1 opacity-0",
                  )}
                  style={{ transitionDelay: citationsReady ? `${index * 80}ms` : "0ms" }}
                >
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[13px] font-medium">
                      {citation.id}
                    </span>
                    <LightLevelBadge level={citation.level} />
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">{citation.page}</p>
                  <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-zinc-600">
                    {citation.excerpt}
                  </p>
                </div>
              ))}
            </div>
          </aside>
        </div>
        {footer ? (
          <p className="border-t border-zinc-200 px-4 py-3 text-xs text-zinc-500">
            Marketing preview — not a live conversation.{" "}
            <Link href="/signup" className="text-primary underline-offset-4 hover:underline">
              Create a producer account
            </Link>{" "}
            to ask against published knowledge.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function LightLevelBadge({ level }: { level: string }) {
  const key = level.toLowerCase();
  const major = key.includes("major");
  const minor = key.includes("minor");
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-[10px] font-medium",
        major && "bg-red-50 text-red-800",
        minor && "border border-zinc-300 text-zinc-700",
        !major && !minor && "bg-zinc-200 text-zinc-700",
      )}
    >
      {level}
    </span>
  );
}
