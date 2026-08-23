"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef, useState } from "react";
import { siblingsOf } from "../thread.ts";
import { VIRTUALIZE_AFTER, type ChatMessage } from "../types.ts";
import { copyText } from "./code-block.tsx";
import { EmptyState } from "./empty-state.tsx";
import { JumpLatest } from "./jump-latest.tsx";
import { MessageBubble } from "./message-bubble.tsx";

export function ThreadView({
  path,
  tree,
  emptyTitle,
  emptyBody,
  suggestions,
  onPick,
  onSelectBranch: _onSelectBranch,
  onCycleBranch,
  onEdit,
  onRegenerate,
  onRetry,
  onDelete,
  onFeedback,
  criterionHref,
}: {
  path: ChatMessage[];
  tree: ChatMessage[];
  emptyTitle: string;
  emptyBody: string;
  suggestions: string[];
  onPick: (value: string) => void;
  onSelectBranch: (id: string) => void;
  onCycleBranch: (id: string, delta: number) => void;
  onEdit: (userId: string, next: string) => void;
  onRegenerate: (assistantId: string) => void;
  onRetry: (assistantId: string) => void;
  onDelete: (id: string) => void;
  onFeedback?: (id: string, vote: "up" | "down" | null) => void;
  criterionHref?: (id: string) => string;
}) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const stick = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const virtualize = path.length >= VIRTUALIZE_AFTER;

  const virtualizer = useVirtualizer({
    count: path.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 180,
    overscan: 8,
    enabled: virtualize,
  });

  const follow = useCallback(() => {
    if (!stick.current) return;
    const el = parentRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    follow();
  }, [path, follow]);

  function onScroll() {
    const el = parentRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stick.current = atBottom;
    setShowJump(!atBottom);
  }

  function jump() {
    stick.current = true;
    setShowJump(false);
    follow();
  }

  if (path.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EmptyState title={emptyTitle} body={emptyBody} suggestions={suggestions} onPick={onPick} />
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={parentRef}
        className="h-full overflow-y-auto"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversation messages"
        onScroll={onScroll}
      >
        {virtualize ? (
          <div className="relative mx-auto w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const message = path[item.index]!;
              return (
                <div
                  key={message.id}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  className="absolute top-0 left-0 w-full py-4"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <Row
                    message={message}
                    tree={tree}
                    onCycleBranch={onCycleBranch}
                    onEdit={onEdit}
                    onRegenerate={onRegenerate}
                    onRetry={onRetry}
                    onDelete={onDelete}
                    onFeedback={onFeedback}
                    criterionHref={criterionHref}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex w-full flex-col gap-8 py-8">
            {path.map((message) => (
              <Row
                key={message.id}
                message={message}
                tree={tree}
                onCycleBranch={onCycleBranch}
                onEdit={onEdit}
                onRegenerate={onRegenerate}
                onRetry={onRetry}
                onDelete={onDelete}
                onFeedback={onFeedback}
                criterionHref={criterionHref}
              />
            ))}
          </div>
        )}
      </div>
      {showJump ? <JumpLatest onClick={jump} /> : null}
    </div>
  );
}

function Row({
  message,
  tree,
  onCycleBranch,
  onEdit,
  onRegenerate,
  onRetry,
  onDelete,
  onFeedback,
  criterionHref,
}: {
  message: ChatMessage;
  tree: ChatMessage[];
  onCycleBranch: (id: string, delta: number) => void;
  onEdit: (userId: string, next: string) => void;
  onRegenerate: (assistantId: string) => void;
  onRetry: (assistantId: string) => void;
  onDelete: (id: string) => void;
  onFeedback?: (id: string, vote: "up" | "down" | null) => void;
  criterionHref?: (id: string) => string;
}) {
  const versions = siblingsOf(tree, message.id);
  const index = Math.max(0, versions.findIndex((item) => item.id === message.id));
  return (
    <MessageBubble
      message={message}
      branchIndex={index}
      branchCount={versions.length}
      onPrevBranch={() => onCycleBranch(message.id, -1)}
      onNextBranch={() => onCycleBranch(message.id, 1)}
      onCopy={() => void copyText(message.content)}
      onEdit={message.role === "user" ? (next) => onEdit(message.id, next) : undefined}
      onRegenerate={message.role === "assistant" ? () => onRegenerate(message.id) : undefined}
      onRetry={message.role === "assistant" && message.status === "error" ? () => onRetry(message.id) : undefined}
      onDelete={() => onDelete(message.id)}
      onFeedback={message.role === "assistant" ? (vote) => onFeedback?.(message.id, vote) : undefined}
      criterionHref={criterionHref}
    />
  );
}
