import type { Driver, LeakRow } from "@/lib/profitability";
import { cn } from "@/lib/utils";

const eur = (v: number) => `${Math.round(v).toLocaleString("el-GR")} €`;

export function DriverTable({ rows, empty }: { rows: Driver[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col />
          <col className="w-24" />
        </colgroup>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.code}-${r.name}`} className="border-b align-top last:border-0">
              <td className="py-2 pr-3">
                <div className="truncate font-medium" title={r.name}>
                  {r.name}
                </div>
                <div className="truncate text-2xs text-muted-foreground">{[r.code, r.brand, r.detail].filter(Boolean).join(" · ")}</div>
              </td>
              <td className={cn("py-2 text-right font-semibold whitespace-nowrap tabular-nums", r.effect >= 0 ? "text-emerald-700" : "text-red-600")}>
                {r.effect >= 0 ? "+" : "−"}
                {eur(Math.abs(r.effect))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** List value vs what was invoiced, the discount given and losses below cost. */
export function LeakTable({ rows, label }: { rows: LeakRow[]; label: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b text-left">
            <th className="py-2 pr-3 font-medium">{label}</th>
            <th className="py-2 pr-3 text-right font-medium">Τιμή καταλόγου</th>
            <th className="py-2 pr-3 text-right font-medium">Τιμολογήθηκε</th>
            <th className="py-2 pr-3 font-medium">Έκπτωση</th>
            <th className="py-2 text-right font-medium" title="Ζημία από γραμμές κάτω του κόστους">
              Κάτω του κόστους
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b last:border-0">
              <td className="max-w-56 truncate py-2 pr-3" title={r.name}>
                {r.name}
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums text-muted-foreground">{eur(r.list)}</td>
              <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">{eur(r.actual)}</td>
              <td className="py-2 pr-3">
                <div className="flex items-center gap-2">
                  <span className="relative h-2 w-24 overflow-hidden rounded-full bg-muted">
                    <span className={cn("absolute inset-y-0 left-0 rounded-full", r.leakPct > 50 ? "bg-red-500" : r.leakPct > 30 ? "bg-amber-500" : "bg-sky-500")} style={{ width: `${Math.min(100, r.leakPct)}%` }} />
                  </span>
                  <span className="w-24 text-right text-xs whitespace-nowrap tabular-nums">
                    <b>{Math.round(r.leakPct)}%</b> · {eur(r.leak)}
                  </span>
                </div>
              </td>
              <td className={cn("py-2 text-right whitespace-nowrap tabular-nums", r.belowCost > 0 ? "font-semibold text-red-600" : "text-muted-foreground")}>
                {r.belowCost > 0 ? eur(r.belowCost) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
