"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  animate,
  motion,
  useInView,
  useReducedMotion,
} from "motion/react";
import {
  ArrowRight,
  BookOpen,
  Building2,
  FileSearch,
  Files,
  GitBranch,
  Layers,
  ListChecks,
  MapPinned,
  Quote,
  ScanSearch,
  ShieldCheck,
  SplitSquareVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Container,
  Eyebrow,
  FadeIn,
  Lead,
  Section,
  SectionHeading,
} from "@/components/marketing/section";
import { EASE, viewportOnce } from "@/components/marketing/motion";
import { cn } from "@/lib/utils";

const STANDARDS = [
  "GLOBALG.A.P. IFA v6",
  "SMETA 7.0",
  "ETI Base Code",
  "Smart & GFS",
  "2-pillar & 4-pillar",
];

const STATS = [
  { value: 190, label: "Principles & Criteria", note: "IFA v6 Fruit & Vegetables" },
  { value: 2, label: "Parallel editions", note: "Smart and GFS, not one file" },
  { value: 16, label: "Scoping questions", note: "Official, deterministic" },
];

export function LandingPage() {
  return (
    <>
      <StandardsStrip />
      <ProofRow />
      <Problem />
      <Features />
      <Benefits />
      <HowItWorks />
      <Standards />
      <Trust />
      <Audience />
      <Faq />
      <CtaBand />
    </>
  );
}

function StandardsStrip() {
  return (
    <div className="border-y border-white/10 bg-white/[0.02]">
      <Container className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 py-5">
        {STANDARDS.map((label) => (
          <p
            key={label}
            className="font-mono text-[11px] tracking-[0.14em] text-white/45 uppercase"
          >
            {label}
          </p>
        ))}
      </Container>
    </div>
  );
}

function ProofRow() {
  return (
    <Section className="py-16 sm:py-20">
      <FadeIn>
        <p className="text-center text-sm text-muted-foreground">
          GLOBALG.A.P. IFA v6 facts — not vanity metrics.
        </p>
      </FadeIn>
      <div className="mt-8 grid gap-8 sm:grid-cols-3">
        {STATS.map((stat, index) => (
          <FadeIn key={stat.label} delay={index * 0.08} className="text-center">
            <p className="font-heading text-4xl font-medium tracking-tight sm:text-5xl">
              <CountUp to={stat.value} prefix={stat.value === 190 ? "~" : undefined} />
            </p>
            <p className="mt-2 text-sm font-medium">{stat.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{stat.note}</p>
          </FadeIn>
        ))}
      </div>
    </Section>
  );
}

function CountUp({ to, prefix }: { to: number; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? to : 0);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setValue(to);
      return;
    }
    const controls = animate(0, to, {
      duration: 0.7,
      ease: EASE,
      onUpdate: (next) => setValue(Math.round(next)),
    });
    return () => controls.stop();
  }, [inView, reduced, to]);

  return (
    <span ref={ref} className="font-mono">
      {prefix}
      {value}
    </span>
  );
}

function Problem() {
  const items = [
    {
      icon: Files,
      title: "Fragmented",
      body: "Standards, Excel checklists, lab reports, training records, buyer packs, emails — none of it is one operating picture.",
    },
    {
      icon: GitBranch,
      title: "Hard to interpret",
      body: "Requirements are version-dependent, duplicated across schemes, and disconnected from the packhouse that has to act on them.",
    },
    {
      icon: ListChecks,
      title: "Not operational",
      body: "Companies do not want “what does GLOBALG.A.P. say?” They want what we need to do, what evidence, who owns it, and whether we will be ready.",
    },
  ];

  return (
    <Section>
      <FadeIn>
        <Eyebrow>The problem</Eyebrow>
        <SectionHeading>Compliance is not a lack of PDFs.</SectionHeading>
        <Lead>
          Horticultural exporters already have the files. What they lack is a
          versioned reading of what applies to this site, this season, this edition.
        </Lead>
      </FadeIn>
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {items.map((item, index) => (
          <FadeIn key={item.title} delay={index * 0.08} className="h-full">
            <HoverCard className="h-full">
              <item.icon className="size-5 text-primary" />
              <h3 className="mt-4 font-heading text-lg font-medium">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.body}
              </p>
            </HoverCard>
          </FadeIn>
        ))}
      </div>
    </Section>
  );
}

const FEATURES = [
  {
    title: "Grounded answers",
    body: "Every answer cites a criterion or clause. A citation the tools never retrieved is flagged, not hidden. The database answers questions of fact; the model only writes prose.",
    icon: Quote,
    span: "lg:col-span-2",
  },
  {
    title: "Your sites, not a generic checklist",
    body: "Sites, certification scope, and scoping answers live with the organisation. Ask what applies to the Naivasha packhouse; the agent reads that profile.",
    icon: MapPinned,
    span: "",
  },
  {
    title: "Official sources, versioned",
    body: "IFA v6 Smart and GFS are parallel editions, not treated as the same file. Original documents are hashed and preserved.",
    icon: BookOpen,
    span: "",
  },
  {
    title: "Principles & Criteria explorer",
    body: "Browse Major Must / Minor Must / Recommendation with source page. Checklists map back to requirements; they are not a second standard.",
    icon: ScanSearch,
    span: "",
  },
  {
    title: "Scoping that changes the answer",
    body: "Sixteen official scoping questions. Exempting answers exclude criteria deterministically — no silent LLM skipping.",
    icon: SplitSquareVertical,
    span: "",
  },
  {
    title: "Quality gates",
    body: "Criterion counts, level distributions, and source hashes are checked before members ever see knowledge. Operators review; members only see published knowledge.",
    icon: ShieldCheck,
    span: "lg:col-span-2",
  },
];

function Features() {
  return (
    <Section id="features">
      <FadeIn>
        <Eyebrow>Product</Eyebrow>
        <SectionHeading>What ships today.</SectionHeading>
        <Lead>
          CompliFine for GLOBALG.A.P. — continuous compliance management for
          Kenyan horticultural exporters. The database and published standards are
          the system of record. AI is the interface.
        </Lead>
      </FadeIn>
      <div className="mt-12 grid gap-4 lg:grid-cols-3">
        {FEATURES.map((feature, index) => (
          <FadeIn
            key={feature.title}
            delay={index * 0.06}
            className={feature.span}
          >
            <HoverCard className="h-full">
              <feature.icon className="size-5 text-primary" />
              <h3 className="mt-4 font-heading text-lg font-medium">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {feature.body}
              </p>
            </HoverCard>
          </FadeIn>
        ))}
      </div>
    </Section>
  );
}

const BENEFITS = [
  {
    title: "Stop re-reading the PDF before every audit.",
    body: "Published knowledge is versioned once. You ask against it in the language of the site.",
  },
  {
    title: "Know what applies to this site, this edition, this season.",
    body: "Scoping and site context change the answer. A packhouse is not a field.",
  },
  {
    title: "Trust the answer enough to show a CB.",
    body: "Click through AI prose to the requirement to the source page. Uncited claims are flagged.",
  },
  {
    title: "One operating picture across GLOBALG.A.P. and SMETA.",
    body: "SMETA 7.0 is coming online as a second standard. One company, one evidence set later — evidence is not shipped today.",
  },
];

function Benefits() {
  return (
    <Section>
      <FadeIn>
        <Eyebrow>Outcomes</Eyebrow>
        <SectionHeading>What this is for.</SectionHeading>
      </FadeIn>
      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        {BENEFITS.map((item, index) => (
          <FadeIn key={item.title} delay={index * 0.07}>
            <HoverCard>
              <p className="font-mono text-[11px] text-primary">0{index + 1}</p>
              <h3 className="mt-3 font-heading text-lg font-medium text-balance">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.body}
              </p>
            </HoverCard>
          </FadeIn>
        ))}
      </div>
    </Section>
  );
}

const STEPS = [
  {
    title: "Register the operation",
    body: "Create the company. Add sites — growing, packing, collection, storage. Pick IFA Smart or GFS — and SMETA 2-pillar or 4-pillar when in scope.",
  },
  {
    title: "Scope what applies",
    body: "Answer the official scoping questions. CompliFine excludes what the standard says does not apply — no silent LLM skipping.",
  },
  {
    title: "Ask against published knowledge",
    body: "Search criteria or ask in plain language. Tools hit the database; the model only writes prose.",
  },
  {
    title: "Operate continuously",
    body: "Today: keep the company and sites current and the knowledge cited. Next: evidence, self-assessment, findings, audit readiness.",
    coming: true,
  },
];

const PIPELINE = [
  "Official source",
  "Versioned requirements",
  "Your sites & scope",
  "Grounded answer (citation)",
];

function HowItWorks() {
  return (
    <Section id="how-it-works">
      <FadeIn>
        <Eyebrow>How it works</Eyebrow>
        <SectionHeading>From publisher file to cited answer.</SectionHeading>
      </FadeIn>
      <FadeIn delay={0.08}>
        <ol className="mt-10 flex flex-wrap items-center gap-2 text-sm">
          {PIPELINE.map((step, index) => (
            <li key={step} className="flex items-center gap-2">
              <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[11px] text-white/80">
                {step}
              </span>
              {index < PIPELINE.length - 1 ? (
                <ArrowRight className="size-3.5 text-white/30" />
              ) : null}
            </li>
          ))}
        </ol>
      </FadeIn>
      <div className="relative mt-12">
        <motion.div
          className="absolute top-5 bottom-5 left-[15px] hidden w-px origin-top bg-white/10 md:block"
          initial={{ scaleY: 0 }}
          whileInView={{ scaleY: 1 }}
          viewport={viewportOnce}
          transition={{ duration: 0.8, ease: EASE }}
          aria-hidden
        />
        <ol className="space-y-4">
          {STEPS.map((step, index) => (
            <StepRow key={step.title} index={index} {...step} />
          ))}
        </ol>
      </div>
    </Section>
  );
}

function StepRow({
  index,
  title,
  body,
  coming,
}: {
  index: number;
  title: string;
  body: string;
  coming?: boolean;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20%" });

  return (
    <motion.li
      ref={ref}
      className="relative grid gap-4 md:grid-cols-[2.5rem_1fr] md:items-start"
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={viewportOnce}
      transition={{ duration: 0.5, delay: index * 0.06, ease: EASE }}
    >
      <span
        className={cn(
          "relative z-10 flex size-8 items-center justify-center rounded-full border font-mono text-xs",
          inView
            ? "border-primary bg-primary text-primary-foreground"
            : "border-white/15 bg-graphite-950 text-white/50",
        )}
      >
        {index + 1}
      </span>
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-heading text-lg font-medium">{title}</h3>
          {coming ? (
            <Badge variant="outline" className="border-white/15 text-white/60">
              Coming
            </Badge>
          ) : null}
        </div>
        <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
          {body}
        </p>
      </div>
    </motion.li>
  );
}

function Standards() {
  return (
    <Section id="standards">
      <FadeIn>
        <Eyebrow>Standards</Eyebrow>
        <SectionHeading>Two schemes. Distinct languages.</SectionHeading>
        <Lead>
          GLOBALG.A.P. IFA v6 is the shipped knowledge layer. SMETA 7.0 is in
          progress. We do not treat them as the same checklist.
        </Lead>
      </FadeIn>
      <div className="mt-12 grid gap-4 lg:grid-cols-2">
        <FadeIn>
          <Card className="h-full border border-white/10 bg-white/[0.03] ring-0">
            <CardHeader>
              <CardTitle className="text-xl">GLOBALG.A.P. IFA v6</CardTitle>
              <CardDescription>
                Fruit &amp; Vegetables. Smart and GFS as parallel editions.
              </CardDescription>
            </CardHeader>
            <div className="px-4 pb-4">
              <Tabs defaultValue="smart">
                <TabsList variant="line">
                  <TabsTrigger value="smart">Smart</TabsTrigger>
                  <TabsTrigger value="gfs">GFS</TabsTrigger>
                </TabsList>
                <TabsContent value="smart" className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  <p>
                    IFA v6 Smart for Fruit &amp; Vegetables — Principles &amp; Criteria,
                    the checklist that maps back to those P&amp;Cs, and the General
                    Regulations.
                  </p>
                  <p>
                    Levels stay in the publisher&apos;s language:{" "}
                    <span className="font-mono text-foreground">Major Must</span>,{" "}
                    <span className="font-mono text-foreground">Minor Must</span>,{" "}
                    <span className="font-mono text-foreground">Recommendation</span>.
                  </p>
                </TabsContent>
                <TabsContent value="gfs" className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  <p>
                    IFA v6 GFS is a parallel edition, not an interchangeable copy of
                    Smart. Criterion numbering and applicability can differ; CompliFine
                    keeps them separate.
                  </p>
                  <p>
                    Same fruit &amp; vegetables scope, same level vocabulary, distinct
                    source file — hashed and preserved.
                  </p>
                </TabsContent>
              </Tabs>
            </div>
          </Card>
        </FadeIn>
        <FadeIn delay={0.08}>
          <Card className="h-full border border-white/10 bg-white/[0.03] ring-0">
            <CardHeader>
              <CardTitle className="text-xl">SMETA 7.0</CardTitle>
              <CardDescription>
                2-pillar and 4-pillar. In progress — not a second GLOBALG.A.P.
              </CardDescription>
            </CardHeader>
            <div className="px-4 pb-4">
              <Tabs defaultValue="eti">
                <TabsList variant="line">
                  <TabsTrigger value="eti">ETI Base Code</TabsTrigger>
                  <TabsTrigger value="sedex">Sedex</TabsTrigger>
                </TabsList>
                <TabsContent value="eti" className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  <p>
                    The ETI Base Code is public. Workplace Requirements are
                    member-gated until the official file is in the library.
                  </p>
                  <p>
                    Findings language is{" "}
                    <span className="font-mono text-foreground">NC</span> /{" "}
                    <span className="font-mono text-foreground">CAR</span> /{" "}
                    <span className="font-mono text-foreground">MSA</span>. We do not
                    reuse Major Must here.
                  </p>
                </TabsContent>
                <TabsContent value="sedex" className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  <p>
                    Sedex is the membership platform — your ZC and SAQ — not a
                    Principles &amp; Criteria set. It is not a second standard.
                  </p>
                  <p>
                    2-pillar and 4-pillar are scopes against SMETA 7.0, not separate
                    products.
                  </p>
                </TabsContent>
              </Tabs>
            </div>
          </Card>
        </FadeIn>
      </div>
    </Section>
  );
}

const LAYERS = [
  {
    icon: FileSearch,
    title: "Source fact",
    body: "What the published edition states — criterion, clause, page, level. Retrieved from the database, never from model recall.",
  },
  {
    icon: Building2,
    title: "Site context",
    body: "Which sites you run, which edition you are certified against, and how you answered the scoping questions.",
  },
  {
    icon: Layers,
    title: "AI interpretation",
    body: "Prose in your words, citing the facts above. The AI never silently invents requirements, deadlines, legal obligations, or certification status.",
  },
];

function Trust() {
  return (
    <Section>
      <FadeIn>
        <Eyebrow>How answers work</Eyebrow>
        <SectionHeading>Three layers. Visually distinct on purpose.</SectionHeading>
        <Lead>
          The database and published standards are the system of record. AI is the
          interface. Every important claim cites a criterion, clause, page, or edition.
        </Lead>
      </FadeIn>
      <div className="mt-12 grid gap-4 lg:grid-cols-3">
        {LAYERS.map((layer, index) => (
          <FadeIn key={layer.title} delay={index * 0.08}>
            <div
              className={cn(
                "h-full rounded-xl border p-5",
                index === 0 && "border-white/15 bg-white/[0.04]",
                index === 1 && "border-primary/35 bg-primary/8",
                index === 2 && "border-white/10 bg-transparent",
              )}
            >
              <layer.icon className="size-5 text-primary" />
              <p className="mt-4 font-mono text-[11px] text-white/40">
                Layer 0{index + 1}
              </p>
              <h3 className="mt-1 font-heading text-lg font-medium">{layer.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {layer.body}
              </p>
            </div>
          </FadeIn>
        ))}
      </div>
    </Section>
  );
}

function Audience() {
  return (
    <Section>
      <FadeIn>
        <Eyebrow>Who it is for</Eyebrow>
        <SectionHeading>Kenyan horticultural exporters first.</SectionHeading>
        <Lead>
          Avocado farms, packhouses, and producer groups preparing for GLOBALG.A.P.
          and SMETA. Fruit &amp; vegetables now. Later: mango, herbs, flowers, and
          other African agricultural exporters — when the knowledge layer is ready,
          not before.
        </Lead>
      </FadeIn>
    </Section>
  );
}

const FAQS = [
  {
    q: "Is this official certification?",
    a: "No. CompliFine is internal readiness and published knowledge. It is not a certification body and it does not certify you. A CB decision is separate.",
  },
  {
    q: "Does the AI make up clauses?",
    a: "No. Answers are retrieval plus structured requirements. A citation the tools never retrieved is flagged, not hidden.",
  },
  {
    q: "What is the difference between Smart and GFS?",
    a: "They are parallel editions of GLOBALG.A.P. IFA v6 Fruit & Vegetables, not interchangeable files. CompliFine keeps them separate.",
  },
  {
    q: "Do I need Sedex membership for SMETA?",
    a: "Workplace Requirements are member-gated. The ETI Base Code is public. Sedex is the membership platform (your ZC), not a second standard.",
  },
  {
    q: "Can I just upload a PDF and chat?",
    a: "That is not the product. Official sources are ingested, reviewed, and published first. The model does not chat over an arbitrary file.",
  },
];

function Faq() {
  return (
    <Section id="faq">
      <FadeIn>
        <Eyebrow>FAQ</Eyebrow>
        <SectionHeading>Straight answers.</SectionHeading>
      </FadeIn>
      <FadeIn delay={0.08} className="mt-10">
        <Accordion type="single" collapsible className="border-t border-white/10">
          {FAQS.map((item, index) => (
            <AccordionItem key={item.q} value={`faq-${index}`} className="border-white/10">
              <AccordionTrigger className="py-5 text-base hover:no-underline">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="pb-5 text-muted-foreground">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </FadeIn>
    </Section>
  );
}

function CtaBand() {
  return (
    <section className="relative overflow-hidden border-t border-white/10 py-20 sm:py-28">
      <div className="marketing-glow pointer-events-none absolute inset-0" aria-hidden />
      <Container className="relative max-w-3xl text-center">
        <FadeIn>
          <h2 className="font-heading text-3xl font-medium tracking-tight text-balance sm:text-4xl">
            Know exactly what your company needs to do, what evidence proves it,
            what is missing, what changed, and whether you are ready for your audit.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Built for Kenyan horticultural exporters preparing for GLOBALG.A.P. and
            SMETA.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
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
              <Link href="/signup">Create account</Link>
            </Button>
          </div>
        </FadeIn>
      </Container>
    </section>
  );
}

function HoverCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/10 bg-white/[0.03] p-5 transition-[transform,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px hover:border-white/20",
        className,
      )}
    >
      {children}
    </div>
  );
}
