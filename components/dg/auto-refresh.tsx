"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Re-renders the server component every few seconds while a run is still active (docs/06 §8 —
// until the SSE stream replaces it). Stops when the tab is hidden.
export function AutoRefresh({ everyMs = 2500 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, everyMs);
    return () => clearInterval(id);
  }, [router, everyMs]);
  return null;
}
