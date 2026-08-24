"use client";

import { useRef, useState, type PointerEvent } from "react";
import Link from "next/link";
import { useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/marketing/section";
import { ProductFrame } from "@/components/marketing/product-frame";

export function Hero() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null);

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    if (reduced || event.pointerType !== "mouse") return;
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setSpot({ x: event.clientX - box.left, y: event.clientY - box.top });
  }

  return (
    <section
      ref={ref}
      className="relative overflow-hidden pt-16 pb-20 sm:pt-24 sm:pb-28"
      onPointerMove={onPointerMove}
      onPointerLeave={() => setSpot(null)}
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="marketing-grid absolute inset-0 opacity-70" />
        <div className="marketing-glow absolute inset-0" />
        {spot ? (
          <div
            className="absolute size-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/12 blur-3xl"
            style={{ left: spot.x, top: spot.y }}
          />
        ) : null}
      </div>
      <Container className="relative grid items-center gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)] lg:gap-10">
        <div className="max-w-xl">
          <p className="marketing-fade-up font-mono text-[11px] font-medium tracking-[0.18em] text-primary uppercase">
            Kenya · Fruit &amp; vegetables · Exporters
          </p>
          <h1
            className="marketing-fade-up font-heading mt-4 text-4xl font-medium tracking-tight text-balance sm:text-5xl lg:text-[4.25rem] lg:leading-[1.05]"
            style={{ animationDelay: "0.08s" }}
          >
            Know what applies, what evidence you need, and what is still missing.
          </h1>
          <p
            className="marketing-fade-up mt-5 max-w-[65ch] text-base leading-relaxed text-muted-foreground sm:text-lg"
            style={{ animationDelay: "0.16s" }}
          >
            CompliFine is a compliance operating system for horticultural exporters.
            It starts from the publisher&apos;s own documents — GLOBALG.A.P. IFA v6
            and SMETA 7.0 — and answers in your words, with the criterion number on
            every claim.
          </p>
          <div
            className="marketing-fade-up mt-8 flex flex-wrap gap-3"
            style={{ animationDelay: "0.24s" }}
          >
            <Button asChild size="lg">
              <Link href="/demo">
                Book a demo
                <ArrowRight />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-white/15 bg-transparent"
            >
              <Link href="/signup">Create a producer account</Link>
            </Button>
          </div>
          <p
            className="marketing-fade-up mt-4 text-sm text-white/45"
            style={{ animationDelay: "0.32s" }}
          >
            Not a chatbot over PDFs. Published knowledge, your farm, citations.
          </p>
        </div>
        <ProductFrame />
      </Container>
    </section>
  );
}
