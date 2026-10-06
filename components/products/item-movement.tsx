"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, TrendingDown, TrendingUp } from "lucide-react";
import { ExportButton } from "@/components/dashboards/export-button";
import { MonthBars } from "@/components/dashboards/month-bars";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OrderLine } from "@/lib/purchase-orders";
import { cn } from "@/lib/utils";

// Προϊόντα → Κίνηση & απόθεμα: per item the monthly sales of the last 12 months, the trend, the
// stock and how long it lasts — the same reading as in the purchase orders, for every item.

const FILTERS = {
  all: { label: "Όλα", test: () => true },
  order: { label: "Χρειάζονται παραγγελία", test: (l: OrderLine) => l.suggested > 0 },
  rising: { label: "Αυξημένη ζήτηση", test: (l: OrderLine) => l.trendPct !== null && l.trendPct >= 20 },
  falling: { label: "Πτώση ζήτησης", test: (l: OrderLine) => l.trendPct !== null && l.trendPct <= -20 },
  stockout: {
    label: "Εξαντλείται πριν την παράδοση",
    test: (l: OrderLine) => l.stockoutDays !== null && l.stockoutDays <= (l.leadDays ?? 30),
  },
  idle: { label: "Απόθεμα χωρίς κίνηση", test: (l: OrderLine) => l.qty12m <= 0 && l.stock > 0 },
} as const;
type Filter = keyof typeof FILTERS;

const SORTS = {
  revenue: { label: "Τζίρος 12μ", by: (l: OrderLine) => -l.revenue12m },
  qty: { label: "Ποσότητα 12μ", by: (l: OrderLine) => -l.qty12m },
  trend: { label: "Τάση 3μ", by: (l: OrderLine) => -(l.trendPct ?? -1e9) },
  growth: { label: "Μεταβολή έτους", by: (l: OrderLine) => -(l.growthPct ?? -1e9) },
  cover: { label: "Λιγότερη κάλυψη", by: (l: OrderLine) => l.coverNow ?? 1e9 },
  stockout: { label: "Πλησιέστερη εξάντληση", by: (l: OrderLine) => l.stockoutDays ?? 1e9 },
  forecast: { label: "Πρόβλεψη 3μ", by: (l: OrderLine) => -l.forecast.reduce((a, v) => a + v, 0) },
} as const;
type Sort = keyof typeof SORTS;

const URGENCY = {
  critical: { label: "Επείγον", badge: "bg-red-50 text-red-700 ring-red-200" },
  urgent: { label: "Σύντομα", badge: "bg-amber-50 text-amber-800 ring-amber-200" },
} as const;

const fold = (v: string) => v.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const num = (v: number | null, digits = 0) => (v === null ? "—" : v.toLocaleString("el-GR", { maximumFractionDigits: digits }));
const eur = (v: number) => `${Math.round(v).toLocaleString("el-GR")} €`;
const PAGE = 150;
const stockoutDate = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit", year: "numeric" });

function Pct({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const up = value >= 20;
  const down = value <= -20;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums",
        up ? "bg-orange-100 text-orange-700" : down ? "bg-slate-100 text-slate-600" : "text-muted-foreground",
      )}
    >
      {up ? <TrendingUp className="size-3" /> : down ? <TrendingDown className="size-3" /> : null}
      {value > 0 ? "+" : ""}
      {value}%
    </span>
  );
}

export function ItemMovement({ tenantId, lines, capped, search }: { tenantId: string; lines: OrderLine[]; capped: boolean; search: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState(search);
  // Enter searches every item on the server (the list holds the biggest sellers only).
  function searchAll() {
    const next = new URLSearchParams(params.toString());
    if (query.trim()) next.set("q", query.trim());
    else next.delete("q");
    router.replace(`${pathname}?${next.toString()}`);
  }
  const q = fold(useDeferredValue(query).trim());
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("revenue");
  const [shown, setShown] = useState(PAGE);

  const brands = useMemo(() => [...new Set(lines.map((l) => l.brand).filter((b): b is string => !!b))].sort((a, b) => a.localeCompare(b, "el")), [lines]);
  const categories = useMemo(() => [...new Set(lines.map((l) => l.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "el")), [lines]);

  const rows = useMemo(() => {
    const f = FILTERS[filter].test;
    const by = SORTS[sort].by;
    return lines
      .filter(
        (l) =>
          f(l) &&
          (!brand || l.brand === brand) &&
          (!category || l.category === category) &&
          (!q || fold(l.name).includes(q) || (l.code && fold(l.code).includes(q))),
      )
      .sort((a, b) => by(a) - by(b));
  }, [lines, filter, sort, brand, category, q]);
  const counts = useMemo(() => Object.fromEntries(Object.entries(FILTERS).map(([k, v]) => [k, lines.filter(v.test).length])) as Record<Filter, number>, [lines]);

  const select = "h-10 rounded-md border bg-background px-2 text-sm";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
            onKeyDown={(e) => e.key === "Enter" && searchAll()}
            placeholder="Αναζήτηση είδους ή κωδικού (Enter: σε όλα τα είδη)…"
            aria-label="Αναζήτηση είδους"
            className="h-10 pl-8"
          />
        </div>
        <select aria-label="Μάρκα" className={select} value={brand} onChange={(e) => setBrand(e.target.value)}>
          <option value="">Όλες οι μάρκες</option>
          {brands.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
        <select aria-label="Κατηγορία" className={cn(select, "max-w-56")} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Όλες οι κατηγορίες</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select aria-label="Ταξινόμηση" className={select} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          {Object.entries(SORTS).map(([k, v]) => (
            <option key={k} value={k}>
              Ταξινόμηση: {v.label}
            </option>
          ))}
        </select>
        <ExportButton
          tenantId={tenantId}
          title="Κίνηση & απόθεμα ειδών"
          sheets={[
            {
              name: "Κίνηση",
              columns: [
                { key: "code", label: "Κωδικός" },
                { key: "name", label: "Είδος" },
                { key: "brand", label: "Μάρκα" },
                { key: "category", label: "Κατηγορία" },
                { key: "abc", label: "ABC" },
                ...Array.from({ length: 12 }, (_, i) => ({ key: `m${i}`, label: `Μήνας −${11 - i}`, format: "num" as const })),
                { key: "qty90d", label: "Πωλήσεις 3μ", format: "num" },
                { key: "qty12m", label: "Πωλήσεις 12μ", format: "num" },
                { key: "qtyPrev12m", label: "Προηγ. 12μ", format: "num" },
                { key: "trendPct", label: "Τάση 3μ %", format: "pct" },
                { key: "growthPct", label: "Μεταβολή έτους %", format: "pct" },
                { key: "revenue12m", label: "Τζίρος 12μ", format: "eur" },
                { key: "f1", label: "Πρόβλεψη μήνα +1", format: "num" },
                { key: "f2", label: "Πρόβλεψη μήνα +2", format: "num" },
                { key: "f3", label: "Πρόβλεψη μήνα +3", format: "num" },
                { key: "stockoutDays", label: "Εξάντληση σε (ημ.)", format: "int" },
                { key: "forecastNote", label: "Βάση πρόβλεψης" },
                { key: "stock", label: "Απόθεμα", format: "num" },
                { key: "coverNow", label: "Κάλυψη (ημ.)", format: "num" },
                { key: "leadDays", label: "Παράδοση (ημ.)", format: "int" },
                { key: "suggested", label: "Πρόταση παραγγελίας", format: "num" },
                { key: "lastSale", label: "Τελευταία πώληση" },
                { key: "why", label: "Σχόλιο" },
              ],
              rows: rows.map((l) => ({
                ...l,
                ...Object.fromEntries(l.monthly.map((v, i) => [`m${i}`, v])),
                f1: l.forecast[0],
                f2: l.forecast[1],
                f3: l.forecast[2],
                why: l.reasons.join(" · "),
              })),
            },
          ]}
        />
      </div>

      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Φίλτρο">
        {(Object.keys(FILTERS) as Filter[]).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={filter === k}
            onClick={() => {
              setFilter(k);
              setShown(PAGE);
            }}
            className={cn(
              "min-h-9 rounded-full border px-3 text-xs font-medium",
              filter === k ? "border-sisyphus-500 bg-sisyphus-500 text-white" : "bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            {FILTERS[k].label} <span className="tabular-nums opacity-80">{counts[k].toLocaleString("el-GR")}</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Είδος</th>
              <th className="px-3 py-2 text-left font-medium">Κίνηση 12 μηνών</th>
              <th className="px-3 py-2 text-right font-medium" title="Ρυθμός τελευταίου τριμήνου σε σχέση με τον μέσο όρο 12 μηνών">
                Τάση 3μ
              </th>
              <th className="px-3 py-2 text-right font-medium" title="Τελευταίοι 12 μήνες σε σχέση με τους 12 προηγούμενους">
                Έτος
              </th>
              <th className="px-3 py-2 text-right font-medium">Τζίρος 12μ</th>
              <th className="px-3 py-2 text-right font-medium" title="Αναμενόμενες πωλήσεις των επόμενων 3 μηνών (ρυθμός 12μ × τάση × εποχικότητα)">
                Πρόβλεψη 3μ
              </th>
              <th className="px-3 py-2 text-right font-medium" title="Σε πόσες ημέρες τελειώνει το απόθεμα με τον ρυθμό της πρόβλεψης">
                Εξάντληση
              </th>
              <th className="px-3 py-2 text-right font-medium">Απόθεμα</th>
              <th className="px-3 py-2 text-right font-medium" title="Ημέρες που φτάνει το απόθεμα με τον τρέχοντα ρυθμό / χρόνος παράδοσης">
                Κάλυψη / παράδοση
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map((l) => {
              const up = l.trendPct !== null && l.trendPct >= 20;
              const flag = l.suggested > 0 && l.urgency !== "normal" ? URGENCY[l.urgency] : null;
              return (
                <tr key={l.mtrl} className="border-t align-top">
                  <td className="max-w-96 min-w-64 px-3 py-2">
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 font-medium">{l.name}</span>
                      {flag && <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-2xs font-semibold ring-1 ring-inset", flag.badge)}>{flag.label}</span>}
                    </div>
                    <div className="text-2xs text-muted-foreground">{[l.code, l.brand, l.category, l.abc && `τάξη ${l.abc}`].filter(Boolean).join(" · ")}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {l.suggested > 0 ? <span className="font-medium text-foreground">Πρόταση παραγγελίας {num(l.suggested)} · </span> : null}
                      {l.reasons[0]}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <MonthBars values={l.monthly} rising={up} forecast={l.forecast} />
                    <div className="mt-1 text-2xs whitespace-nowrap text-muted-foreground tabular-nums">
                      3μ {num(l.qty90d)} · 12μ {num(l.qty12m)} · πέρσι {num(l.qtyPrev12m)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Pct value={l.trendPct} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Pct value={l.growthPct} />
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{eur(l.revenue12m)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums" title={l.forecastNote ?? undefined}>
                    {l.forecastNote ? num(l.forecast.reduce((a, v) => a + v, 0), 1) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    {l.stockoutDays === null ? (
                      <span className="text-muted-foreground">{l.forecastNote ? "> 1 έτος" : "—"}</span>
                    ) : (
                      <span
                        className={cn(
                          l.stockoutDays <= (l.leadDays ?? 30) ? "font-semibold text-red-600" : l.stockoutDays <= (l.leadDays ?? 30) + 30 ? "font-semibold text-amber-700" : "",
                        )}
                        title={stockoutDate(l.stockoutDays)}
                      >
                        {l.stockoutDays <= 0 ? "τώρα" : `~${l.stockoutDays} ημ.`}
                      </span>
                    )}
                  </td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", l.stock <= 0 && l.qty12m > 0 && "font-semibold text-red-600")}>{num(l.stock, 2)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    <span className={cn(l.urgency === "critical" && "font-semibold text-red-600", l.urgency === "urgent" && "font-semibold text-amber-700")}>
                      {num(l.coverNow, 0)}
                    </span>
                    <span className="text-muted-foreground"> / {num(l.leadDays)} ημ.</span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                  Δεν βρέθηκαν είδη.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {Math.min(shown, rows.length).toLocaleString("el-GR")} από {rows.length.toLocaleString("el-GR")} είδη
          {capped && " · εμφανίζονται τα είδη με τον μεγαλύτερο τζίρο — πατήστε Enter στην αναζήτηση για όλα τα είδη"}
        </span>
        {shown < rows.length && (
          <Button type="button" variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE * 2)}>
            Περισσότερα
          </Button>
        )}
      </div>
    </div>
  );
}
