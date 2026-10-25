import { AlertTriangle, Info, Lightbulb, ShieldAlert } from "lucide-react";
import type { Finding, GroupRow, PriceRow, RoiRow, SupplierRow } from "@/lib/purchase-analysis";
import type { PaybackDoc, PaybackItem, PaybackSupplier } from "@/lib/purchase-payback";
import { cn } from "@/lib/utils";

// Presentational blocks of Αγορές → analysis (server-rendered).

const eur = (v: number) => `${Math.round(v).toLocaleString("el-GR")} €`;
const pct = (v: number | null, digits = 0) =>
  v === null ? "—" : `${v > 0 ? "+" : ""}${v.toLocaleString("el-GR", { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;

const LEVEL = {
  risk: { icon: ShieldAlert, box: "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20", tint: "text-red-600" },
  warning: { icon: AlertTriangle, box: "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20", tint: "text-amber-600" },
  opportunity: { icon: Lightbulb, box: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20", tint: "text-emerald-600" },
  info: { icon: Info, box: "border-sky-200 bg-sky-50/60 dark:border-sky-900 dark:bg-sky-950/20", tint: "text-sky-600" },
} as const;

export function Findings({ items }: { items: Finding[] }) {
  if (!items.length) return null;
  return (
    <section aria-label="Ευρήματα" className="grid gap-2 md:grid-cols-2">
      {items.map((f) => {
        const L = LEVEL[f.level];
        return (
          <div key={f.title} className={cn("flex gap-2.5 rounded-lg border p-3 text-sm", L.box)}>
            <L.icon className={cn("mt-0.5 size-4 shrink-0", L.tint)} />
            <div className="min-w-0">
              <div className="font-semibold">{f.title}</div>
              <div className="text-xs text-muted-foreground">{f.detail}</div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Growth({ v }: { v: number | null }) {
  return <span className={cn("tabular-nums", v === null ? "text-muted-foreground" : v >= 10 ? "text-amber-700" : v <= -10 ? "text-sky-700" : "")}>{pct(v)}</span>;
}

/** Purchases vs cost of sales per group: >1 = buying more than selling (stock grows). */
function Ratio({ v }: { v: number | null }) {
  if (v === null) return <span className="text-muted-foreground">—</span>;
  const w = Math.min(v / 2, 1) * 100;
  return (
    <span className="flex items-center justify-end gap-2">
      <span className="relative hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block">
        <span className="absolute inset-y-0 left-1/2 w-px bg-foreground/30" />
        <span className={cn("absolute inset-y-0 left-0 rounded-full", v > 1.15 ? "bg-amber-500" : v < 0.85 ? "bg-sky-500" : "bg-emerald-500")} style={{ width: `${w}%` }} />
      </span>
      <span className={cn("w-10 text-right tabular-nums", v > 1.15 && "font-semibold text-amber-700", v < 0.85 && "font-semibold text-sky-700")}>
        {v.toLocaleString("el-GR", { maximumFractionDigits: 2 })}
      </span>
    </span>
  );
}

export function GroupTable({ rows, label }: { rows: GroupRow[]; label: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b text-left">
            <th className="py-2 pr-3 font-medium">{label}</th>
            <th className="py-2 pr-3 text-right font-medium">Αγορές</th>
            <th className="py-2 pr-3 text-right font-medium">vs πέρσι</th>
            <th className="py-2 pr-3 text-right font-medium">Κόστος πωλήσεων</th>
            <th className="py-2 text-right font-medium" title="Αγορές ÷ κόστος πωλήσεων: πάνω από 1 = αγοράζετε περισσότερα από όσα πουλάτε">
              Αγορές / πωλήσεις
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b last:border-0">
              <td className="max-w-56 truncate py-2 pr-3" title={r.name}>
                {r.name}
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">{eur(r.purchases)}</td>
              <td className="py-2 pr-3 text-right">
                <Growth v={r.growthPct} />
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums text-muted-foreground">{r.cogs ? eur(r.cogs) : "—"}</td>
              <td className="py-2">
                <Ratio v={r.coverRatio} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PriceTable({ rows, empty }: { rows: PriceRow[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b text-left">
            <th className="py-2 pr-3 font-medium">Είδος</th>
            <th className="py-2 pr-3 text-right font-medium">Τιμή πέρσι</th>
            <th className="py-2 pr-3 text-right font-medium">Τιμή τώρα</th>
            <th className="py-2 pr-3 text-right font-medium">Μεταβολή</th>
            <th className="py-2 text-right font-medium" title="Επιπλέον κόστος στην περίοδο λόγω της αλλαγής τιμής">
              Επίπτωση
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.code}-${r.name}`} className="border-b align-top last:border-0">
              <td className="max-w-80 py-2 pr-3">
                <div className="truncate font-medium" title={r.name}>
                  {r.name}
                </div>
                <div className="truncate text-2xs text-muted-foreground">{[r.code, r.brand, r.supplier].filter(Boolean).join(" · ")}</div>
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums text-muted-foreground">{r.pricePrev.toLocaleString("el-GR", { maximumFractionDigits: 2 })} €</td>
              <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">{r.price.toLocaleString("el-GR", { maximumFractionDigits: 2 })} €</td>
              <td className={cn("py-2 pr-3 text-right font-semibold tabular-nums", r.changePct > 0 ? "text-red-600" : "text-emerald-700")}>{pct(r.changePct)}</td>
              <td className="py-2 text-right whitespace-nowrap tabular-nums">{eur(r.qty * (r.price - r.pricePrev))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SupplierTable({ rows, leadMedian }: { rows: SupplierRow[]; leadMedian: number | null }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b text-left">
            <th className="py-2 pr-3 font-medium">Προμηθευτής</th>
            <th className="py-2 pr-3 text-right font-medium">Αγορές</th>
            <th className="py-2 pr-3 text-right font-medium">Μερίδιο</th>
            <th className="py-2 pr-3 text-right font-medium">vs πέρσι</th>
            <th className="py-2 pr-3 text-right font-medium" title="Από την παραγγελία ως την παραλαβή, τελευταίοι 24 μήνες">
              Παράδοση
            </th>
            <th className="py-2 text-right font-medium" title="Μεταβολή τιμών στα ίδια είδη έναντι πέρσι">
              Τιμές
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b last:border-0">
              <td className="max-w-64 truncate py-2 pr-3" title={r.name}>
                {r.name}
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">{eur(r.spend)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.sharePct.toLocaleString("el-GR", { maximumFractionDigits: 1 })}%</td>
              <td className="py-2 pr-3 text-right">
                <Growth v={r.growthPct} />
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums" title={r.deliveries ? `μέσος όρος ${r.leadAvg} ημ. · ${r.deliveries} παραλαβές` : undefined}>
                {r.leadMedian === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span className={cn(leadMedian !== null && r.leadMedian >= Math.max(14, leadMedian * 2) && "font-semibold text-amber-700")}>{r.leadMedian} ημ.</span>
                )}
              </td>
              <td className={cn("py-2 text-right tabular-nums", r.priceChangePct !== null && r.priceChangePct >= 3 && "font-semibold text-red-600", r.priceChangePct !== null && r.priceChangePct <= -3 && "text-emerald-700")}>
                {pct(r.priceChangePct, 1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────────── ROI & payback ─────────────

const days = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("el-GR")} ημ.`);

export function RoiTable({ rows, label }: { rows: RoiRow[]; label: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b text-left">
            <th className="py-2 pr-3 font-medium">{label}</th>
            <th className="py-2 pr-3 text-right font-medium">Τζίρος 12μ</th>
            <th className="py-2 pr-3 text-right font-medium">Μικτό κέρδος</th>
            <th className="py-2 pr-3 text-right font-medium">Απόθεμα (κόστος)</th>
            <th className="py-2 pr-3 text-right font-medium" title="Μικτό κέρδος 12 μηνών ανά 1 € αποθέματος (GMROI)">
              ROI αποθέματος
            </th>
            <th className="py-2 text-right font-medium" title="Για πόσες ημέρες πωλήσεων φτάνει το απόθεμα">
              Ημέρες αποθέματος
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b last:border-0">
              <td className="max-w-56 truncate py-2 pr-3" title={r.name}>
                {r.name}
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">{eur(r.revenue)}</td>
              <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">
                {eur(r.margin)}
                {r.marginPct !== null && <span className="ml-1 text-2xs text-muted-foreground">{Math.round(r.marginPct)}%</span>}
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums text-muted-foreground">{eur(r.stockValue)}</td>
              <td
                className={cn(
                  "py-2 pr-3 text-right font-semibold whitespace-nowrap tabular-nums",
                  r.gmroi === null ? "text-muted-foreground" : r.gmroi >= 2 ? "text-emerald-700" : r.gmroi < 0.5 ? "text-red-600" : "",
                )}
              >
                {r.gmroi === null ? "—" : `${r.gmroi.toLocaleString("el-GR", { maximumFractionDigits: 2 })} €`}
              </td>
              <td className={cn("py-2 text-right tabular-nums", r.stockDays !== null && r.stockDays > 365 && "font-semibold text-amber-700")}>{days(r.stockDays)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PaybackSupplierTable({ rows }: { rows: PaybackSupplier[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b text-left">
            <th className="py-2 pr-3 font-medium">Προμηθευτής</th>
            <th className="py-2 pr-3 text-right font-medium">Αγορές</th>
            <th className="py-2 pr-3 text-right font-medium" title="Πωλήσεις των τεμαχίων που αγοράστηκαν, ως % του κόστους τους">
              Επέστρεψε
            </th>
            <th className="py-2 pr-3 text-right font-medium" title="Διάμεσος χρόνος ως ότου οι πωλήσεις κάλυψαν το κόστος κάθε τιμολογίου (τιμολόγια άνω των 30 ημερών)">
              Απόσβεση
            </th>
            <th className="py-2 text-right font-medium" title="Αγορές άνω των 90 ημερών που δεν έχουν πουληθεί ακόμα (σε κόστος)">
              Ακίνητο &gt;90 ημ.
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.supplierId}`} className="border-b last:border-0">
              <td className="max-w-64 py-2 pr-3">
                <div className="truncate" title={r.supplier}>
                  {r.supplier}
                </div>
                <div className="text-2xs text-muted-foreground">
                  {r.docs} τιμολόγια · {r.paidDocs} αποσβέστηκαν
                </div>
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">{eur(r.cost)}</td>
              <td className={cn("py-2 pr-3 text-right tabular-nums", r.recoveredPct >= 100 ? "text-emerald-700" : r.recoveredPct < 60 && "text-amber-700")}>
                {Math.round(r.recoveredPct)}%
              </td>
              <td className={cn("py-2 pr-3 text-right whitespace-nowrap tabular-nums", r.medianDays !== null && r.medianDays <= 45 && "font-semibold text-emerald-700", r.medianDays !== null && r.medianDays > 180 && "font-semibold text-red-600")}>
                {days(r.medianDays)}
              </td>
              <td className="py-2 text-right whitespace-nowrap tabular-nums">
                {r.idlePct === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <>
                    <span className={cn(r.idlePct >= 40 && "font-semibold text-red-600", r.idlePct >= 20 && r.idlePct < 40 && "text-amber-700")}>{Math.round(r.idlePct)}%</span>
                    <span className="ml-1 text-2xs text-muted-foreground">{eur(r.idleCost)}</span>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CashDragTable({ rows }: { rows: PaybackDoc[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">Καμία αγορά δεν κρατά δεσμευμένα σημαντικά ποσά.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b text-left">
            <th className="py-2 pr-3 font-medium">Τιμολόγιο</th>
            <th className="py-2 pr-3 text-right font-medium">Αξία</th>
            <th className="py-2 pr-3 text-right font-medium">Επέστρεψε</th>
            <th className="py-2 pr-3 text-right font-medium" title="Κόστος των τεμαχίων που δεν έχουν πουληθεί">
              Δεσμευμένα
            </th>
            <th className="py-2 text-right font-medium">Εκτίμηση απόσβεσης</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.findoc} className="border-b last:border-0">
              <td className="max-w-64 py-2 pr-3">
                <div className="truncate" title={r.supplier}>
                  {r.supplier}
                </div>
                <div className="text-2xs text-muted-foreground tabular-nums">
                  {[r.code, new Date(r.date).toLocaleDateString("el-GR"), `πριν ${r.ageDays} ημ.`, `πουλήθηκε ${Math.round(r.soldPct)}% των τεμαχίων`].filter(Boolean).join(" · ")}
                </div>
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">{eur(r.cost)}</td>
              <td className={cn("py-2 pr-3 text-right tabular-nums", r.recoveredPct < 30 && "font-semibold text-red-600")}>{Math.round(r.recoveredPct)}%</td>
              <td className="py-2 pr-3 text-right font-semibold whitespace-nowrap tabular-nums text-amber-700">{eur(r.tiedCost)}</td>
              <td className="py-2 text-right whitespace-nowrap text-muted-foreground tabular-nums">
                {r.estimateDays === null ? "χωρίς πρόσφατες πωλήσεις" : r.estimateDays > 730 ? "> 2 έτη" : `~${r.estimateDays} ημ. ακόμα`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PaybackItemTable({ rows, mode }: { rows: PaybackItem[]; mode: "fast" | "slow" }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">Δεν υπάρχουν αρκετά δεδομένα.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b text-left">
            <th className="py-2 pr-3 font-medium">Είδος</th>
            <th className="py-2 pr-3 text-right font-medium">Αγορές</th>
            <th className="py-2 pr-3 text-right font-medium">{mode === "fast" ? "Απόσβεση" : "Επέστρεψε"}</th>
            <th className="py-2 text-right font-medium">{mode === "fast" ? "Αγορές που αποσβέστηκαν" : "Δεσμευμένα"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.mtrl} className="border-b last:border-0">
              <td className="max-w-72 py-2 pr-3">
                <div className="truncate font-medium" title={r.name}>
                  {r.name}
                </div>
                <div className="truncate text-2xs text-muted-foreground">{[r.code, r.supplier].filter(Boolean).join(" · ")}</div>
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">{eur(r.cost)}</td>
              {mode === "fast" ? (
                <>
                  <td className="py-2 pr-3 text-right font-semibold whitespace-nowrap tabular-nums text-emerald-700">{r.medianDays === 0 ? "ίδια ημέρα" : days(r.medianDays)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {r.paidLots} / {r.lots}
                  </td>
                </>
              ) : (
                <>
                  <td className={cn("py-2 pr-3 text-right tabular-nums", r.recoveredPct < 30 && "font-semibold text-red-600")}>{Math.round(r.recoveredPct)}%</td>
                  <td className="py-2 text-right font-semibold whitespace-nowrap tabular-nums text-amber-700">{eur(r.tiedCost)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
