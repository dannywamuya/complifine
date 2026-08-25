"use client";

import { useEffect } from "react";

/** Keep the document in light tokens so the split-screen form stays white. */
export function AuthLightMode() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark");
    return () => {
      root.classList.remove("dark");
    };
  }, []);

  return null;
}
