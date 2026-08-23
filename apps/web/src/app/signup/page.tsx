"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignupPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <PageShell className="max-w-md space-y-6 pt-10">
      <Card>
        <CardHeader>
          <CardTitle>Create a producer account</CardTitle>
          <CardDescription>
            This creates your organisation. You can add sites and certification scope next.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setPending(true);
              setError(null);
              try {
                await api("/auth/register", {
                  method: "POST",
                  body: JSON.stringify({
                    name: String(form.get("name") ?? ""),
                    email: String(form.get("email") ?? ""),
                    password: String(form.get("password") ?? ""),
                    company: String(form.get("company") ?? ""),
                    country: String(form.get("country") ?? "KE"),
                  }),
                });
                router.push("/app");
                router.refresh();
              } catch (err) {
                setError(err instanceof ApiError ? err.message : (err as Error).message);
              } finally {
                setPending(false);
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Input id="company" name="company" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input id="country" name="country" defaultValue="KE" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password (8+ characters)</Label>
              <Input id="password" name="password" type="password" minLength={8} required />
            </div>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Could not create the account</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Creating…" : "Create account"}
            </Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground">
            Already registered?{" "}
            <Link href="/login" className="underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
}
