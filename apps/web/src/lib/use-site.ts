"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { FarmSite, OrgPayload } from "@/lib/farm";

const STORAGE_KEY = "cf-site";
const SITE_EVENT = "cf-site";

/** Remember the site and tell any open records page to follow it. */
export function rememberSite(id: string) {
  window.localStorage.setItem(STORAGE_KEY, id);
  window.dispatchEvent(new CustomEvent(SITE_EVENT, { detail: id }));
}

/** The company and the site the records and evidence pages are working on. */
export function useSite() {
  const [org, setOrg] = useState<OrgPayload | null>(null);
  const [siteId, setSiteId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<OrgPayload>("/org")
      .then((payload) => {
        setOrg(payload);
        const stored = window.localStorage.getItem(STORAGE_KEY);
        const match = payload.sites.find((site) => site.id === stored);
        setSiteId(match?.id ?? payload.sites[0]?.id ?? "");
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const choose = useCallback((id: string) => {
    setSiteId(id);
    rememberSite(id);
  }, []);

  useEffect(() => {
    const onSite = (event: Event) => {
      const id = event instanceof CustomEvent && typeof event.detail === "string" ? event.detail : "";
      if (id) setSiteId(id);
    };
    window.addEventListener(SITE_EVENT, onSite);
    return () => window.removeEventListener(SITE_EVENT, onSite);
  }, []);

  const site = org?.sites.find((row) => row.id === siteId) ?? null;
  return { org, site, siteId, choose, error, sites: org?.sites ?? [] };
}

export type { FarmSite };
