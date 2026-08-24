"use client";

import { FileCode2, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { extractArtifacts } from "../markdown-stream.ts";
import { cn } from "../cn.ts";
import { CodeBlock } from "./code-block.tsx";

export function ArtifactsPanel({
  markdown,
  open,
  onClose,
  mobile = false,
}: {
  markdown: string;
  open: boolean;
  onClose: () => void;
  mobile?: boolean;
}) {
  const artifacts = extractArtifacts(markdown);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 supports-backdrop-filter:bg-black/25 supports-backdrop-filter:backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "cf-chat fixed z-50 flex flex-col bg-(--cf-bg-elevated)! text-(--cf-fg) shadow-(--cf-shadow) outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
            mobile
              ? "inset-x-0 bottom-0 max-h-[85svh] rounded-t-2xl border-t border-(--cf-border) pb-[env(safe-area-inset-bottom)] data-[state=open]:slide-in-from-bottom-10 data-[state=closed]:slide-out-to-bottom-10"
              : "inset-y-0 right-0 h-full w-[min(28rem,100vw)] border-l border-(--cf-border) data-[state=open]:slide-in-from-right-10 data-[state=closed]:slide-out-to-right-10",
          )}
        >
          {mobile ? (
            <div className="flex justify-center pt-2" aria-hidden>
              <span className="h-1 w-10 rounded-full bg-(--cf-border)" />
            </div>
          ) : null}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-(--cf-border) px-3 py-2.5">
            <Dialog.Title className="flex items-center gap-2 text-sm font-medium">
              <FileCode2 className="size-4" aria-hidden />
              Artifacts
            </Dialog.Title>
            <Dialog.Close
              type="button"
              aria-label="Close artifacts"
              className="inline-flex size-8 items-center justify-center rounded-full text-(--cf-fg-muted) hover:bg-(--cf-bg-muted) hover:text-(--cf-fg)"
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {artifacts.length === 0 ? (
              <p className="text-sm text-(--cf-fg-muted)">
                Code the assistant fences will open here, separate from the chat.
              </p>
            ) : (
              artifacts.map((artifact, index) => (
                <div key={`${artifact.language}-${index}`} className="mb-4">
                  <p className="mb-1 text-xs font-medium text-(--cf-fg-muted)">{artifact.title}</p>
                  <CodeBlock language={artifact.language} code={artifact.code} />
                </div>
              ))
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
