import { ArrowRight, Users } from "lucide-react";
import type { CreditRow, CustomerPl, PeerGap, Rule } from "@/lib/customer-insights";
import { cn } from "@/lib/utils";

const eur = (v: number) => `${Math.round(v).toLocaleString("el-GR")} €`;

export function PlTable({ rows }: { rows: CustomerPl[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b text-left">
            <th className="py-2 pr-3 font-medium">Πελάτης</th>
            <th className="py-2 pr-3 text-right font-medium">Τζίρος</th>
            <th className="py-2 pr-3 text-right font-medium">Μικτό κέρδος</th>
            <th className="py-2 pr-3 text-right font-medium" title="Παραστατικά × κόστος, χρηματοδότηση υπολοίπου, επιστροφές">
              Κόστος εξυπηρέτησης
            </th>
            <th className="py-2 text-right font-medium">Καθαρή συνεισφορά</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b last:border-0">
              <td className="max-w-64 py-2 pr-3">
                <div className="truncate font-medium" title={r.name}>
                  {r.name}
                </div>
                <div className="text-2xs text-muted-foreground tabular-nums">
                  {r.documents} παραστατικά · υπόλοιπο {eur(r.balance)}
                  {r.payDays !== null && ` · πληρώνει σε ~${Math.round(r.payDays)} ημ.`}
                </div>
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">{eur(r.revenue)}</td>
              <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">{eur(r.margin)}</td>
              <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums text-muted-foreground">−{eur(r.serveCost)}</td>
              <td className={cn("py-2 text-right font-semibold whitespace-nowrap tabular-nums", r.net >= 0 ? "text-emerald-700" : "text-red-600")}>
                {eur(r.net)}
                {r.netPct !== null && <span className="ml-1 text-2xs font-normal text-muted-foreground">{Math.round(r.netPct)}%</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RuleCards({ rules }: { rules: Rule[] }) {
  if (!rules.length) return <p className="text-sm text-muted-foreground">Δεν βρέθηκαν ισχυροί συνδυασμοί κατηγοριών.</p>;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {rules.map((r) => (
        <div key={`${r.from}-${r.to}`} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
          <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
            <span className="rounded bg-muted px-1.5 py-0.5">{r.from}</span>
            <ArrowRight className="size-4 text-muted-foreground" />
            <span className="rounded bg-sisyphus-50 px-1.5 py-0.5 text-sisyphus-700 dark:bg-white/10">{r.to}</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>
              <b className="text-foreground">{r.lift.toLocaleString("el-GR", { maximumFractionDigits: 1 })}×</b> πιθανότερο
            </span>
            <span>{Math.round(r.confidence * 100)}% το αγοράζουν ήδη</span>
            <span>{r.both} πελάτες και τα δύο</span>
          </div>
          <div className="mt-auto rounded-md bg-emerald-50/70 px-2 py-1.5 text-xs dark:bg-emerald-950/20">
            <div className="flex items-center gap-1 font-semibold text-emerald-800 dark:text-emerald-300">
              <Users className="size-3.5" /> {r.missing} πελάτες για πρόταση · δυνητικά ~{eur(r.potential)}
            </div>
            <div className="truncate text-muted-foreground" title={r.examples.join(", ")}>
              π.χ. {r.examples.join(", ")}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PeerTable({ rows }: { rows: PeerGap[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">Χρειάζεται η κλαδική ανάλυση πελατών (ΚΑΔ) για αυτή τη σύγκριση.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b text-left">
            <th className="py-2 pr-3 font-medium">Κλάδος</th>
            <th className="py-2 pr-3 font-medium">Αγοράζουν οι περισσότεροι</th>
            <th className="py-2 pr-3 text-right font-medium">Του κλάδου το αγοράζουν</th>
            <th className="py-2 text-right font-medium">Δεν το αγοράζουν</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.segment}-${r.category}`} className="border-b align-top last:border-0">
              <td className="max-w-48 truncate py-2 pr-3" title={r.segment}>
                {r.segment}
              </td>
              <td className="max-w-56 py-2 pr-3">
                <div className="truncate font-medium">{r.category}</div>
                <div className="truncate text-2xs text-muted-foreground" title={r.examples.join(", ")}>
                  π.χ. {r.examples.join(", ")}
                </div>
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{Math.round(r.penetration * 100)}%</td>
              <td className="py-2 text-right whitespace-nowrap tabular-nums">
                <b>{r.missing}</b> πελάτες
                <div className="text-2xs text-emerald-700">~{eur(r.potential)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CreditTable({ rows }: { rows: CreditRow[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">Κανένας πελάτης με επιδεινούμενο πιστωτικό κίνδυνο.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b text-left">
            <th className="py-2 pr-3 font-medium">Πελάτης</th>
            <th className="py-2 pr-3 text-right font-medium">Υπόλοιπο πριν 3 μήνες</th>
            <th className="py-2 pr-3 text-right font-medium">Υπόλοιπο σήμερα</th>
            <th className="py-2 pr-3 text-right font-medium">Άνω των 90 ημ.</th>
            <th className="py-2 text-right font-medium">Βαθμός</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b last:border-0">
              <td className="max-w-64 py-2 pr-3">
                <div className="truncate font-medium" title={r.name}>
                  {r.name}
                </div>
                <div className="text-2xs text-muted-foreground">
                  τιμολόγηση 3μ {eur(r.invoiced3m)}
                  {r.payDays !== null && ` · πληρώνει σε ~${Math.round(r.payDays)} ημ.`}
                </div>
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums text-muted-foreground">{eur(r.balance3m)}</td>
              <td className="py-2 pr-3 text-right font-semibold whitespace-nowrap tabular-nums">
                {eur(r.balance)}
                {r.growthPct !== null && r.growthPct > 0 && <span className="ml-1 text-2xs text-red-600">+{Math.round(r.growthPct)}%</span>}
              </td>
              <td className={cn("py-2 pr-3 text-right whitespace-nowrap tabular-nums", r.overdue90 > 0 && "font-semibold text-red-600")}>{r.overdue90 > 0 ? eur(r.overdue90) : "—"}</td>
              <td className="py-2 text-right">
                {r.grade && (
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", r.grade === "Δ" ? "bg-red-100 text-red-700" : r.grade === "Γ" ? "bg-amber-100 text-amber-800" : "bg-muted")}>{r.grade}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
