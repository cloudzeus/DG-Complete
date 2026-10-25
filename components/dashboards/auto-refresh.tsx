"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

// Re-renders the (server) page every `seconds` while the tab is visible; shows when it last did.

export function AutoRefresh({ seconds = 60, renderedAt }: { seconds?: number; renderedAt: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setLeft((l) => {
        if (l <= 1) {
          start(() => router.refresh());
          return seconds;
        }
        return l - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [router, seconds]);

  return (
    <button
      type="button"
      onClick={() => {
        setLeft(seconds);
        start(() => router.refresh());
      }}
      className="inline-flex min-h-9 items-center gap-2 rounded-full border bg-card px-3 text-xs text-muted-foreground hover:bg-muted"
      title="Ανανέωση τώρα"
    >
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
      </span>
      Live · {new Date(renderedAt).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      <RefreshCw className={cn("size-3.5", pending && "animate-spin")} />
      <span className="tabular-nums">{left}s</span>
    </button>
  );
}
