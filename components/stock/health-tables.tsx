import type { DeadItem, LostItem, SupplierScore } from "@/lib/stock-health";
import { cn } from "@/lib/utils";

const eur = (v: number) => `${Math.round(v).toLocaleString("el-GR")} €`;
export const ACTION = {
  return: { label: "Επιστροφή στον προμηθευτή", badge: "bg-sky-100 text-sky-800" },
  offer: { label: "Προσφορά / πακέτο", badge: "bg-amber-100 text-amber-800" },
  liquidate: { label: "Ρευστοποίηση", badge: "bg-red-100 text-red-700" },
} as const;

export function LostTable({ rows }: { rows: LostItem[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">Δεν εντοπίστηκαν σημαντικές ελλείψεις.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b text-left">
            <th className="py-2 pr-3 font-medium">Είδος</th>
            <th className="py-2 pr-3 text-right font-medium">Ημέρες χωρίς απόθεμα</th>
            <th className="py-2 pr-3 text-right font-medium">Χαμένα τεμάχια</th>
            <th className="py-2 pr-3 text-right font-medium">Χαμένες πωλήσεις</th>
            <th className="py-2 text-right font-medium">Χαμένο κέρδος</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.code}-${r.name}`} className="border-b last:border-0">
              <td className="max-w-72 py-2 pr-3">
                <div className="truncate font-medium" title={r.name}>
                  {r.name}
                </div>
                <div className="truncate text-2xs text-muted-foreground">
                  {[r.code, r.supplier, `απόθεμα σήμερα ${r.stock.toLocaleString("el-GR")}`].filter(Boolean).join(" · ")}
                </div>
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.outDays}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.lostQty.toLocaleString("el-GR", { maximumFractionDigits: 0 })}</td>
              <td className="py-2 pr-3 text-right font-semibold whitespace-nowrap tabular-nums text-red-600">{eur(r.lostRevenue)}</td>
              <td className="py-2 text-right whitespace-nowrap tabular-nums">{eur(r.lostMargin)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DeadTable({ rows }: { rows: DeadItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b text-left">
            <th className="py-2 pr-3 font-medium">Είδος</th>
            <th className="py-2 pr-3 font-medium">Πρόταση</th>
            <th className="py-2 pr-3 text-right font-medium">Αξία</th>
            <th className="py-2 text-right font-medium">Μετρητά (εκτίμηση)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.code}-${r.name}`} className="border-b align-top last:border-0">
              <td className="max-w-72 py-2 pr-3">
                <div className="truncate font-medium" title={r.name}>
                  {r.name}
                </div>
                <div className="text-2xs text-muted-foreground">{r.reason}</div>
              </td>
              <td className="py-2 pr-3">
                <span className={cn("rounded-full px-2 py-0.5 text-2xs font-semibold whitespace-nowrap", ACTION[r.action].badge)}>{ACTION[r.action].label}</span>
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">{eur(r.value)}</td>
              <td className="py-2 text-right font-semibold whitespace-nowrap tabular-nums text-emerald-700">{eur(r.freed)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const scoreTone = (v: number) => (v >= 75 ? "bg-emerald-100 text-emerald-800" : v >= 55 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700");

export function ScoreTable({ rows }: { rows: SupplierScore[] }) {
  const cell = (v: number) => <span className={cn("inline-block min-w-9 rounded px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums", scoreTone(v))}>{v}</span>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b text-left">
            <th className="py-2 pr-3 font-medium">Προμηθευτής</th>
            <th className="py-2 pr-2 text-center font-medium">Βαθμός</th>
            <th className="py-2 pr-2 text-center font-medium">Ταχύτητα</th>
            <th className="py-2 pr-2 text-center font-medium">Αξιοπιστία</th>
            <th className="py-2 pr-2 text-center font-medium">Τιμές</th>
            <th className="py-2 pr-2 text-center font-medium">Απόσβεση</th>
            <th className="py-2 pr-2 text-center font-medium">Κίνηση</th>
            <th className="py-2 text-center font-medium">ROI</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b last:border-0">
              <td className="max-w-64 py-2 pr-3">
                <div className="truncate font-medium" title={r.name}>
                  {r.name}
                </div>
                <div className="truncate text-2xs text-muted-foreground tabular-nums">
                  {[
                    `αγορές ${eur(r.spend)}`,
                    r.facts.leadMedian !== null ? `παράδοση ${r.facts.leadMedian}–${r.facts.leadP90 ?? "?"} ημ.` : null,
                    r.facts.priceChange !== null ? `τιμές ${r.facts.priceChange > 0 ? "+" : ""}${r.facts.priceChange.toFixed(1)}%` : null,
                    r.facts.paybackDays !== null ? `απόσβεση ${r.facts.paybackDays} ημ.` : null,
                    r.facts.idlePct !== null ? `ακίνητο ${Math.round(r.facts.idlePct)}%` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </td>
              <td className="py-2 pr-2 text-center">
                <span className={cn("inline-block min-w-11 rounded-md px-2 py-1 text-sm font-bold tabular-nums", scoreTone(r.score))}>{r.score}</span>
              </td>
              <td className="py-2 pr-2 text-center">{cell(r.dims.delivery)}</td>
              <td className="py-2 pr-2 text-center">{cell(r.dims.reliability)}</td>
              <td className="py-2 pr-2 text-center">{cell(r.dims.price)}</td>
              <td className="py-2 pr-2 text-center">{cell(r.dims.payback)}</td>
              <td className="py-2 pr-2 text-center">{cell(r.dims.idle)}</td>
              <td className="py-2 text-center">{cell(r.dims.roi)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
