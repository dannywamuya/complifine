"use client";

import { useState } from "react";
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

export default function SignupPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AuthShell
      title="Create a producer account"
      description="This creates your company. Next you will choose certifications and add a site."
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
