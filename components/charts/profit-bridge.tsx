import { ArrowRight } from "lucide-react";
import { eurCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

// Profit bridge as diverging bars: last year's and this year's totals as headline figures, and one
// row per driver with a bar from zero (green = added profit, red = lost) scaled to the drivers —
// small effects stay readable, unlike a waterfall where they vanish next to the totals.

const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${eurCompact(Math.abs(v))}`;

export function ProfitBridge({ steps }: { steps: { name: string; value: number; total?: boolean }[] }) {
  const totals = steps.filter((s) => s.total);
  const parts = steps.filter((s) => !s.total);
  const start = totals[0];
  const end = totals[totals.length - 1];
  const change = start && end ? end.value - start.value : parts.reduce((a, p) => a + p.value, 0);
  const max = Math.max(1, ...parts.map((p) => Math.abs(p.value)));

  return (
    <div className="space-y-4">
      {start && end && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 p-3">
          <Total label={start.name} value={start.value} />
          <ArrowRight className="size-4 text-muted-foreground" />
          <Total label={end.name} value={end.value} />
          <span className={cn("ml-auto rounded-md px-2 py-1 text-sm font-semibold tabular-nums", change >= 0 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200")}>
            {signed(change)}
            {start.value ? ` (${change >= 0 ? "+" : "−"}${Math.abs(Math.round((change / Math.abs(start.value)) * 100))}%)` : ""}
          </span>
        </div>
      )}

      <div className="space-y-1.5">
        <div className="grid grid-cols-[minmax(7rem,10rem)_1fr_5.5rem] gap-3 text-2xs text-muted-foreground">
          <span />
          <div className="grid grid-cols-2">
            <span className="pr-2 text-right">μείωσε το κέρδος ←</span>
            <span className="pl-2">→ αύξησε το κέρδος</span>
          </div>
          <span />
        </div>
        {parts.map((p) => {
          const w = (Math.abs(p.value) / max) * 100;
          const up = p.value >= 0;
          return (
            <div key={p.name} className="grid grid-cols-[minmax(7rem,10rem)_1fr_5.5rem] items-center gap-3 text-xs">
              <span className="truncate font-medium" title={p.name}>
                {p.name}
              </span>
              <div className="relative grid h-6 grid-cols-2">
                <div className="flex justify-end border-r border-foreground/30">
                  {!up && <div className="h-full rounded-l bg-red-500/85" style={{ width: `${Math.max(w, 0.8)}%` }} />}
                </div>
                <div className="flex">{up && <div className="h-full rounded-r bg-emerald-500/85" style={{ width: `${Math.max(w, 0.8)}%` }} />}</div>
              </div>
              <span className={cn("text-right font-semibold tabular-nums", p.value > 0 ? "text-emerald-700 dark:text-emerald-400" : p.value < 0 ? "text-red-700 dark:text-red-400" : "text-muted-foreground")}>
                {p.value === 0 ? "—" : signed(p.value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-2xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{eurCompact(value)}</div>
    </div>
  );
}
