import { BookOpen, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const CITATIONS = [
  {
    id: "FV-Smart 12.3.2",
    level: "Major Must",
    excerpt:
      "Hygiene procedures for workers handling produce must be documented and implemented at the site.",
  },
  {
    id: "FV-Smart 12.3.1",
    level: "Major Must",
    excerpt:
      "Workers packing produce must have access to clean toilets and hand-washing facilities.",
  },
];

const SLIDES = [
  {
    heading: "Know what applies on your farm.",
    body: "Cited answers from GLOBALG.A.P. IFA v6 and SMETA 7.0 — not a chatbot over PDFs.",
  },
  {
    heading: "Scope the site, then ask.",
    body: "Official scoping questions decide which criteria apply. Every answer points at the published source.",
  },
  {
    heading: "From scramble to continuous.",
    body: "Turn annual audit-prep into operational compliance — with versioned knowledge your team can use.",
  },
];

export function AuthShowcase({ slide = 0 }: { slide?: number }) {
  const copy = SLIDES[slide] ?? SLIDES[0]!;

  return (
    <div className="relative hidden min-h-0 overflow-hidden bg-graphite-950 text-grey-olive-50 lg:flex lg:flex-col">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="marketing-grid absolute inset-0 opacity-50" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_-10%,rgb(154_225_157_/_0.28),transparent_58%)]" />
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col justify-center px-10 py-12 xl:px-14">
        <div className="relative mx-auto w-full max-w-lg">
          <div className="pointer-events-none absolute -inset-10 rounded-[2rem] bg-primary/20 blur-3xl" aria-hidden />
          <ProductCollage />
        </div>

        <div className="relative mx-auto mt-10 max-w-lg text-center">
          <h2 className="font-heading text-3xl font-medium tracking-tight text-balance xl:text-4xl">
            {copy.heading}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/70 xl:text-base">
            {copy.body}
          </p>
          <div className="mt-8 flex justify-center gap-2" aria-hidden>
            {SLIDES.map((item, index) => (
              <span
                key={item.heading}
                className={cn(
                  "size-2 rounded-full",
                  index === slide ? "bg-white" : "bg-white/30",
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductCollage() {
  return (
    <div className="relative mx-auto h-[22rem] w-full max-w-[28rem]">
      <div className="absolute top-0 left-0 z-20 w-[16.5rem] rounded-2xl border border-white/10 bg-grey-olive-50 p-4 text-graphite-900 shadow-[0_24px_48px_-20px_rgb(0_0_0_/_0.55)]">
        <p className="text-[11px] font-medium tracking-[0.16em] text-iron-grey-500 uppercase">
          At a glance
        </p>
        <p className="mt-2 text-sm leading-snug">
          Packhouse hygiene is a Major Must — procedures, facilities, and a
          training log.
        </p>
        <p className="mt-3 font-mono text-[11px] text-primary">FV-Smart 12.3.2</p>
      </div>

      <div className="absolute top-16 right-0 z-10 w-[15.5rem] rounded-2xl border border-white/10 bg-graphite-900 p-4 shadow-[0_24px_48px_-20px_rgb(0_0_0_/_0.7)]">
        <div className="flex items-center justify-between">
          <p className="text-xs text-white/55">Criteria in scope</p>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[10px] text-primary">
            IFA v6 Smart
          </span>
        </div>
        <p className="mt-2 font-heading text-3xl font-medium tracking-tight">190</p>
        <p className="text-xs text-white/45">Principles &amp; Criteria · FV</p>
        <div className="mt-3 flex h-16 items-end gap-1.5">
          {[40, 62, 48, 78, 55, 88, 70].map((height, index) => (
            <span
              key={height}
              className={cn(
                "w-full rounded-sm",
                index % 2 === 0 ? "bg-primary" : "bg-white/20",
              )}
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      </div>

      <div className="absolute right-6 bottom-2 z-30 w-[17rem] rounded-2xl border border-white/10 bg-grey-olive-50 p-4 text-graphite-900 shadow-[0_24px_48px_-20px_rgb(0_0_0_/_0.55)]">
        <div className="flex items-center gap-2">
          <BookOpen className="size-3.5 text-iron-grey-500" />
          <p className="text-[11px] font-medium tracking-[0.16em] text-iron-grey-500 uppercase">
            Cited criteria
          </p>
        </div>
        <ul className="mt-3 space-y-2.5">
          {CITATIONS.map((citation) => (
            <li key={citation.id}>
              <p className="flex items-center gap-2 font-mono text-[12px] font-medium">
                {citation.id}
                <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-sans font-medium text-red-800">
                  {citation.level}
                </span>
              </p>
              <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-iron-grey-600">
                {citation.excerpt}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <div className="absolute bottom-24 left-2 z-20 flex items-center gap-2 rounded-xl border border-white/10 bg-graphite-950/80 px-3 py-2 shadow-lg backdrop-blur-sm">
        <ShieldCheck className="size-4 text-primary" />
        <p className="text-xs text-white/80">Naivasha packhouse · IFA v6 Smart</p>
      </div>
    </div>
  );
}
