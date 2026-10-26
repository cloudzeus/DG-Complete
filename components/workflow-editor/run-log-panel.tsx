import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { fmtDateTime, fmtDuration, fmtTime } from "@/components/dg/format";
import { StatusBadge } from "@/components/dg/status-badge";
import { RUN_STATUS, RUN_TRIGGER } from "@/lib/labels";
import type { RunStatus } from "@/lib/labels";
import { cn } from "@/lib/utils";

// Runs of the workflow under the editor, each with its logs (server-rendered, <details> — no JS).
// Secrets are already redacted in run_log (docs/08).

type RunWithLogs = {
  id: string;
  status: string;
  trigger: string;
  externalRef: string | null;
  version: number;
  createdAt: string;
  durationMs: number | null;
  error: string | null;
  logs: { at: string; level: string; message: string }[];
};

const LEVEL: Record<string, string> = { debug: "text-muted-foreground", info: "text-muted-foreground", warn: "text-warning-500", error: "text-danger-500" };

export function RunLogPanel({ runs, runsHref }: { runs: RunWithLogs[]; runsHref: string }) {
  if (!runs.length) return <p className="text-sm text-muted-foreground">Καμία εκτέλεση ακόμα — ξεκινήστε μια δοκιμή.</p>;
  return (
    <ul className="divide-y divide-border/60 rounded-lg border border-border/70">
      {runs.map((r, i) => (
        <li key={r.id}>
          <details open={i === 0} className="group">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
              <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none" />
              <StatusBadge status={r.status} map={RUN_STATUS as Record<RunStatus, { label: string; tone: never }>} />
              <span className="tabular-nums">{fmtDateTime(r.createdAt)}</span>
              <span className="text-xs text-muted-foreground">
                v{r.version} · {RUN_TRIGGER[r.trigger] ?? r.trigger}
                {r.externalRef && ` · ${r.externalRef}`} · {fmtDuration(r.durationMs)}
              </span>
              <Link href={`${runsHref}/${r.id}`} className="ml-auto text-xs text-primary hover:underline">
                Άνοιγμα
              </Link>
            </summary>
            <div className="border-t border-border/60 bg-muted/20 px-3 py-2">
              {r.error && <p className="mb-1.5 font-mono text-xs text-danger-500">{r.error}</p>}
              {r.logs.length === 0 ? (
                <p className="text-xs text-muted-foreground">Κανένα log ακόμα{r.status === "QUEUED" ? " — σε αναμονή worker." : "."}</p>
              ) : (
                <ol className="max-h-64 space-y-0.5 overflow-y-auto font-mono text-xs">
                  {r.logs.map((l, j) => (
                    <li key={j} className="grid grid-cols-[4.5rem_3rem_1fr] gap-x-3">
                      <span className="text-muted-foreground tabular-nums">{fmtTime(l.at)}</span>
                      <span className={cn("font-semibold uppercase", LEVEL[l.level])}>{l.level}</span>
                      <span className="break-words">{l.message}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
