"use client";

import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { stabilizeMarkdown } from "../markdown-stream.ts";
import { CodeBlock } from "./code-block.tsx";

const CRITERION = /\b(?:FV[\s-]?(?:Smart|GFS)\s*\d{1,2}\.\d{1,2}(?:\.\d{1,2})?|SMETA\s+\d+(?:\.\d+)*)\b/gi;
const BRACKET_CITE = /\[([^\]\n]{2,80})\]/g;

export const MarkdownView = memo(function MarkdownView({
  text,
  streaming = false,
  criterionHref,
}: {
  text: string;
  streaming?: boolean;
  criterionHref?: (id: string) => string;
}) {
  const [shown, setShown] = useState(text);

  useEffect(() => {
    if (!streaming) {
      setShown(text);
      return;
    }
    const timer = window.setTimeout(() => setShown(text), 60);
    return () => window.clearTimeout(timer);
  }, [text, streaming]);

  const source = useMemo(() => stabilizeMarkdown(shown), [shown]);

  return (
    <div className="cf-chat-prose">
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre({ children }) {
            return <>{children}</>;
          },
          code({ className, children, ...props }) {
            const content = String(children).replace(/\n$/, "");
            const language = /language-(\w+)/.exec(className ?? "")?.[1];
            const multiline = content.includes("\n") || Boolean(language);
            if (!multiline) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }
            return <CodeBlock language={language} code={content} />;
          },
          p({ children }) {
            return <p>{linkify(children, criterionHref)}</p>;
          },
          li({ children }) {
            return <li>{linkify(children, criterionHref)}</li>;
          },
          a({ href, children }) {
            return (
              <a href={href} target={href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {source}
      </Markdown>
      {streaming ? <span className="ml-0.5 inline-block h-[1.05em] w-0.5 translate-y-0.5 animate-pulse bg-(--cf-accent) align-text-bottom" aria-hidden /> : null}
    </div>
  );
});

function linkify(children: ReactNode, criterionHref?: (id: string) => string): ReactNode {
  if (typeof children !== "string") {
    if (Array.isArray(children)) {
      return children.map((child, index) => <span key={index}>{linkify(child, criterionHref)}</span>);
    }
    return children;
  }
  const pieces: ReactNode[] = [];
  let last = 0;
  const combined = new RegExp(`${CRITERION.source}|${BRACKET_CITE.source}`, "gi");
  for (const match of children.matchAll(combined)) {
    const index = match.index ?? 0;
    if (index > last) pieces.push(children.slice(last, index));
    const raw = match[0];
    const inner = match[1] ?? raw;
    const href = criterionHref?.(canonicalize(inner) ?? inner);
    pieces.push(
      href ? (
        <a key={`${index}-${raw}`} href={href} className="cf-chat-citation">
          {raw.replace(/^\[|\]$/g, "")}
        </a>
      ) : (
        <span key={`${index}-${raw}`} className="cf-chat-citation">
          {raw.replace(/^\[|\]$/g, "")}
        </span>
      ),
    );
    last = index + raw.length;
  }
  if (last < children.length) pieces.push(children.slice(last));
  return pieces;
}

function canonicalize(raw: string): string | null {
  const match = /\bFV[\s-]?(Smart|GFS)\s*(\d{1,2})\.(\d{1,2})(?:\.(\d{1,2}))?/i.exec(raw);
  if (!match) return null;
  const edition = match[1]!.toLowerCase() === "gfs" ? "FV-GFS" : "FV-Smart";
  const pad = (value: string | undefined) => (value ? value.padStart(2, "0") : undefined);
  return `${edition} ${[pad(match[2]), pad(match[3]), pad(match[4])].filter(Boolean).join(".")}`;
}
