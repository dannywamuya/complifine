"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import {
  AuthField,
  AuthFooterLink,
  AuthShell,
  AuthSubmit,
} from "@/components/marketing/auth-shell";
import { AuthAlert, AuthPasswordField } from "@/components/marketing/auth-fields";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = safeNext(params.get("next"));

  return (
    <AuthShell title="Sign in to CompliFine" description="Ask what applies at your sites — in your own words.">
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setPending(true);
          setError(null);
          try {
            await api("/auth/login", {
              method: "POST",
              body: JSON.stringify({
                email: String(form.get("email") ?? ""),
                password: String(form.get("password") ?? ""),
              }),
            });
            router.push(next);
            router.refresh();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : (err as Error).message);
          } finally {
            setPending(false);
          }
        }}
      >
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
          autoComplete="current-password"
          placeholder="Enter your password"
        />
        {error ? <AuthAlert title="Could not sign in">{error}</AuthAlert> : null}
        <AuthSubmit pending={pending} idle="Sign in" busy="Signing in…" />
      </form>
      <AuthFooterLink prompt="No account?" href="/signup" label="Create one" />
    </AuthShell>
  );
}

function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/app";
  if (value === "/app/ask" || value.startsWith("/app/search")) return "/app";
  if (value === "/app/farm" || value.startsWith("/app/farm/")) return "/app/company";
  if (value.startsWith("/app")) return value;
  return "/app";
}
