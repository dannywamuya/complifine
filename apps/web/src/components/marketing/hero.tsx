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
      className="relative overflow-hidden pt-14 pb-16 sm:pt-20 sm:pb-24"
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
      <Container className="relative grid items-center gap-10 lg:max-w-7xl lg:grid-cols-[2fr_3fr] lg:gap-10">
        <div className="min-w-0 lg:pr-2">
          <p className="marketing-fade-up font-mono text-[11px] font-medium tracking-[0.18em] text-primary uppercase">
            Kenya · Fruit &amp; vegetables · Exporters
          </p>
          <h1
            className="marketing-fade-up font-heading mt-4 text-3xl font-medium tracking-tight text-balance sm:text-4xl lg:text-[2.75rem] lg:leading-[1.12]"
            style={{ animationDelay: "0.08s" }}
          >
            Know what applies on your farm.
          </h1>
          <p
            className="marketing-fade-up mt-4 max-w-[42ch] text-sm leading-relaxed text-muted-foreground sm:text-base"
            style={{ animationDelay: "0.16s" }}
          >
            Cited answers from GLOBALG.A.P. IFA v6 and SMETA 7.0 — not a chatbot over PDFs.
          </p>
          <div
            className="marketing-fade-up mt-7 flex flex-wrap gap-3"
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
        </div>
        <ProductFrame />
      </Container>
    </section>
  );
}
