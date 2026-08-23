"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "../cn.ts";

export function CodeBlock({
  language,
  code,
  className,
}: {
  language?: string;
  code: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const label = language?.trim() || "text";

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard may be blocked
    }
  }

  return (
    <div className={cn("cf-chat-code", className)}>
      <header>
        <span>{label}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px] font-medium tracking-normal text-(--cf-fg-muted) uppercase hover:bg-(--cf-bg-elevated) hover:text-(--cf-fg)"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </header>
      <pre>
        <code className={language ? `language-${language}` : undefined}>{code}</code>
      </pre>
    </div>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
