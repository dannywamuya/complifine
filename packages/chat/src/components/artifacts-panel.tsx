"use client";

import { FileCode2, X } from "lucide-react";
import { extractArtifacts } from "../markdown-stream.ts";
import { CodeBlock } from "./code-block.tsx";

export function ArtifactsPanel({
  markdown,
  open,
  onClose,
}: {
  markdown: string;
  open: boolean;
  onClose: () => void;
}) {
  const artifacts = extractArtifacts(markdown);
  if (!open) return null;

  return (
    <aside className="flex h-full min-h-0 w-[min(28rem,100%)] shrink-0 flex-col border-l border-(--cf-border) bg-(--cf-bg-elevated)" aria-label="Artifacts">
      <div className="flex items-center justify-between gap-2 border-b border-(--cf-border) px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FileCode2 className="size-4" aria-hidden />
          Artifacts
        </div>
        <button type="button" aria-label="Close artifacts" className="rounded-lg p-1 hover:bg-(--cf-bg-muted)" onClick={onClose}>
          <X className="size-4" />
        </button>
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
    </aside>
  );
}
