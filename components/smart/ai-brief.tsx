"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { smartBrief, type BriefKind } from "@/app/dashboards/[tenantId]/smart/actions";
import { KimonText } from "@/components/kimon/kimon-text";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** "Ask the AI" button of the smart modules: shows the brief inline (uses AI tokens). */
export function AiBrief({ tenantId, kind, refId = "", label = "Ανάλυση με AI", className }: { tenantId: string; kind: BriefKind; refId?: string | number; label?: string; className?: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className={cn("space-y-2", className)}>
      <Button
        size="sm"
        variant="outline"
        className="border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-900 dark:text-violet-300"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await smartBrief(tenantId, kind, String(refId));
            if (r.ok) setText(r.text);
            else setError(r.error);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} {text ? "Νέα ανάλυση" : label}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {text && (
        <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-900 dark:bg-violet-950/30">
          <KimonText text={text} />
        </div>
      )}
    </div>
  );
}
