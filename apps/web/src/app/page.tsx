import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/page-shell";

export const metadata = {
  title: "Compliance for Kenyan horticultural exporters",
  description:
    "Know what GLOBALG.A.P. IFA v6 and SMETA 7 actually require on your farm — with citations, not guesses.",
};

export default function HomePage() {
  return (
    <PageShell className="space-y-16 pb-20">
      <section className="max-w-2xl space-y-5 pt-8">
        <p className="text-sm text-muted-foreground">Kenya · Fruit &amp; vegetables · Exporters</p>
        <h1 className="font-heading text-4xl font-medium tracking-tight sm:text-5xl">
          Know what applies, what evidence you need, and what is still missing.
        </h1>
        <p className="text-lg text-muted-foreground">
          CompliFine is a compliance operating system for horticultural exporters. It starts from
          the publisher&apos;s own documents — GLOBALG.A.P. IFA v6 and SMETA 7.0 — and answers in
          your words, with the criterion number on every claim.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg">
            <Link href="/signup">
              Create a producer account
              <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/demo">Book a demo</Link>
          </Button>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>GLOBALG.A.P. IFA v6</CardTitle>
            <CardDescription>
              Smart and GFS as parallel editions. 190 / 191 principles and criteria, the 16 scoping
              questions, and the General Regulations — ingested from the official files, not recalled
              from a model.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>SMETA 7.0</CardTitle>
            <CardDescription>
              2-pillar and 4-pillar scopes against the ETI Base Code. Workplace Requirements stay
              member-gated until you drop the official file. Sedex is the platform (your ZC), not a
              second standard.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Grounded answers</CardTitle>
            <CardDescription>
              Every answer cites a criterion or clause. A citation the tools never retrieved is
              flagged, not hidden. The database answers questions of fact; the model only writes
              prose.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Your farm, not a generic checklist</CardTitle>
            <CardDescription>
              Sites, certification scope and saved scoping answers live with your organisation. Ask
              “what applies to the Naivasha packhouse” and the agent reads that profile.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quality gates before anything is published</CardTitle>
          <CardDescription>
            Criterion counts, level distributions and source hashes are checked against numbers the
            publisher states independently of the file being parsed. Operators review; members only
            see published knowledge.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/login">Sign in to your dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}
