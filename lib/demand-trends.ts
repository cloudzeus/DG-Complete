import "server-only";
import type { Client } from "pg";

// Category demand trends: 25 months of sales per item category → growth, last-quarter trend vs the
// same quarter a year earlier, seasonality by calendar month and a 3-month forecast. Categories hold
// many items, so their trend and seasonality are far steadier than a single item's — item forecasts
// (lib/purchase-orders) lean on them, fully for sparse sellers.

export type CategoryTrend = {
  id: number | null;
  name: string;
  /** Revenue per month, index = months ago (0 = this month … 24). */
  revenue: number[];
  revenue12m: number;
  /** Last 12 full months vs the 12 before, %. */
  yoyPct: number | null;
  /** Last 3 full months vs the same 3 months a year earlier, %. */
  quarterPct: number | null;
  /** Demand factor for the coming months (damped quarter trend), e.g. 1.12. */
  trend: number;
  /** Seasonal index per calendar month (0 = January), 1 = average month. */
  season: number[];
  /** Expected revenue of the next 3 months. */
  forecast: number[];
  /** Calendar months (0 = January) clearly above average. */
  peaks: number[];
  direction: "up" | "down" | "flat";
};

const sum = (a: number[]) => a.reduce((x, v) => x + v, 0);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function trendOf(rev: number[], now = new Date()): Omit<CategoryTrend, "id" | "name"> {
  const r = rev.map((v) => Math.max(v, 0));
  const last12 = sum(r.slice(1, 13));
  const prev12 = sum(r.slice(13, 25));
  const level = last12 / 12;
  const q = sum(r.slice(1, 4));
  const qPrev = sum(r.slice(13, 16));
  const yoy = prev12 > 0 ? last12 / prev12 : null;
  const quarter = qPrev > 0 ? q / qPrev : null;
  // Damped: half of the quarter trend (or of the yearly one when the quarter has no base).
  const raw = quarter ?? yoy ?? 1;
  const trend = clamp(1 + (clamp(raw, 0.4, 2.5) - 1) / 2, 0.6, 1.6);

  // Seasonality from the 24 full months: average of each calendar month vs the average month,
  // shrunk a quarter of the way to 1 (two observations per month at most).
  const month = now.getMonth();
  const byMonth: number[][] = Array.from({ length: 12 }, () => []);
  for (let ago = 1; ago <= 24; ago++) byMonth[(((month - ago) % 12) + 12) % 12].push(r[ago] ?? 0);
  const avg = sum(r.slice(1, 25)) / 24;
  const season = byMonth.map((vals) => (avg > 0 && vals.length ? 1 + (clamp(sum(vals) / vals.length / avg, 0, 3) - 1) * 0.75 : 1));
  const forecast = [1, 2, 3].map((k) => Math.round(level * trend * season[(month + k) % 12]));
  const peaks = season
    .map((v, m) => ({ v, m }))
    .filter((x) => x.v >= 1.25)
    .sort((a, b) => b.v - a.v)
    .slice(0, 3)
    .map((x) => x.m);
  const direction = raw >= 1.1 ? "up" : raw <= 0.9 ? "down" : "flat";
  return {
    revenue: rev,
    revenue12m: last12,
    yoyPct: yoy === null ? null : Math.round((yoy - 1) * 100),
    quarterPct: quarter === null ? null : Math.round((quarter - 1) * 100),
    trend,
    season,
    forecast,
    peaks,
    direction,
  };
}

const GROUPS = {
  category: { col: "mtrcategory", table: "item_categories", none: "Χωρίς κατηγορία" },
  brand: { col: "mtrmark", table: "brands", none: "Χωρίς μάρκα" },
} as const;
export type TrendGroup = keyof typeof GROUPS;

/** Trends per item category or brand with sales in the last 25 months (largest first). */
export async function groupTrends(db: Client, s: string, by: TrendGroup, ids?: number[]): Promise<CategoryTrend[]> {
  const g = GROUPS[by];
  const has = async (t: string) => !!(await db.query("SELECT to_regclass($1) AS t", [`${s}.${t}`])).rows[0]?.t;
  if (!(await has("f_sales_lines")) || !(await has("items"))) return [];
  const names = await has(g.table);
  const r = await db.query(
    `SELECT i.${g.col} AS id, ${names ? "MAX(n.name)" : "NULL"} AS name,
            (EXTRACT(YEAR FROM age(date_trunc('month', now()), date_trunc('month', f.trndate))) * 12
             + EXTRACT(MONTH FROM age(date_trunc('month', now()), date_trunc('month', f.trndate))))::int AS ago,
            SUM(f.net)::float AS rev
     FROM ${s}.f_sales_lines f JOIN ${s}.items i ON i.mtrl = f.mtrl
     ${names ? `LEFT JOIN ${s}.${g.table} n ON n.${g.col} = i.${g.col}` : ""}
     WHERE f.trndate >= date_trunc('month', now()) - interval '24 months' ${ids ? `AND i.${g.col} = ANY($1::bigint[])` : ""}
     GROUP BY i.${g.col}, ago`,
    ids ? [ids] : [],
  );
  const series = new Map<string, { id: number | null; name: string; rev: number[] }>();
  for (const x of r.rows) {
    const key = String(x.id ?? "none");
    const e = series.get(key) ?? { id: x.id === null ? null : Number(x.id), name: x.name ?? g.none, rev: Array(25).fill(0) };
    const ago = Number(x.ago);
    if (ago >= 0 && ago < 25) e.rev[ago] = Number(x.rev);
    if (x.name) e.name = x.name;
    series.set(key, e);
  }
  return [...series.values()].map((e) => ({ id: e.id, name: e.name, ...trendOf(e.rev) })).sort((a, b) => b.revenue12m - a.revenue12m);
}

// ───────────── Insights: trends × stock ─────────────

export type GroupStock = { stockValue: number; monthlyCost: number };
export type TrendInsight = {
  level: "risk" | "opportunity" | "warning" | "info";
  title: string;
  detail: string;
  action: string;
  group: TrendGroup;
  name: string;
  impact: number;
};
export type GroupWithStock = CategoryTrend & { stock: GroupStock; coverMonths: number | null };

const MONTHS = ["Ιανουάριο", "Φεβρουάριο", "Μάρτιο", "Απρίλιο", "Μάιο", "Ιούνιο", "Ιούλιο", "Αύγουστο", "Σεπτέμβριο", "Οκτώβριο", "Νοέμβριο", "Δεκέμβριο"];
const eur = (v: number) => `${Math.round(v).toLocaleString("el-GR")} €`;
const months = (v: number) => (v < 1 ? `${Math.max(1, Math.round(v * 4.3))} εβδομάδες` : `${Math.round(v * 10) / 10} μήνες`);

/** Stock value and monthly cost of sales per category / brand (from m_item_stats). */
export async function groupStock(db: Client, s: string, by: TrendGroup): Promise<Map<number | null, GroupStock>> {
  const col = GROUPS[by].col;
  const r = await db.query(
    `SELECT i.${col} AS id, COALESCE(SUM(GREATEST(m.stock_value, 0)), 0)::float AS stock_value, COALESCE(SUM(m.cost_12m), 0)::float / 12 AS monthly_cost
     FROM ${s}.m_item_stats m JOIN ${s}.items i ON i.mtrl = m.mtrl GROUP BY i.${col}`,
  );
  return new Map(r.rows.map((x) => [x.id === null ? null : Number(x.id), { stockValue: Number(x.stock_value), monthlyCost: Number(x.monthly_cost) }]));
}

export function withStock(trends: CategoryTrend[], stock: Map<number | null, GroupStock>): GroupWithStock[] {
  return trends.map((t) => {
    const st = stock.get(t.id) ?? { stockValue: 0, monthlyCost: 0 };
    const need = st.monthlyCost * t.trend;
    return { ...t, stock: st, coverMonths: need > 0 ? st.stockValue / need : null };
  });
}

/**
 * What the trends mean for stock, per category / brand that matters (≥ 1% of turnover):
 * rising demand with thin stock, falling demand with heavy stock, a seasonal peak coming up.
 */
export function trendInsights(groups: { by: TrendGroup; list: GroupWithStock[] }[]): TrendInsight[] {
  const out: TrendInsight[] = [];
  const month = new Date().getMonth();
  for (const { by, list } of groups) {
    const total = list.reduce((a, g) => a + Math.max(g.revenue12m, 0), 0);
    const word = by === "category" ? "Κατηγορία" : "Μάρκα";
    for (const g of list) {
      if (g.id === null || total <= 0 || g.revenue12m < total * 0.01) continue;
      const q = g.quarterPct;
      const cover = g.coverMonths;
      if (q !== null && q >= 15 && cover !== null && cover < 1.5) {
        out.push({
          level: "risk",
          title: `${word} ${g.name}: άνοδος ${q}% με απόθεμα για ${months(cover)}`,
          detail: `Το τελευταίο τρίμηνο πούλησε ${q}% περισσότερο από το ίδιο τρίμηνο πέρσι· το απόθεμα (${eur(g.stock.stockValue)}) καλύπτει ${months(cover)} με αυτόν τον ρυθμό.`,
          action: "Ενισχύστε το απόθεμα στα είδη με τη μεγαλύτερη κίνηση πριν χαθούν πωλήσεις.",
          group: by,
          name: g.name,
          impact: g.revenue12m * (1 + q / 100),
        });
      } else if (q !== null && q >= 20) {
        out.push({
          level: "opportunity",
          title: `${word} ${g.name}: ζήτηση +${q}%`,
          detail: `Τρίμηνο έναντι ίδιου τριμήνου πέρσι${g.yoyPct !== null ? ` · 12μηνο ${g.yoyPct > 0 ? "+" : ""}${g.yoyPct}%` : ""}${cover !== null ? ` · απόθεμα για ${months(cover)}` : ""}.`,
          action: "Αξιοποιήστε την άνοδο: διαθεσιμότητα, προβολή, μεγαλύτερες παραγγελίες στα δυνατά είδη.",
          group: by,
          name: g.name,
          impact: g.revenue12m * (q / 100),
        });
      }
      if (q !== null && q <= -15 && cover !== null && cover > 6) {
        out.push({
          level: "warning",
          title: `${word} ${g.name}: πτώση ${Math.abs(q)}% με απόθεμα για ${months(cover)}`,
          detail: `Το απόθεμα ${eur(g.stock.stockValue)} κινείται αργά σε πτωτική αγορά.`,
          action: "Περιορίστε τις αγορές και εξετάστε προωθητικές ενέργειες για να αποδεσμευτεί κεφάλαιο.",
          group: by,
          name: g.name,
          impact: g.stock.stockValue,
        });
      }
      // Seasonal peak in the next 2 months.
      if (by === "category") {
        for (const k of [1, 2]) {
          const si = g.season[(month + k) % 12];
          if (si >= 1.3) {
            out.push({
              level: cover !== null && cover < 1.5 * si ? "risk" : "info",
              title: `${g.name}: αιχμή τον ${MONTHS[(month + k) % 12]} (+${Math.round((si - 1) * 100)}% από τον μέσο μήνα)`,
              detail: `Η εποχικότητα των δύο τελευταίων ετών δείχνει αυξημένη ζήτηση σε ${k === 1 ? "έναν μήνα" : "δύο μήνες"}${cover !== null ? ` · απόθεμα για ${months(cover)}` : ""}.`,
              action: "Προετοιμάστε έγκαιρα το απόθεμα, λαμβάνοντας υπόψη τον χρόνο παράδοσης των προμηθευτών.",
              group: by,
              name: g.name,
              impact: g.revenue12m * (si - 1) * (k === 1 ? 1.2 : 1),
            });
            break;
          }
        }
      }
    }
  }
  const rank = { risk: 0, warning: 1, opportunity: 2, info: 3 } as const;
  return out.sort((a, b) => rank[a.level] - rank[b.level] || b.impact - a.impact).slice(0, 12);
}
