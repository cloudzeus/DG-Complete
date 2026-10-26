"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Live progress of a run (docs/06 §8): listens to the SSE stream and re-renders the server
// component on each event (debounced). Falls back to a slow poll if the stream drops.
export function LiveRun({ tenantId, runId, refreshAt }: { tenantId: string; runId: string; refreshAt?: number }) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        router.refresh();
      }, 300);
    };
    const es = new EventSource(`/api/stream/runs/${encodeURIComponent(runId)}?tenantId=${encodeURIComponent(tenantId)}`);
    es.addEventListener("step.started", refresh);
    es.addEventListener("step", refresh);
    es.addEventListener("status", refresh);
    const poll = setInterval(() => {
      if (es.readyState === EventSource.CLOSED && document.visibilityState === "visible") router.refresh();
    }, 10_000);
    // One re-render when a still-queued run passes a minute (the page then explains why it waits).
    const once = refreshAt ? setTimeout(() => router.refresh(), Math.max(0, refreshAt - Date.now()) + 500) : null;
    return () => {
      es.close();
      clearInterval(poll);
      if (once) clearTimeout(once);
      if (timer) clearTimeout(timer);
    };
  }, [router, tenantId, runId, refreshAt]);
  return null;
}
