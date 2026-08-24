"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  LoaderCircle,
  Pencil,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "../cn.ts";
import { formatTime } from "../dates.ts";
import { looksStructured } from "../parse-answer.ts";
import { toolLabel } from "../tools.ts";
import type { ChatMessage, ToolChip } from "../types.ts";
import { AnswerArticle } from "./answer-article.tsx";
import { ConfirmDialog } from "./primitives.tsx";
import { MarkdownView } from "./markdown-view.tsx";

export function MessageBubble({
  message,
  branchIndex,
  branchCount,
  onPrevBranch,
  onNextBranch,
  onCopy,
  onEdit,
  onRegenerate,
  onRetry,
  onDelete,
  onFeedback,
  criterionHref,
}: {
  message: ChatMessage;
  branchIndex: number;
  branchCount: number;
  onPrevBranch: () => void;
  onNextBranch: () => void;
  onCopy: () => void;
  onEdit?: (next: string) => void;
  onRegenerate?: () => void;
  onRetry?: () => void;
  onDelete: () => void;
  onFeedback?: (vote: "up" | "down" | null) => void;
  criterionHref?: (id: string) => string;
}) {
  if (message.role === "user") {
    return (
      <UserBubble
        message={message}
        branchIndex={branchIndex}
        branchCount={branchCount}
        onPrevBranch={onPrevBranch}
        onNextBranch={onNextBranch}
        onCopy={onCopy}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );
  }
  return (
    <AssistantTurn
      message={message}
      branchIndex={branchIndex}
      branchCount={branchCount}
      onPrevBranch={onPrevBranch}
      onNextBranch={onNextBranch}
      onCopy={onCopy}
      onRegenerate={onRegenerate}
      onRetry={onRetry}
      onDelete={onDelete}
      onFeedback={onFeedback}
      criterionHref={criterionHref}
    />
  );
}

function UserBubble({
  message,
  branchIndex,
  branchCount,
  onPrevBranch,
  onNextBranch,
  onCopy,
  onEdit,
  onDelete,
}: {
  message: ChatMessage;
  branchIndex: number;
  branchCount: number;
  onPrevBranch: () => void;
  onNextBranch: () => void;
  onCopy: () => void;
  onEdit?: (next: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="max-w-[min(85%,36rem)] min-w-0 rounded-3xl rounded-br-lg bg-(--cf-user-bg) px-4 py-2.5 text-[15px] leading-relaxed wrap-anywhere text-(--cf-user-fg)">
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-h-20 w-full rounded-xl bg-white/10 px-2 py-1 text-[15px] text-(--cf-user-fg) outline-none"
              aria-label="Edit message"
            />
            <div className="flex justify-end gap-2">
              <button type="button" className="text-xs opacity-80" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-white/20 px-2 py-1 text-xs font-medium"
                onClick={() => {
                  onEdit?.(draft);
                  setEditing(false);
                }}
              >
                Resubmit
              </button>
            </div>
          </div>
        ) : (
          message.content
        )}
        {message.attachments.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {message.attachments.map((file) => (
              <li key={file.id}>
                {file.kind === "image" && file.dataUrl ? (
                  <img src={file.dataUrl} alt={file.name} className="max-h-40 rounded-lg" />
                ) : (
                  <span className="inline-flex items-center rounded-lg bg-white/10 px-2 py-1 text-xs">
                    {file.name}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <MessageActions>
        <BranchNav index={branchIndex} count={branchCount} onPrev={onPrevBranch} onNext={onNextBranch} />
        <Action icon={Copy} label="Copy" onClick={onCopy} />
        {onEdit ? <Action icon={Pencil} label="Edit" onClick={() => setEditing(true)} /> : null}
        <Action icon={Trash2} label="Delete" onClick={() => setConfirm(true)} />
        <time className="px-1 text-[10px] text-(--cf-fg-subtle)" dateTime={message.createdAt}>
          {formatTime(message.createdAt)}
        </time>
      </MessageActions>
      <ConfirmDialog
        open={confirm}
        title="Delete this message?"
        body="This message and every reply that follows it on this branch will be removed."
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          onDelete();
        }}
      />
    </div>
  );
}

function AssistantTurn({
  message,
  branchIndex,
  branchCount,
  onPrevBranch,
  onNextBranch,
  onCopy,
  onRegenerate,
  onRetry,
  onDelete,
  onFeedback,
  criterionHref,
}: {
  message: ChatMessage;
  branchIndex: number;
  branchCount: number;
  onPrevBranch: () => void;
  onNextBranch: () => void;
  onCopy: () => void;
  onRegenerate?: () => void;
  onRetry?: () => void;
  onDelete: () => void;
  onFeedback?: (vote: "up" | "down" | null) => void;
  criterionHref?: (id: string) => string;
}) {
  const tools = message.tools ?? [];
  const streaming = message.status === "streaming" || message.status === "pending";
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="space-y-3">
      {tools.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Tool activity">
          {tools.map((tool, index) => (
            <ToolChipBadge key={`${tool.name}-${index}`} tool={tool} />
          ))}
        </div>
      ) : streaming && !message.content ? (
        <p className="flex items-center gap-2 text-sm text-(--cf-fg-muted)" aria-live="polite">
          <LoaderCircle className="size-3.5 animate-spin" />
          Looking it up in the published standard…
        </p>
      ) : null}

      {message.error ? (
        <div className="rounded-2xl border border-(--cf-danger)/30 bg-(--cf-danger-soft) px-4 py-3 text-sm text-(--cf-danger)" role="alert">
          <p className="font-medium">Could not answer</p>
          <p className="mt-1">{message.error}</p>
          {onRetry ? (
            <button type="button" className="mt-2 rounded-lg bg-(--cf-danger) px-2.5 py-1 text-xs font-medium text-white" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      {message.content && looksStructured(message.content) ? (
        <AnswerArticle text={message.content} streaming={streaming} criterionHref={criterionHref} />
      ) : message.content ? (
        <MarkdownView text={message.content} streaming={streaming} criterionHref={criterionHref} />
      ) : null}

      {message.status === "stopped" && message.content ? (
        <p className="text-xs text-(--cf-fg-subtle)">Generation stopped.</p>
      ) : null}

      {message.ungrounded && message.ungrounded.length > 0 ? (
        <div className="rounded-2xl border border-(--cf-danger)/30 bg-(--cf-danger-soft) px-4 py-3 text-sm text-(--cf-danger)">
          <p className="font-medium">Ungrounded citations</p>
          <p className="mt-1">{message.ungrounded.map((citation) => citation.raw).join(", ")}</p>
        </div>
      ) : null}

      <MessageActions>
        <BranchNav index={branchIndex} count={branchCount} onPrev={onPrevBranch} onNext={onNextBranch} />
        <Action icon={Copy} label="Copy" onClick={onCopy} />
        {onRegenerate ? <Action icon={RefreshCw} label="Regenerate" onClick={onRegenerate} /> : null}
        {onFeedback ? (
          <>
            <Action
              icon={ThumbsUp}
              label="Good response"
              pressed={message.feedback === "up"}
              onClick={() => onFeedback(message.feedback === "up" ? null : "up")}
            />
            <Action
              icon={ThumbsDown}
              label="Bad response"
              pressed={message.feedback === "down"}
              onClick={() => onFeedback(message.feedback === "down" ? null : "down")}
            />
          </>
        ) : null}
        <Action icon={Trash2} label="Delete" onClick={() => setConfirm(true)} />
        {message.durationMs ? (
          <span className="px-1 text-[10px] text-(--cf-fg-subtle)">{(message.durationMs / 1000).toFixed(1)}s</span>
        ) : null}
      </MessageActions>
      <ConfirmDialog
        open={confirm}
        title="Delete this reply?"
        body="This reply and any messages that follow it on this branch will be removed."
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          onDelete();
        }}
      />
    </div>
  );
}

function ToolChipBadge({ tool }: { tool: ToolChip }) {
  const running = tool.status === "running";
  const error = tool.status === "error";
  return (
    <span
      className={cn(
        "cf-tool-chip inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
        running && "bg-(--cf-accent-soft) text-(--cf-accent)",
        tool.status === "done" && "bg-(--cf-accent-soft) text-(--cf-fg)",
        error && "bg-(--cf-danger-soft) text-(--cf-danger)",
      )}
      aria-busy={running || undefined}
      aria-live={running ? "polite" : undefined}
    >
      {running ? (
        <LoaderCircle className="size-3 animate-spin" aria-hidden />
      ) : error ? (
        <X className="size-3" aria-hidden />
      ) : (
        <Check className="size-3 text-(--cf-accent)" aria-hidden />
      )}
      {toolLabel(tool.name)}
    </span>
  );
}

function MessageActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-0.5 opacity-80">{children}</div>;
}

function Action({
  icon: Icon,
  label,
  onClick,
  pressed,
}: {
  icon: typeof Copy;
  label: string;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      className="inline-flex size-8 items-center justify-center rounded-lg text-(--cf-fg-muted) hover:bg-(--cf-bg-muted) hover:text-(--cf-fg) data-[on=true]:text-(--cf-accent)"
      data-on={pressed ? "true" : undefined}
    >
      <Icon className="size-3.5" />
    </button>
  );
}

function BranchNav({
  index,
  count,
  onPrev,
  onNext,
}: {
  index: number;
  count: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (count < 2) return null;
  return (
    <div className="mr-1 inline-flex items-center rounded-lg text-[11px] font-medium text-(--cf-fg-muted)" role="group" aria-label="Message versions">
      <button type="button" aria-label="Previous version" className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-(--cf-bg-muted)" onClick={onPrev}>
        <ChevronLeft className="size-3.5" />
      </button>
      <span className="tabular-nums">
        {index + 1}/{count}
      </span>
      <button type="button" aria-label="Next version" className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-(--cf-bg-muted)" onClick={onNext}>
        <ChevronRight className="size-3.5" />
      </button>
    </div>
  );
}

