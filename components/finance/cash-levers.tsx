"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// What-if: fewer days of stock, faster collection, longer supplier credit → cash freed.

const eur = (v: number) => `${Math.round(v).toLocaleString("el-GR")} €`;

export function CashLevers({ perDay, current }: { perDay: { dio: number; dso: number; dpo: number }; current: { dio: number | null; dso: number | null; dpo: number | null } }) {
  const [dio, setDio] = useState(0);
  const [dso, setDso] = useState(0);
  const [dpo, setDpo] = useState(0);
  const freed = dio * perDay.dio + dso * perDay.dso + dpo * perDay.dpo;
  const lever = (label: string, hint: string, value: number, set: (v: number) => void, max: number, per: number, now: number | null, sign: "−" | "+") => (
    <div className="space-y-1.5 rounded-lg border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          σήμερα {now === null ? "—" : `${Math.round(now)} ημ.`} · 1 ημέρα = {eur(per)}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        onChange={(e) => set(Number(e.target.value))}
        className="h-6 w-full accent-sisyphus-500"
        aria-label={label}
      />
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{hint}</span>
        <span className="font-semibold tabular-nums">
          {sign}
          {value} ημ. → {eur(value * per)}
        </span>
      </div>
    </div>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
      <div className="space-y-3">
        {lever("Λιγότερο απόθεμα", "ημέρες αποθέματος", dio, setDio, Math.max(10, Math.min(365, Math.round((current.dio ?? 60) * 0.6))), perDay.dio, current.dio, "−")}
        {lever("Γρηγορότερη είσπραξη", "ημέρες είσπραξης", dso, setDso, Math.max(5, Math.min(90, Math.round((current.dso ?? 30) * 0.6))), perDay.dso, current.dso, "−")}
        {lever("Μεγαλύτερη πίστωση προμηθευτών", "ημέρες πληρωμής", dpo, setDpo, 60, perDay.dpo, current.dpo, "+")}
      </div>
      <div className={cn("flex flex-col items-center justify-center rounded-xl border p-4 text-center", freed > 0 ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20" : "bg-muted/30")}>
        <div className="text-xs text-muted-foreground">Μετρητά που αποδεσμεύονται</div>
        <div className={cn("text-3xl font-semibold tabular-nums", freed > 0 && "text-emerald-700 dark:text-emerald-400")}>{eur(freed)}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          κύκλος {current.dio !== null && current.dso !== null ? Math.round((current.dio - dio) + (current.dso - dso) - ((current.dpo ?? 0) + dpo)) : "—"} ημ.
        </div>
      </div>
    </div>
  );
}
