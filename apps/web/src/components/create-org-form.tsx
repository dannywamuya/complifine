"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { FarmOrg } from "@/lib/farm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateOrgForm({
  onCreated,
  submitLabel = "Create farm profile",
}: {
  onCreated: (org: FarmOrg) => Promise<void> | void;
  submitLabel?: string;
}) {
  const [pending, setPending] = useState(false);

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setPending(true);
        try {
          const org = await api<FarmOrg>("/org", {
            method: "POST",
            body: JSON.stringify({
              name: String(form.get("name") ?? ""),
              country: String(form.get("country") ?? "KE"),
              sedexZc: String(form.get("sedexZc") ?? ""),
            }),
          });
          await onCreated(org);
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="create-org-name">Company name</Label>
        <Input id="create-org-name" name="name" required placeholder="Naivasha Fresh Ltd" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="create-org-country">Country</Label>
        <Input id="create-org-country" name="country" defaultValue="KE" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="create-org-sedex">Sedex ZC (optional)</Label>
        <Input id="create-org-sedex" name="sedexZc" placeholder="ZC…" />
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Creating…" : submitLabel}
      </Button>
    </form>
  );
}
