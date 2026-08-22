"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCertScope } from "@/components/cert-scope";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function VersionSelect({
  value,
  onValueChange,
  id,
}: {
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
}) {
  const { versions } = useCertScope();
  const current = value || versions[0]?.code || "";

  return (
    <Select value={current} onValueChange={onValueChange}>
      <SelectTrigger id={id} className="w-full min-w-0 max-w-64">
        <SelectValue placeholder="Version" />
      </SelectTrigger>
      <SelectContent>
        {versions.map((version) => (
          <SelectItem key={version.code} value={version.code}>
            {version.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function useScopedVersionState(initial?: string) {
  const { defaultVersionCode, versions } = useCertScope();
  const [value, setValue] = useState(initial ?? "");
  const resolved = useMemo(() => {
    if (value && versions.some((version) => version.code === value)) return value;
    return defaultVersionCode ?? "";
  }, [value, versions, defaultVersionCode]);
  return [resolved, setValue] as const;
}
