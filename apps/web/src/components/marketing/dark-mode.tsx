"use client";

import { useEffect } from "react";

/** Set after mount so `<html>` matches SSR. Portals (Sheet, Select) pick up dark tokens. */
export function MarketingDarkMode() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
    return () => {
      document.documentElement.classList.remove("dark");
    };
  }, []);

  return null;
}
