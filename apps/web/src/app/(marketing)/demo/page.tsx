"use client";

import { useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { MarketingFormShell } from "@/components/marketing/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CAL = process.env.NEXT_PUBLIC_CAL_URL;

export default function DemoPage() {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interests, setInterests] = useState("both");

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
    <MarketingFormShell className="max-w-xl">
      <div className="mb-8">
        <p className="font-mono text-[11px] font-medium tracking-[0.18em] text-primary uppercase">
          Talk to us
        </p>
        <h1 className="font-heading mt-2 text-3xl font-medium tracking-tight">
          Book a demo
        </h1>
        <p className="mt-2 max-w-[65ch] text-muted-foreground">
          If you are preparing for GLOBALG.A.P. and SMETA, tell us which sites
          you run and which buyers you sell to.
        </p>
      </div>

      {done ? (
        <Alert className="border-white/10">
          <AlertTitle>Request received</AlertTitle>
          <AlertDescription>
            We will write to the address you gave. Meanwhile you can{" "}
            <Link href="/signup" className="text-foreground underline-offset-4 hover:underline">
              create an account
            </Link>{" "}
            and set up your company.
          </AlertDescription>
        </Alert>
      ) : (
        <Card className="border border-white/10 bg-card/80 ring-0">
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
              <Field label="Name" name="name" autoComplete="name" required />
              <Field label="Company" name="company" autoComplete="organization" required />
              <Field
                label="Work email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
              <Field label="Phone" name="phone" type="tel" autoComplete="tel" />
              <div className="space-y-2">
                <Label htmlFor="interests">Standards of interest</Label>
                <input type="hidden" name="interests" value={interests} />
                <Select value={interests} onValueChange={setInterests}>
                  <SelectTrigger id="interests" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="globalgap-ifa">GLOBALG.A.P. IFA v6</SelectItem>
                    <SelectItem value="smeta-7">SMETA 7.0</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
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
              <Button type="submit" disabled={pending} className="w-full">
                {pending ? "Sending…" : "Request a demo"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {CAL ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Prefer a calendar link?{" "}
          <a
            href={CAL}
            className="text-foreground underline-offset-4 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            Pick a time
          </a>
          .
        </p>
      ) : null}
    </MarketingFormShell>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
      />
    </div>
  );
}
