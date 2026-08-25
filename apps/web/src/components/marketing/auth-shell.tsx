import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { AuthShowcase } from "@/components/marketing/auth-showcase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function AuthShell({
  title,
  description,
  children,
  slide = 0,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  slide?: number;
}) {
  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-2">
      <div className="relative flex min-h-0 flex-col overflow-y-auto bg-grey-olive-50 text-graphite-950">
        <div className="flex items-center justify-between px-6 py-6 sm:px-10">
          <Link href="/" className="shrink-0" aria-label="CompliFine home">
            <BrandLogo tone="light" />
          </Link>
        </div>
        <div className="flex flex-1 flex-col justify-center px-6 pb-12 sm:px-10">
          <div className="mx-auto w-full max-w-[24rem]">
            <h1 className="font-heading text-center text-[1.65rem] font-medium tracking-tight text-graphite-950 sm:text-3xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-2 text-center text-sm leading-relaxed text-iron-grey-500">
                {description}
              </p>
            ) : null}
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </div>
      <AuthShowcase slide={slide} />
    </div>
  );
}

export function AuthField({
  label,
  name,
  type = "text",
  required,
  autoComplete,
  placeholder,
  defaultValue,
  icon,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
  defaultValue?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name} className="text-sm font-semibold text-graphite-800">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={name}
          name={name}
          type={type}
          required={required}
          autoComplete={autoComplete}
          placeholder={placeholder}
          defaultValue={defaultValue}
          className={cn(
            "h-11 rounded-xl border-grey-olive-200 bg-grey-olive-50 px-3.5 text-sm text-graphite-950 shadow-none md:text-sm dark:border-grey-olive-200 dark:bg-grey-olive-50 dark:text-graphite-950",
            "placeholder:text-iron-grey-400",
            icon && "pr-11",
          )}
        />
        {icon ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-iron-grey-400">
            {icon}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function AuthSubmit({
  pending,
  idle,
  busy,
}: {
  pending: boolean;
  idle: string;
  busy: string;
}) {
  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-11 w-full rounded-xl text-sm font-semibold tracking-[0.08em] uppercase"
    >
      {pending ? busy : idle}
    </Button>
  );
}

export function AuthFooterLink({
  prompt,
  href,
  label,
}: {
  prompt: string;
  href: string;
  label: string;
}) {
  return (
    <p className="mt-6 text-center text-sm text-iron-grey-500">
      {prompt}{" "}
      <Link href={href} className="font-semibold text-primary underline-offset-4 hover:underline">
        {label}
      </Link>
    </p>
  );
}

export function MarketingFormShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="relative flex flex-1 flex-col">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="marketing-grid absolute inset-0 opacity-40" />
        <div className="marketing-glow absolute inset-0 opacity-80" />
      </div>
      <div
        className={cn(
          "relative mx-auto w-full max-w-md flex-1 px-4 py-16 sm:py-20",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
