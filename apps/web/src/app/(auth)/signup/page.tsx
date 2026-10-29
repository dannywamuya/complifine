"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Globe, Mail, User } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import {
  AuthField,
  AuthFooterLink,
  AuthShell,
  AuthSubmit,
} from "@/components/marketing/auth-shell";
import { AuthAlert, AuthPasswordField } from "@/components/marketing/auth-fields";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function SignupPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingApproval, setAwaitingApproval] = useState(false);

  if (awaitingApproval) {
    return (
      <AuthShell
        title="Account created"
        description="An operator will review your signup shortly."
        slide={1}
      >
        <Alert>
          <AlertTitle>Waiting for approval</AlertTitle>
          <AlertDescription>
            We will email you when your account is ready. You can then{" "}
            <Link href="/login" className="underline underline-offset-4">
              sign in
            </Link>
            .
          </AlertDescription>
        </Alert>
        <AuthFooterLink prompt="Already approved?" href="/login" label="Sign in" />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create a producer account"
      description="Set up your company, then start asking. AI cites the published standard."
      slide={1}
    >
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setPending(true);
          setError(null);
          try {
            const result = await api<{ pending?: boolean }>("/auth/register", {
              method: "POST",
              body: JSON.stringify({
                name: String(form.get("name") ?? ""),
                email: String(form.get("email") ?? ""),
                password: String(form.get("password") ?? ""),
                company: String(form.get("company") ?? ""),
                country: String(form.get("country") ?? "KE"),
              }),
            });
            if (result.pending) {
              setAwaitingApproval(true);
              return;
            }
            router.push("/app/setup");
            router.refresh();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : (err as Error).message);
          } finally {
            setPending(false);
          }
        }}
      >
        <AuthField
          label="Full name"
          name="name"
          autoComplete="name"
          placeholder="Enter your full name"
          required
          icon={<User className="size-4" />}
        />
        <AuthField
          label="Company"
          name="company"
          autoComplete="organization"
          placeholder="Your company"
          required
          icon={<Building2 className="size-4" />}
        />
        <AuthField
          label="Country"
          name="country"
          autoComplete="country"
          defaultValue="KE"
          placeholder="KE"
          icon={<Globe className="size-4" />}
        />
        <AuthField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          required
          icon={<Mail className="size-4" />}
        />
        <AuthPasswordField
          label="Password"
          name="password"
          autoComplete="new-password"
          placeholder="8+ characters"
          minLength={8}
        />
        {error ? <AuthAlert title="Could not create the account">{error}</AuthAlert> : null}
        <AuthSubmit pending={pending} idle="Create account" busy="Creating…" />
      </form>
      <AuthFooterLink prompt="Already have an account?" href="/login" label="Sign in" />
    </AuthShell>
  );
}
