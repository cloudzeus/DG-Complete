"use client";

import { useState, useTransition } from "react";
import { Wand2 } from "lucide-react";
import { toast } from "sonner";
import { proposeBudget, saveBudget } from "@/app/dashboards/[tenantId]/planning/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MONTHS = ["Ιαν", "Φεβ", "Μαρ", "Απρ", "Μαΐ", "Ιουν", "Ιουλ", "Αυγ", "Σεπ", "Οκτ", "Νοε", "Δεκ"];
type Row = { month: number; revenue: string; margin: string };
const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\./g, "").replace(",", ".")));

export function BudgetEditor({ tenantId, year, initial }: { tenantId: string; year: number; initial: { month: number; revenue: number | null; margin: number | null }[] }) {
  const [rows, setRows] = useState<Row[]>(
    Array.from({ length: 12 }, (_, i) => {
      const x = initial.find((r) => r.month === i + 1);
      return { month: i + 1, revenue: x?.revenue ? String(Math.round(x.revenue)) : "", margin: x?.margin ? String(Math.round(x.margin)) : "" };
    }),
  );
  const [growth, setGrowth] = useState("5");
  const [pending, start] = useTransition();
  const total = (k: "revenue" | "margin") => rows.reduce((a, r) => a + (num(r[k]) ?? 0), 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-xs">
          <span className="block">Πρόταση από πέρσι με αύξηση %</span>
          <Input value={growth} onChange={(e) => setGrowth(e.target.value)} inputMode="decimal" className="h-10 w-24" />
        </label>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const s = await proposeBudget(tenantId, year, Number(growth.replace(",", ".")) || 0);
              setRows(s.map((x) => ({ month: x.month, revenue: String(x.revenue), margin: String(x.margin) })));
              toast.success("Συμπληρώθηκε η πρόταση — ελέγξτε και αποθηκεύστε.");
            })
          }
        >
          <Wand2 className="size-4" /> Πρόταση στόχων
        </Button>
        <Button
          className="ml-auto"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveBudget(tenantId, year, rows.map((x) => ({ month: x.month, revenue: num(x.revenue), margin: num(x.margin) })));
              if (r.ok) toast.success(r.message);
              else toast.error(r.message);
            })
          }
        >
          Αποθήκευση στόχων {year}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-2 text-left font-medium" />
              {MONTHS.map((m) => (
                <th key={m} className="px-1 py-1.5 text-center font-medium">
                  {m}
                </th>
              ))}
              <th className="py-1.5 pl-2 text-right font-medium">Σύνολο</th>
            </tr>
          </thead>
          <tbody>
            {(["revenue", "margin"] as const).map((k) => (
              <tr key={k}>
                <th className="py-1 pr-2 text-left text-xs font-medium whitespace-nowrap">{k === "revenue" ? "Πωλήσεις €" : "Μικτό κέρδος €"}</th>
                {rows.map((r, i) => (
                  <td key={r.month} className="px-0.5 py-1">
                    <Input
                      aria-label={`${k === "revenue" ? "Πωλήσεις" : "Μικτό κέρδος"} ${MONTHS[i]}`}
                      inputMode="numeric"
                      value={r[k]}
                      onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))}
                      className="h-9 min-w-20 px-1.5 text-right text-xs tabular-nums"
                    />
                  </td>
                ))}
                <td className="py-1 pl-2 text-right text-xs font-semibold whitespace-nowrap tabular-nums">{Math.round(total(k)).toLocaleString("el-GR")} €</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
