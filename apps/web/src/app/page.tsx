import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/page-shell";

export const metadata = { title: "Ask the standard" };

export default function HomePage() {
  return (
    <PageShell className="space-y-10">
      <section className="max-w-2xl space-y-4 pt-4">
        <p className="text-sm text-muted-foreground">GLOBALG.A.P. IFA v6 · Fruit &amp; Vegetables</p>
        <h1 className="font-heading text-4xl font-medium tracking-tight">
          The published standard, answerable in your words.
        </h1>
        <p className="text-lg text-muted-foreground">
          Ask when workers can re-enter a field, whether a criterion is a Major Must, or which
          rules drop if you do not irrigate. Every answer cites a criterion or a General
          Regulations clause. Nothing is invented from a model&apos;s memory.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg">
            <Link href="/search">
              Ask a question
              <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/criteria">Browse criteria</Link>
          </Button>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Ask</CardTitle>
            <CardDescription>
              A streaming answer with a plain-language summary, the rule as published, and
              cited passages.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/search">Open chat</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Criteria</CardTitle>
            <CardDescription>
              190 Smart and 191 GFS principles and criteria, with level, page and source.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/criteria">Browse criteria</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>My farm</CardTitle>
            <CardDescription>
              Answer the publisher&apos;s 16 scoping questions. See which criteria no longer apply.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/scope">Resolve checklist</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
