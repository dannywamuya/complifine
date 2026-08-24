"use client";

import { ArrowUp, Paperclip, Sparkles, Square, X } from "lucide-react";
import { useEffect, useRef, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { CHAR_LIMIT, CHAR_WARN_AT, type Attachment, type ModelOption, type SelectOption } from "../types.ts";
import { cn } from "../cn.ts";
import { MenuSelect } from "./select.tsx";

export function Composer({
  draft,
  onChange,
  onSend,
  onStop,
  pending,
  enterSends,
  attachments,
  onRemoveAttachment,
  onFiles,
  placeholder = "Ask a question, or paste a criterion number…",
  version,
  versionOptions,
  onVersion,
  kind,
  kindOptions,
  onKind,
  models,
  modelId,
  onModel,
  disabled,
}: {
  draft: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  pending: boolean;
  enterSends: boolean;
  attachments: Attachment[];
  onRemoveAttachment: (id: string) => void;
  onFiles: (files: FileList | File[]) => void;
  placeholder?: string;
  version?: string;
  versionOptions?: SelectOption[];
  onVersion?: (value: string) => void;
  kind?: string;
  kindOptions?: SelectOption[];
  onKind?: (value: string) => void;
  models?: ModelOption[];
  modelId?: string;
  onModel?: (id: string) => void;
  disabled?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.overflowY = "hidden";
    const full = el.scrollHeight;
    el.style.height = `${Math.min(full, 200)}px`;
    el.style.overflowY = full > 200 ? "auto" : "hidden";
  }, [draft]);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter") return;
    if (event.nativeEvent.isComposing) return;
    const send = enterSends ? !event.shiftKey : event.metaKey || event.ctrlKey;
    if (send) {
      event.preventDefault();
      if (!pending && !disabled) onSend();
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer.files.length) onFiles(event.dataTransfer.files);
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files);
    if (files.length) {
      event.preventDefault();
      onFiles(files);
    }
  }

  const over = draft.length > CHAR_LIMIT;
  const warn = draft.length >= CHAR_WARN_AT;
  const canSend = draft.trim().length >= 2 && !over && !disabled;

  return (
    <div
      className="w-full min-w-0 rounded-[1.75rem] bg-(--cf-bg-muted) p-2 sm:p-2.5"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      {attachments.length > 0 ? (
        <ul className="flex flex-wrap gap-2 px-2 pt-1 pb-2" aria-label="Attachments">
          {attachments.map((file) => (
            <li
              key={file.id}
              className="relative flex items-center gap-2 rounded-xl border border-(--cf-border) bg-(--cf-bg-elevated) px-2 py-1.5 text-xs"
            >
              {file.kind === "image" && file.dataUrl ? (
                <img src={file.dataUrl} alt="" className="size-8 rounded-md object-cover" />
              ) : (
                <Paperclip className="size-3.5 text-(--cf-fg-muted)" aria-hidden />
              )}
              <span className="max-w-32 truncate">{file.name}</span>
              <span className="text-(--cf-fg-subtle)">{formatSize(file.size)}</span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                className="rounded-md p-0.5 hover:bg-(--cf-bg-muted)"
                onClick={() => onRemoveAttachment(file.id)}
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="cf-composer-input flex items-end gap-2 rounded-2xl bg-(--cf-bg-elevated) px-3 py-2 sm:px-3.5">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          rows={1}
          placeholder={placeholder}
          aria-label="Message"
          title={enterSends ? "Enter to send · Shift+Enter for a new line" : "⌘/Ctrl+Enter to send · Enter for a new line"}
          disabled={disabled}
          className="cf-composer-field max-h-50 min-h-11 w-full resize-none bg-transparent py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-(--cf-fg-subtle)"
        />
        {pending ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            className="mb-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-(--cf-bg-muted) text-(--cf-fg)"
          >
            <Square className="size-3 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send"
            className={cn(
              "mb-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
              canSend
                ? "bg-(--cf-accent) text-(--cf-accent-fg)"
                : "bg-(--cf-bg-muted) text-(--cf-fg-muted)",
            )}
          >
            <ArrowUp className="size-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1.5 pt-2 pb-0.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {versionOptions && onVersion ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Sparkles className="size-3.5 shrink-0 text-(--cf-accent)" aria-hidden />
              <MenuSelect
                label="Standard version"
                value={version ?? "all"}
                options={versionOptions}
                onChange={onVersion}
                disabled={pending}
                className="h-8 max-w-52 px-1 text-sm text-(--cf-fg) hover:bg-(--cf-bg-elevated) data-[state=open]:bg-(--cf-bg-elevated)"
              />
            </span>
          ) : null}
          {kindOptions && onKind ? (
            <MenuSelect
              label="Search kind"
              value={kind ?? "requirements"}
              options={kindOptions}
              onChange={onKind}
              disabled={pending}
              className="h-8 px-1 text-sm text-(--cf-fg)"
            />
          ) : null}
          {models && models.length > 0 && onModel ? (
            <MenuSelect
              label="Model"
              value={modelId ?? models[0]!.id}
              options={models.map((model) => ({ value: model.id, label: model.label }))}
              onChange={onModel}
              disabled={pending}
              className="h-8 px-1 text-sm text-(--cf-fg)"
            />
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {warn ? (
            <span className={cn("text-[11px] tabular-nums", over ? "text-(--cf-danger)" : "text-(--cf-fg-subtle)")}>
              {draft.length}/{CHAR_LIMIT}
            </span>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            multiple
            className="sr-only"
            onChange={(event) => {
              if (event.target.files) onFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            aria-label="Attach files"
            className="inline-flex h-9 items-center gap-2 rounded-full border border-(--cf-border) bg-(--cf-bg-elevated) px-3.5 text-sm text-(--cf-fg) shadow-[0_1px_2px_rgb(0_0_0/0.04)]"
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip className="size-3.5 text-(--cf-fg-muted)" />
            <span className="hidden sm:inline">Attach content</span>
            <span className="sm:hidden">Attach</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
