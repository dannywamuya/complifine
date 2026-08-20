import Link from "next/link";
import { Fragment } from "react";
import { parseAnswerSections } from "@/lib/chat";
import { cn } from "@/lib/utils";

const CRITERION = /\bFV[\s-]?(Smart|GFS)\s*\d{1,2}\.\d{1,2}(?:\.\d{1,2})?/i;

export function AnswerArticle({
  text,
  streaming = false,
}: {
  text: string;
  streaming?: boolean;
}) {
  const { summary, detail, practical } = parseAnswerSections(text);
  const caret = streaming ? <Caret /> : null;

  if (!summary && !detail && !practical) {
    return <div className="text-base leading-relaxed">{caret}</div>;
  }

  return (
    <div className="space-y-6">
      {summary ? (
        <section className="rounded-xl border border-border bg-muted/40 px-4 py-3">
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            At a glance
          </p>
          <div className="mt-2 text-base leading-snug">
            <Prose text={summary} />
            {!detail && !practical ? caret : null}
          </div>
        </section>
      ) : null}

      {detail ? (
        <section className="space-y-2">
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            What the standard says
          </p>
          <div className="text-sm leading-relaxed text-foreground/90">
            <Prose text={detail} />
            {!practical ? caret : null}
          </div>
        </section>
      ) : null}

      {practical ? (
        <section className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            What this means
          </p>
          <div className="mt-2 text-sm leading-relaxed">
            <Prose text={practical} />
            {caret}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Caret() {
  return (
    <span
      className="ml-0.5 inline-block h-[1.05em] w-0.5 translate-y-0.5 animate-pulse bg-primary align-text-bottom"
      aria-hidden
    />
  );
}

function Prose({ text }: { text: string }) {
  const blocks = splitBlocks(text);
  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        if (block.type === "list") {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <Inline text={item} />
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === "heading") {
          return (
            <p key={index} className="pt-1 font-medium">
              <Inline text={block.text} />
            </p>
          );
        }
        return (
          <p key={index}>
            <Inline text={block.text} />
          </p>
        );
      })}
    </div>
  );
}

type Block =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] };

function splitBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let list: string[] = [];

  const flushList = () => {
    if (list.length === 0) return;
    blocks.push({ type: "list", items: list });
    list = [];
  };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flushList();
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      list.push(bullet[1]!);
      continue;
    }
    flushList();
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({ type: "heading", text: heading[1]! });
      continue;
    }
    blocks.push({ type: "paragraph", text: line });
  }
  flushList();
  return blocks;
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]\n]{2,120}\]|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null;
        const citation = /^\[(.+)\]$/.exec(part);
        if (citation) {
          return <CitationChip key={index} raw={citation[1]!.trim()} />;
        }
        const bold = /^\*\*(.+)\*\*$/.exec(part);
        if (bold) {
          return (
            <strong key={index} className="font-medium">
              {bold[1]}
            </strong>
          );
        }
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </>
  );
}

function CitationChip({ raw }: { raw: string }) {
  const match = CRITERION.exec(raw);
  const href = match ? `/criteria/${encodeURIComponent(canonicalize(match[0]))}` : null;
  const className = cn(
    "mx-0.5 inline-flex translate-y-px items-center rounded-full bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground",
    href && "transition-colors hover:bg-accent hover:text-accent-foreground",
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {raw}
      </Link>
    );
  }

  return <span className={className}>{raw}</span>;
}

function canonicalize(raw: string): string {
  const match = /\bFV[\s-]?(Smart|GFS)\s*(\d{1,2})\.(\d{1,2})(?:\.(\d{1,2}))?/i.exec(raw);
  if (!match) return raw;
  const edition = match[1]!.toLowerCase() === "gfs" ? "FV-GFS" : "FV-Smart";
  const pad = (value: string | undefined) => (value ? value.padStart(2, "0") : undefined);
  return `${edition} ${[pad(match[2]), pad(match[3]), pad(match[4])].filter(Boolean).join(".")}`;
}
