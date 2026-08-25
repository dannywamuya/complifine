"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { OrgPayload } from "@/lib/farm";
import { SetupWizard } from "@/components/setup-wizard";
import { FarmPageSkeleton } from "@/components/app-skeletons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function SetupPage() {
  const [data, setData] = useState<OrgPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<OrgPayload>("/org")
      .then(setData)
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : (err as Error).message);
      });
  }, []);

  if (error && !data) {
    return (
      <div className="mx-auto w-full max-w-lg">
        <Alert>
          <AlertTitle>Could not load company</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!data) return <FarmPageSkeleton />;

  return <SetupWizard initial={data} />;
}
