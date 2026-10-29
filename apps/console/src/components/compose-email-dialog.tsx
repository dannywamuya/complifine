"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ComposeEmailDialog({
  open,
  onOpenChange,
  to,
  title = "Send email",
  defaultSubject = "",
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  to: string;
  title?: string;
  defaultSubject?: string;
  onSend: (input: { subject: string; body: string }) => Promise<void>;
}) {
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setSubject(defaultSubject);
          setBody("");
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>To {to}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="crm-subject">Subject</Label>
            <Input
              id="crm-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              maxLength={200}
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="crm-body">Message</Label>
            <Textarea
              id="crm-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={8}
              maxLength={10_000}
              disabled={pending}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={pending || !subject.trim() || !body.trim()}
            onClick={async () => {
              setPending(true);
              setError(null);
              try {
                await onSend({ subject: subject.trim(), body: body.trim() });
                setSubject(defaultSubject);
                setBody("");
                onOpenChange(false);
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
