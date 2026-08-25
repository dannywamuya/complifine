"use client";

import { useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function AuthPasswordField({
  label,
  name,
  autoComplete,
  placeholder,
  minLength,
}: {
  label: string;
  name: string;
  autoComplete?: string;
  placeholder?: string;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor={name} className="text-sm font-semibold text-zinc-800">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={name}
          name={name}
          type={visible ? "text" : "password"}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className={cn(
            "h-11 rounded-xl border-zinc-200 bg-white px-3.5 pr-11 text-sm text-zinc-950 shadow-none md:text-sm dark:border-zinc-200 dark:bg-white dark:text-zinc-950",
            "placeholder:text-zinc-400",
          )}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          className="absolute inset-y-0 right-2 flex items-center rounded-md px-1.5 text-zinc-400 hover:text-zinc-700"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

export function AuthAlert({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-800">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="text-red-700/90">{children}</AlertDescription>
    </Alert>
  );
}
