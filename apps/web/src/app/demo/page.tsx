"use client";

import { useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const CAL = process.env.NEXT_PUBLIC_CAL_URL;

export default function DemoPage() {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(form: FormData) {
    setPending(true);
    setError(null);
    try {
      await api("/demo-requests", {
        method: "POST",
        body: JSON.stringify({
          name: String(form.get("name") ?? ""),
          company: String(form.get("company") ?? ""),
          email: String(form.get("email") ?? ""),
          phone: String(form.get("phone") ?? "") || undefined,
          interests: String(form.get("interests") ?? "both"),
          message: String(form.get("message") ?? "") || undefined,
        }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <PageShell className="max-w-xl space-y-6 pt-8">
      <div>
        <p className="text-sm text-muted-foreground">Talk to us</p>
        <h1 className="font-heading text-3xl font-medium tracking-tight">Book a demo</h1>
        <p className="mt-2 text-muted-foreground">
          We work with Kenyan horticultural exporters preparing for GLOBALG.A.P. and SMETA. Tell us
          which sites you run and which buyers you sell to.
        </p>
      </div>

      {done ? (
        <Alert>
          <AlertTitle>Request received</AlertTitle>
          <AlertDescription>
            We will write to the address you gave. Meanwhile you can{" "}
            <Link href="/signup" className="underline">
              create an account
            </Link>{" "}
            and set up your farm.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Your details</CardTitle>
            <CardDescription>We use this only to arrange a walkthrough.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void submit(new FormData(event.currentTarget));
              }}
            >
              <Field label="Name" name="name" required />
              <Field label="Company" name="company" required />
              <Field label="Work email" name="email" type="email" required />
              <Field label="Phone" name="phone" />
              <div className="space-y-2">
                <Label htmlFor="interests">Standards of interest</Label>
                <select
                  id="interests"
                  name="interests"
                  defaultValue="both"
                  className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                >
                  <option value="globalgap-ifa">GLOBALG.A.P. IFA v6</option>
                  <option value="smeta-7">SMETA 7.0</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">What should we cover?</Label>
                <Textarea id="message" name="message" rows={4} />
              </div>
              {error ? (
                <Alert variant="destructive">
                  <AlertTitle>Could not send</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <Button type="submit" disabled={pending}>
                {pending ? "Sending…" : "Request a demo"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {CAL ? (
        <p className="text-sm text-muted-foreground">
          Prefer a calendar link?{" "}
          <a href={CAL} className="underline" target="_blank" rel="noreferrer">
            Pick a time
          </a>
          .
        </p>
      ) : null}
    </PageShell>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} required={required} />
    </div>
  );
}
