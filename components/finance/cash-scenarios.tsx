"use client";

import { useMemo, useState } from "react";
import { MultiLineChart } from "@/components/charts/bi-charts";
import { cn } from "@/lib/utils";

// 13-week cash: the forecast as it stands vs a scenario — customers pay later, sales drop,
// payments change — and the lowest balance against the minimum the company wants to keep.

const eur = (v: number) => `${Math.round(v).toLocaleString("el-GR")} €`;

export function CashScenarios({ balance, weeks, minCash }: { balance: number; weeks: { week: number; start: string; inflow: number; outflow: number }[]; minCash: number | null }) {
  const [delay, setDelay] = useState(0); // days customers pay later
  const [sales, setSales] = useState(0); // % less collections
  const [pay, setPay] = useState(0); // % change of payments
  const [floor, setFloor] = useState(minCash ?? 0);

  const { rows, base, scen } = useMemo(() => {
    const n = weeks.length;
    const infl = weeks.map((w) => w.inflow * (1 - sales / 100));
    // Collections slide later by `delay` days (fractions spread over the next week).
    const shifted = Array(n).fill(0) as number[];
    const shiftW = delay / 7;
    infl.forEach((v, i) => {
      const j = i + Math.floor(shiftW);
      const frac = shiftW - Math.floor(shiftW);
      if (j < n) shifted[j] += v * (1 - frac);
      if (j + 1 < n) shifted[j + 1] += v * frac;
    });
    const base: number[] = [];
    const scen: number[] = [];
    for (let i = 0; i < n; i++) {
      base.push((base[i - 1] ?? balance) + weeks[i].inflow - weeks[i].outflow);
      scen.push((scen[i - 1] ?? balance) + shifted[i] - weeks[i].outflow * (1 + pay / 100));
    }
    const rows = weeks.map((w, i) => ({
      w: new Date(w.start).toLocaleDateString("el-GR", { day: "numeric", month: "numeric" }),
      base: Math.round(base[i]),
      scenario: Math.round(scen[i]),
    }));
    return { rows, base, scen };
  }, [weeks, balance, delay, sales, pay]);

  const low = Math.min(...scen);
  const lowWeek = scen.indexOf(low);
  const breach = floor > 0 ? scen.findIndex((v) => v < floor) : -1;
  const slider = (label: string, value: number, set: (v: number) => void, min: number, max: number, unit: string) => (
    <label className="block space-y-1">
      <span className="flex justify-between text-xs">
        <span>{label}</span>
        <b className="tabular-nums">
          {value > 0 && unit === "%" && min < 0 ? "+" : ""}
          {value}
          {unit}
        </b>
      </span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => set(Number(e.target.value))} className="h-6 w-full accent-sisyphus-500" />
    </label>
  );

  if (!weeks.length) return <p className="text-sm text-muted-foreground">Δεν υπάρχει πρόβλεψη ταμείου (χρειάζονται τα ανοιχτά υπόλοιπα πελατών και προμηθευτών).</p>;
  return (
    <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <div className="space-y-4">
        {slider("Οι πελάτες πληρώνουν αργότερα", delay, setDelay, 0, 45, " ημ.")}
        {slider("Λιγότερες εισπράξεις (πτώση πωλήσεων)", sales, setSales, 0, 50, "%")}
        {slider("Πληρωμές προμηθευτών & εξόδων", pay, setPay, -30, 30, "%")}
        <label className="block space-y-1 text-xs">
          <span>Ελάχιστο ταμείο που θέλετε να κρατάτε (€)</span>
          <input
            type="number"
            min={0}
            value={floor || ""}
            onChange={(e) => setFloor(Number(e.target.value) || 0)}
            className="h-10 w-full rounded-md border bg-background px-2 text-sm tabular-nums"
          />
        </label>
        <div className={cn("rounded-lg border p-3 text-sm", breach >= 0 ? "border-red-200 bg-red-50/70 dark:bg-red-950/20" : "border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20")}>
          <div className="text-xs text-muted-foreground">Χαμηλότερο ταμείο στο σενάριο</div>
          <div className={cn("text-xl font-semibold tabular-nums", low < 0 && "text-red-600")}>{eur(low)}</div>
          <div className="text-xs">
            {breach >= 0 ? `Πέφτει κάτω από το ελάχιστο την εβδομάδα της ${rows[breach].w}` : `την εβδομάδα της ${rows[lowWeek]?.w ?? "—"}`}
            {" · "}διαφορά από τη βάση {eur(low - Math.min(...base))}
          </div>
        </div>
      </div>
      <MultiLineChart
        data={rows}
        xKey="w"
        format="eur"
        series={[
          { key: "base", label: "Πρόβλεψη" },
          { key: "scenario", label: "Σενάριο" },
        ]}
        reference={floor > 0 ? { y: floor, label: "ελάχιστο" } : undefined}
      />
    </div>
  );
}
