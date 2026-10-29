"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function CapturePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <CaptureForm />
    </Suspense>
  );
}

function CaptureForm() {
  const params = useParams<{ templateId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const siteId = search.get("site") ?? "";
  const camera = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(files: File[]) {
    if (!siteId || files.length === 0) return;
    setBusy(true);
    const form = new FormData();
    form.set("siteId", siteId);
    form.set("templateId", params.templateId);
    for (const item of files) form.append("files", item);
    try {
      const result = await api<{ drafts: Array<{ id: string; templateId: string }> }>("/form-records/capture", {
        method: "POST",
        body: form,
      });
      const draft = result.drafts[0];
      if (!draft) {
        toast.error("Nothing in that file matched this record");
        setBusy(false);
        return;
      }
      router.push(`/app/records/${draft.templateId}/${draft.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Capture failed");
      setBusy(false);
    }
  }

  async function toggleMic() {
    if (recorder.current) {
      recorder.current.stop();
      recorder.current = null;
      setRecording(false);
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const media = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    media.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    media.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: media.mimeType || "audio/webm" });
      void send([new File([blob], "voice-note.webm", { type: blob.type || "audio/webm" })]);
    };
    recorder.current = media;
    media.start();
    setRecording(true);
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <header className="space-y-2">
        <Link href={`/app/records/${params.templateId}?site=${siteId}`} className="text-xs text-muted-foreground hover:underline">
          Back
        </Link>
        <h1 className="font-heading text-3xl font-medium tracking-tight">Capture</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Photograph the paper page, say the row, or attach the sheet. You will review the draft before it counts.
        </p>
      </header>
      <div className="flex flex-col gap-2">
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(event) => {
            const files = event.target.files ? [...event.target.files] : [];
            void send(files);
          }}
        />
        <input
          ref={file}
          type="file"
          accept="image/*,application/pdf,text/csv,.xlsx,audio/*"
          className="sr-only"
          onChange={(event) => {
            const files = event.target.files ? [...event.target.files] : [];
            void send(files);
          }}
        />
        <Button type="button" disabled={busy} onClick={() => camera.current?.click()}>
          Take a photo
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void toggleMic()}>
          {recording ? "Stop and create draft" : "Record a voice note"}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => file.current?.click()}>
          Choose a file
        </Button>
      </div>
    </div>
  );
}
