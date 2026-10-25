"use client";

import { useState } from "react";
import { AlertTriangle, Info, Lightbulb, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";
import type { GroupWithStock, TrendInsight } from "@/lib/demand-trends";
import { cn } from "@/lib/utils";

// Category / brand trends (24 months + 3-month forecast) and the insights they lead to.

const MONTHS = ["Ιαν", "Φεβ", "Μαρ", "Απρ", "Μαΐ", "Ιουν", "Ιουλ", "Αυγ", "Σεπ", "Οκτ", "Νοε", "Δεκ"];
const LEVEL = {
  risk: { icon: ShieldAlert, box: "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20", icon_: "text-red-600" },
  warning: { icon: AlertTriangle, box: "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20", icon_: "text-amber-600" },
  opportunity: { icon: Lightbulb, box: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20", icon_: "text-emerald-600" },
  info: { icon: Info, box: "border-sky-200 bg-sky-50/60 dark:border-sky-900 dark:bg-sky-950/20", icon_: "text-sky-600" },
} as const;

const compact = (v: number) => `${new Intl.NumberFormat("el-GR", { notation: "compact", maximumFractionDigits: 1 }).format(v)} €`;

/** 24 months of revenue (oldest first) + 3 forecast months, as a small area/line. */
function Spark({ revenue, forecast }: { revenue: number[]; forecast: number[] }) {
  const past = revenue.slice(1, 25).reverse(); // full months, oldest → newest
  const all = [...past, ...forecast];
  const max = Math.max(...all, 1);
  const x = (i: number) => (i / (all.length - 1)) * 160;
  const y = (v: number) => 34 - (Math.max(v, 0) / max) * 32;
  const line = (vals: number[], from: number) => vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(from + i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 160 36" className="h-9 w-full" aria-hidden>
      <path d={`${line(past, 0)} L${x(past.length - 1)},36 L0,36 Z`} className="fill-sky-100 dark:fill-sky-950/40" />
      <path d={line(past, 0)} className="fill-none stroke-sky-600" strokeWidth={1.2} />
      <path d={line([past[past.length - 1], ...forecast], past.length - 1)} className="fill-none stroke-violet-500" strokeWidth={1.4} strokeDasharray="3 2" />
      <line x1={x(11.5)} x2={x(11.5)} y1={0} y2={36} className="stroke-border" strokeDasharray="1 2" />
    </svg>
  );
}

function Pct({ v, label }: { v: number | null; label: string }) {
  if (v === null) return <span className="text-muted-foreground">{label} —</span>;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-semibold", v >= 10 ? "text-emerald-700" : v <= -10 ? "text-red-600" : "text-muted-foreground")}>
      {label} {v > 0 ? "+" : ""}
      {v}%
    </span>
  );
}

export function DemandTrends({
  insights,
  categories,
  brands,
  onPick,
}: {
  insights: TrendInsight[];
  categories: GroupWithStock[];
  brands: GroupWithStock[];
  onPick: (group: "category" | "brand", name: string) => void;
}) {
  const [by, setBy] = useState<"category" | "brand">("category");
  const [more, setMore] = useState(false);
  const list = (by === "category" ? categories : brands).filter((g) => g.id !== null && g.revenue12m > 0).slice(0, more ? 36 : 12);

  return (
    <div className="space-y-4">
      {insights.length > 0 && (
        <section aria-label="Ευρήματα" className="grid gap-2 md:grid-cols-2">
          {insights.slice(0, more ? 12 : 6).map((i) => {
            const L = LEVEL[i.level];
            return (
              <button
                key={i.title}
                type="button"
                onClick={() => onPick(i.group, i.name)}
                className={cn("flex gap-2.5 rounded-lg border p-3 text-left text-sm transition-shadow hover:shadow-fluent-4", L.box)}
              >
                <L.icon className={cn("mt-0.5 size-4 shrink-0", L.icon_)} />
                <span className="min-w-0 space-y-0.5">
                  <span className="block font-semibold">{i.title}</span>
                  <span className="block text-xs text-muted-foreground">{i.detail}</span>
                  <span className="block text-xs font-medium">→ {i.action}</span>
                </span>
              </button>
            );
          })}
        </section>
      )}

      <section aria-label="Τάσεις" className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Τάσεις {by === "category" ? "κατηγοριών" : "μαρκών"}</h2>
          <div className="inline-flex overflow-hidden rounded-md border text-xs" role="radiogroup" aria-label="Τάσεις ανά">
            {(["category", "brand"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={by === k}
                onClick={() => setBy(k)}
                className={cn("min-h-8 px-3 font-medium", by === k ? "bg-sisyphus-500 text-white" : "bg-background text-muted-foreground hover:bg-muted")}
              >
                {k === "category" ? "Κατηγορίες" : "Μάρκες"}
              </button>
            ))}
          </div>
          <span className="text-2xs text-muted-foreground">24 μήνες · μοβ διακεκομμένη = πρόβλεψη 3 μηνών · κλικ για τα είδη</span>
          <button type="button" onClick={() => setMore((m) => !m)} className="ml-auto text-xs text-sisyphus-600 hover:underline">
            {more ? "Λιγότερα" : "Περισσότερα"}
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onPick(by, g.name)}
              className="rounded-lg border bg-card p-3 text-left transition-shadow hover:shadow-fluent-4"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="line-clamp-2 text-sm font-medium">{g.name}</span>
                {g.direction === "up" ? (
                  <TrendingUp className="size-4 shrink-0 text-emerald-600" aria-label="Ανοδική" />
                ) : g.direction === "down" ? (
                  <TrendingDown className="size-4 shrink-0 text-red-600" aria-label="Πτωτική" />
                ) : null}
              </div>
              <Spark revenue={g.revenue} forecast={g.forecast} />
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-2xs tabular-nums">
                <span className="text-muted-foreground">12μ {compact(g.revenue12m)}</span>
                <Pct v={g.yoyPct} label="έτος" />
                <Pct v={g.quarterPct} label="τρίμ." />
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-2xs text-muted-foreground">
                <span>επόμ. 3μ ≈ {compact(g.forecast.reduce((a, v) => a + v, 0))}</span>
                {g.coverMonths !== null && (
                  <span className={cn(g.coverMonths < 1.5 && "font-semibold text-red-600", g.coverMonths > 12 && "font-semibold text-amber-700")}>
                    απόθεμα {g.coverMonths < 1 ? `${Math.max(1, Math.round(g.coverMonths * 4.3))} εβδ.` : `${Math.round(g.coverMonths)} μήν.`}
                  </span>
                )}
                {g.peaks.length > 0 && <span>αιχμή: {g.peaks.map((m) => MONTHS[m]).join(", ")}</span>}
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
