import "server-only";
import { groupStock, groupTrends, trendInsights, withStock, type CategoryTrend, type GroupWithStock, type TrendInsight } from "@/lib/demand-trends";
import { getBiSettings } from "@/lib/bi-marts";
import { prisma } from "@/lib/prisma";
import { s1GetData, s1SetData } from "@/lib/softone";
import { schemaName } from "@/lib/warehouse";
import { withWarehouse } from "@/lib/warehouse-writer";

// Purchase orders from the order suggestions (m_item_stats): grouped per main supplier, edited by
// the user, then written to the tenant's SoftOne as a PURDOC (item + quantity only — SoftOne prices
// the lines with its own rules).

export type OrderSupplier = {
  trdr: number | null;
  code: string | null;
  name: string;
  /** Items with a suggested quantity. */
  items: number;
  /** Items they are the main supplier of. */
  total: number;
  brands: string[];
};
export type Urgency = "critical" | "urgent" | "normal";
export type OrderLine = {
  mtrl: number;
  code: string | null;
  name: string;
  abc: string | null;
  stock: number;
  daysOfCover: number | null;
  leadDays: number | null;
  qty12m: number;
  qtyPrev12m: number;
  qty90d: number;
  /** Sales per month, last 12 months (oldest first). */
  monthly: number[];
  /** Recent demand (last 90 days) vs the 12-month average, %. Positive = selling faster now. */
  trendPct: number | null;
  /** Last 12 months vs the 12 before, %. */
  growthPct: number | null;
  /** Days the stock lasts at the recent pace (the faster of 90-day and 12-month demand). */
  coverNow: number | null;
  urgency: Urgency;
  /** Why it is suggested, in plain words. */
  reasons: string[];
  suggested: number;
  /** Who the item is bought from now, and whether that comes from the item or from its brand. */
  supplier: string | null;
  supplierSource: "item" | "brand" | null;
  brand: string | null;
  category: string | null;
  revenue12m: number;
  lastSale: string | null;
  /** Expected sales of the next 3 calendar months. */
  forecast: number[];
  /** Days until the stock runs out at the forecast pace (null: not within a year / no demand). */
  stockoutDays: number | null;
  /** How the forecast was made, in plain words. */
  forecastNote: string | null;
  /** The item's category: last quarter vs the same quarter a year earlier, %. */
  categoryTrend: number | null;
};

const RISING = 20; // % — demand of the last 90 days this much above the 12-month average
type GroupCtx = { category?: CategoryTrend; brand?: CategoryTrend };

const pctTxt = (f: number) => {
  const p = Math.round((f - 1) * 100);
  return `${p > 0 ? "+" : ""}${p}%`;
};

/**
 * Demand forecast for the next 3 months, hierarchical: the item's own 12-month level, with
 * - trend: the item's last quarter (if it sells regularly) combined with the trend of its brand and
 *   category (last quarter vs the same quarter a year earlier) — sparse sellers take the groups' trend;
 * - seasonality: the category's (steady, many items), blended with the item's own when it sells in at
 *   least 6 of the 12 months.
 * Then the stock is run down month by month at that pace to find the stock-out day.
 */
function forecast(h: number[], stock: number, g: GroupCtx): { forecast: number[]; stockoutDays: number | null; forecastNote: string | null } {
  const full = h.slice(1, 13); // last 12 full months
  const prev = h.slice(13, 24);
  const level = full.reduce((a, v) => a + Math.max(v, 0), 0) / 12;
  if (level <= 0) return { forecast: [0, 0, 0], stockoutDays: null, forecastNote: null };
  const active = full.filter((v) => v > 0).length;
  const regular = active >= 6;
  const recent = (Math.max(h[1], 0) + Math.max(h[2], 0) + Math.max(h[3], 0)) / 3;
  const itemTrend = 1 + (Math.min(Math.max(recent / level, 0.5), 2) - 1) / 2;
  const groups = [g.category?.trend, g.brand?.trend].filter((v): v is number => typeof v === "number");
  const groupTrend = groups.length ? Math.exp(groups.reduce((a, v) => a + Math.log(v), 0) / groups.length) : 1;
  const trend = regular ? Math.sqrt(itemTrend * groupTrend) : groupTrend;

  const prevLevel = prev.reduce((a, v) => a + Math.max(v, 0), 0) / prev.length;
  const month = new Date().getMonth();
  const fc = [1, 2, 3].map((k) => {
    const groupSi = g.category?.season[(month + k) % 12] ?? g.brand?.season[(month + k) % 12] ?? 1;
    let si = groupSi;
    if (regular) {
      // Same calendar month a year (and two years) earlier vs that year's average.
      const ratios = [Math.max(h[12 - k], 0) / level, ...(prevLevel > 0 && h[24 - k] !== undefined ? [Math.max(h[24 - k], 0) / prevLevel] : [])];
      const own = 1 + (Math.min(ratios.reduce((a, v) => a + v, 0) / ratios.length, 3) - 1) / 2;
      si = (own + groupSi) / 2;
    }
    return Math.round(level * trend * si * 10) / 10;
  });

  // Monthly demand: rest of this month at the trend pace, the 3 forecast months, then the trend pace.
  let left = Math.max(stock, 0);
  let days = 0;
  const now = new Date();
  const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const rates = [level * trend, ...fc, ...Array(9).fill(level * trend)];
  let stockoutDays: number | null = null;
  for (let i = 0; i < rates.length; i++) {
    const len = daysIn(now.getFullYear(), now.getMonth() + i);
    const span = i === 0 ? len - now.getDate() : len;
    const daily = rates[i] / len;
    if (daily > 0 && daily * span >= left) {
      stockoutDays = Math.round(days + left / daily);
      break;
    }
    left -= daily * span;
    days += span;
  }
  const note = [
    `μέσος όρος ${Math.round(level * 10) / 10}/μήνα`,
    regular ? `είδος ${pctTxt(itemTrend)}` : "αραιές πωλήσεις — βάση κατηγορίας/μάρκας",
    g.category ? `κατηγορία ${pctTxt(g.category.trend)}` : null,
    g.brand ? `μάρκα ${pctTxt(g.brand.trend)}` : null,
    g.category ? "εποχικότητα κατηγορίας" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return { forecast: fc, stockoutDays, forecastNote: note };
}

const MIN_RECENT = 5; // units in 90 days — below this a "trend" is noise

/** Why an item is on the order list and how urgent it is — by stock vs lead time at the recent pace. */
function assess(x: { stock: number; qty12m: number; qtyPrev12m: number; qty90d: number; leadDays: number | null; abc: string | null }) {
  const daily12 = Math.max(x.qty12m, 0) / 365;
  const daily90 = Math.max(x.qty90d, 0) / 90;
  const trendPct = daily12 > 0 && x.qty90d >= MIN_RECENT ? Math.round(((daily90 - daily12) / daily12) * 100) : null;
  const growthPct = x.qtyPrev12m > 0 ? Math.round(((x.qty12m - x.qtyPrev12m) / x.qtyPrev12m) * 100) : null;
  const pace = Math.max(daily12, daily90);
  const coverNow = pace > 0 ? Math.round((Math.max(x.stock, 0) / pace) * 10) / 10 : null;
  const lead = x.leadDays ?? 0;
  const rising = trendPct !== null && trendPct >= RISING;
  // «Επείγον» is kept for running out of what makes the turnover (class A) or sells faster now;
  // the rest that is short goes to «Σύντομα», so the red rows are the few that really matter.
  const important = x.abc === "A" || rising;
  const reasons: string[] = [];
  let urgency: Urgency = "normal";
  if (x.stock <= 0) {
    urgency = important ? "critical" : "urgent";
    reasons.push(x.stock < 0 ? "Αρνητικό απόθεμα — ελέγξτε και τις καταχωρήσεις" : x.qty90d > 0 ? "Εξαντλημένο, με πωλήσεις το τελευταίο τρίμηνο" : `Εξαντλημένο — ${x.qty12m.toLocaleString("el-GR")} τεμ. πωλήσεις τους τελευταίους 12 μήνες`);
  } else if (coverNow !== null && coverNow < lead) {
    urgency = important ? "critical" : "urgent";
    reasons.push(`Τελειώνει σε ~${Math.round(coverNow)} ημ., πριν φτάσει παραγγελία (παράδοση ${lead} ημ.)`);
  } else if (coverNow !== null && coverNow < lead + 7) {
    urgency = "urgent";
    reasons.push(`Κάλυψη ~${Math.round(coverNow)} ημ. με παράδοση ${lead} ημ.`);
  } else {
    reasons.push(`Κάτω από το σημείο αναπαραγγελίας (κάλυψη ~${coverNow === null ? "—" : Math.round(coverNow)} ημ.)`);
  }
  if (rising) {
    reasons.push(`Ζήτηση ↑ ${trendPct}% το τελευταίο τρίμηνο`);
    if (urgency === "normal") urgency = "urgent";
  } else if (trendPct !== null && trendPct <= -RISING) {
    reasons.push(`Ζήτηση ↓ ${Math.abs(trendPct)}% το τελευταίο τρίμηνο — ίσως μικρότερη ποσότητα`);
  }
  if (growthPct !== null && Math.abs(growthPct) >= 25) reasons.push(`${growthPct > 0 ? "+" : ""}${growthPct}% σε σχέση με πέρσι`);
  return { trendPct, growthPct, coverNow, urgency, reasons };
}

const URGENCY_ORDER: Record<Urgency, number> = { critical: 0, urgent: 1, normal: 2 };

const qi = (s: string) => `"${s.replaceAll('"', '""')}"`;
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function orderSuppliers(tenantId: string): Promise<OrderSupplier[]> {
  const schema = schemaName(tenantId);
  const s = qi(schema);
  return withWarehouse(async (db) => {
    const has = async (t: string) => !!(await db.query("SELECT to_regclass($1) AS t", [`${s}.${t}`])).rows[0]?.t;
    const brands = await has("brands");
    const purchases = await has("purchase_docs");
    // Every supplier: the main supplier of any item, or bought from in the last 2 years. Those with
    // suggestions come first; the brands they carry make them searchable by brand.
    const r = await db.query(
      `WITH st AS (
         SELECT m.main_supplier AS trdr, COUNT(*) FILTER (WHERE m.suggested_order_qty > 0)::int AS to_order, COUNT(*)::int AS total,
                ${brands ? "(array_agg(DISTINCT b.name) FILTER (WHERE b.name IS NOT NULL))[1:40]" : "ARRAY[]::text[]"} AS brands
         FROM ${s}.m_item_stats m
         LEFT JOIN ${s}.items i ON i.mtrl = m.mtrl
         ${brands ? `LEFT JOIN ${s}.brands b ON b.mtrmark = i.mtrmark` : ""}
         GROUP BY m.main_supplier
       ),
       pu AS (${purchases ? `SELECT DISTINCT trdr FROM ${s}.purchase_docs WHERE trndate >= now() - interval '24 months' AND trdr IS NOT NULL` : "SELECT NULL::bigint AS trdr WHERE false"})
       SELECT COALESCE(st.trdr, pu.trdr) AS trdr, sp.code, sp.name, COALESCE(st.to_order, 0) AS to_order, COALESCE(st.total, 0) AS total, st.brands
       FROM st FULL JOIN pu ON pu.trdr = st.trdr
       LEFT JOIN ${s}.suppliers sp ON sp.trdr = COALESCE(st.trdr, pu.trdr)
       WHERE COALESCE(st.trdr, pu.trdr) IS NOT NULL OR COALESCE(st.to_order, 0) > 0
       ORDER BY (COALESCE(st.trdr, pu.trdr) IS NULL), COALESCE(st.to_order, 0) DESC, sp.name`,
    );
    return r.rows.map((x) => ({
      trdr: n(x.trdr),
      code: x.code ?? null,
      name: x.name ?? (x.trdr === null ? "Χωρίς κύριο προμηθευτή" : `Προμηθευτής ${x.trdr}`),
      items: Number(x.to_order),
      total: Number(x.total),
      brands: (x.brands as string[] | null) ?? [],
    }));
  });
}

/** Order lines of the supplier: the suggested ones, or (all) every item they are main supplier of. */
export async function supplierOrderLines(tenantId: string, trdr: number | null, opts: { all?: boolean } = {}): Promise<OrderLine[]> {
  // trdr null = the items without a supplier (the order recipient is chosen when sending).
  return orderLinesWhere(tenantId, `m.main_supplier IS NOT DISTINCT FROM $1::bigint AND (m.suggested_order_qty > 0 OR $2)`, [trdr, !!opts.all]);
}

export type OrderBrand = { mtrmark: number; name: string; items: number; total: number; supplier: number | null };

/** Brands with their items: suggested / all, and the supplier most of their items come from. */
export async function orderBrands(tenantId: string): Promise<OrderBrand[]> {
  const s = qi(schemaName(tenantId));
  return withWarehouse(async (db) => {
    if (!(await db.query("SELECT to_regclass($1) AS t", [`${s}.brands`])).rows[0]?.t) return [];
    const r = await db.query(
      `SELECT b.mtrmark, b.name, COUNT(*) FILTER (WHERE m.suggested_order_qty > 0)::int AS to_order, COUNT(*)::int AS total,
              mode() WITHIN GROUP (ORDER BY m.main_supplier) AS supplier
       FROM ${s}.m_item_stats m JOIN ${s}.items i ON i.mtrl = m.mtrl JOIN ${s}.brands b ON b.mtrmark = i.mtrmark
       GROUP BY b.mtrmark, b.name
       ORDER BY COUNT(*) FILTER (WHERE m.suggested_order_qty > 0) DESC, b.name`,
    );
    return r.rows.map((x) => ({ mtrmark: Number(x.mtrmark), name: x.name ?? `Μάρκα ${x.mtrmark}`, items: Number(x.to_order), total: Number(x.total), supplier: n(x.supplier) }));
  });
}

/** Order lines of a brand, whoever supplied them so far: the suggested ones, or (all) every item. */
export async function brandOrderLines(tenantId: string, mtrmark: number, opts: { all?: boolean } = {}): Promise<OrderLine[]> {
  return orderLinesWhere(tenantId, `i.mtrmark = $1 AND (m.suggested_order_qty > 0 OR $2)`, [mtrmark, !!opts.all]);
}

/** Order lines for chosen items (added by hand to an order). */
export async function itemOrderLines(tenantId: string, mtrls: number[]): Promise<OrderLine[]> {
  if (!mtrls.length) return [];
  return orderLinesWhere(tenantId, `m.mtrl = ANY($1::bigint[])`, [mtrls]);
}

async function orderLinesWhere(
  tenantId: string,
  where: string,
  params: unknown[],
  opts: { orderBy?: string; limit?: number } = {},
): Promise<OrderLine[]> {
  const schema = schemaName(tenantId);
  const s = qi(schema);
  return withWarehouse(async (db) => {
    const has = async (t: string) => !!(await db.query("SELECT to_regclass($1) AS t", [`${s}.${t}`])).rows[0]?.t;
    const [brands, categories] = [await has("brands"), await has("item_categories")];
    // Marts built before the supplier source existed (rebuilt on the next sync).
    const source = (await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'm_item_stats' AND column_name = 'supplier_source'", [schema])).rowCount
      ? "m.supplier_source"
      : "NULL";
    const r = await db.query(
      `SELECT m.mtrl, i.code, i.name, m.abc, m.stock_qty, m.days_of_cover, m.lead_days, m.qty_12m, m.qty_prev_12m, m.qty_90d,
              m.suggested_order_qty, ${source} AS supplier_source, sp.name AS supplier_name, m.revenue_12m, m.last_sale,
              ${brands ? "b.name" : "NULL"} AS brand_name, ${categories ? "c.name" : "NULL"} AS category_name, i.mtrcategory, i.mtrmark
       FROM ${s}.m_item_stats m LEFT JOIN ${s}.items i ON i.mtrl = m.mtrl
       LEFT JOIN ${s}.suppliers sp ON sp.trdr = m.main_supplier
       ${brands ? `LEFT JOIN ${s}.brands b ON b.mtrmark = i.mtrmark` : ""}
       ${categories ? `LEFT JOIN ${s}.item_categories c ON c.mtrcategory = i.mtrcategory` : ""}
       WHERE ${where}
       ORDER BY ${opts.orderBy ?? "m.suggested_order_qty DESC NULLS LAST, m.qty_12m DESC NULLS LAST"}
       LIMIT ${Math.min(Math.max(opts.limit ?? 500, 1), 3000)}`,
      params,
    );
    const mtrls = r.rows.map((x) => Number(x.mtrl));
    // Monthly sales of these items, last 24 calendar months (current month included): 12 shown,
    // all 24 feed the forecast (seasonality = the same months a year earlier).
    const months = await db.query(
      `SELECT mtrl, (EXTRACT(YEAR FROM age(date_trunc('month', now()), date_trunc('month', trndate))) * 12
                     + EXTRACT(MONTH FROM age(date_trunc('month', now()), date_trunc('month', trndate))))::int AS ago,
              SUM(qty)::float AS qty
       FROM ${s}.f_sales_lines
       WHERE mtrl = ANY($1::bigint[]) AND trndate >= date_trunc('month', now()) - interval '23 months'
       GROUP BY 1, 2`,
      [mtrls],
    );
    /** index = months ago (0 = this month … 23). */
    const history = new Map<number, number[]>();
    for (const m of months.rows) {
      const arr = history.get(Number(m.mtrl)) ?? Array(24).fill(0);
      const ago = Number(m.ago);
      if (ago >= 0 && ago < 24) arr[ago] = Math.round(Number(m.qty) * 100) / 100;
      history.set(Number(m.mtrl), arr);
    }
    const monthly = new Map<number, number[]>([...history].map(([k, h]) => [k, h.slice(0, 12).reverse()]));
    // Trends of the categories and brands of these items (lib/demand-trends).
    const ids = (col: string) => [...new Set(r.rows.map((x) => x[col]).filter((v) => v !== null && v !== undefined).map(Number))];
    // One connection: one query at a time.
    const catTrends = await groupTrends(db, s, "category", ids("mtrcategory"));
    const brandTrends: CategoryTrend[] = brands ? await groupTrends(db, s, "brand", ids("mtrmark")) : [];
    const catOf = new Map(catTrends.map((t) => [t.id, t]));
    const brandOf = new Map(brandTrends.map((t) => [t.id, t]));
    return r.rows
      .map((x) => {
        const base = {
          stock: Number(x.stock_qty ?? 0),
          qty12m: Number(x.qty_12m ?? 0),
          qtyPrev12m: Number(x.qty_prev_12m ?? 0),
          qty90d: Number(x.qty_90d ?? 0),
          leadDays: n(x.lead_days),
          abc: (x.abc as string | null) ?? null,
        };
        return {
          mtrl: Number(x.mtrl),
          code: x.code ?? null,
          name: x.name ?? `Είδος ${x.mtrl}`,
          daysOfCover: n(x.days_of_cover),
          monthly: monthly.get(Number(x.mtrl)) ?? Array(12).fill(0),
          suggested: Number(x.suggested_order_qty ?? 0),
          supplier: (x.supplier_name as string | null) ?? null,
          brand: (x.brand_name as string | null) ?? null,
          category: (x.category_name as string | null) ?? null,
          revenue12m: Number(x.revenue_12m ?? 0),
          lastSale: x.last_sale ? new Date(x.last_sale).toISOString().slice(0, 10) : null,
          supplierSource: (x.supplier_source as "item" | "brand" | null) ?? null,
          ...base,
          ...assess(base),
          ...forecast(history.get(Number(x.mtrl)) ?? Array(24).fill(0), base.stock, {
            category: x.mtrcategory === null ? undefined : catOf.get(Number(x.mtrcategory)),
            brand: x.mtrmark === null ? undefined : brandOf.get(Number(x.mtrmark)),
          }),
          categoryTrend: x.mtrcategory === null ? null : (catOf.get(Number(x.mtrcategory))?.quarterPct ?? null),
        };
      })
      .map((l) => {
        // Shown with «all items» but not suggested: say why nothing is needed.
        if (l.suggested <= 0) {
          l.urgency = "normal";
          l.reasons =
            l.qty12m <= 0
              ? [l.stock > 0 ? "Χωρίς πωλήσεις τους τελευταίους 12 μήνες" : "Χωρίς απόθεμα και χωρίς πρόσφατη ζήτηση"]
              : l.stock <= 0
                ? ["Εξαντλημένο — σποραδικές πωλήσεις (1 παραστατικό στο έτος)"]
                : [`Επαρκές απόθεμα — κάλυψη ~${Math.round(l.coverNow ?? 0)} ημ.`];
        }
        if (l.supplierSource === "brand" && l.supplier) l.reasons = [...l.reasons, `Προμηθευτής από τη μάρκα: ${l.supplier}`];
        return l;
      })
      .sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] || (a.coverNow ?? 1e9) - (b.coverNow ?? 1e9));
  });
}

// Codes / brands typed with the Greek keyboard layout by mistake («βεσσεω» → «bessey»).
const KEYS: Record<string, string> = {
  ς: "w", ε: "e", ρ: "r", τ: "t", υ: "y", θ: "u", ι: "i", ο: "o", π: "p", α: "a", σ: "s", δ: "d", φ: "f", γ: "g",
  η: "h", ξ: "j", κ: "k", λ: "l", ζ: "z", χ: "x", ψ: "c", ω: "v", β: "b", ν: "n", μ: "m",
};
const latinKeys = (q: string) => [...q.toLowerCase()].map((c) => KEYS[c] ?? c).join("");

/**
 * Sales movement and stock per item (Προϊόντα → Κίνηση): items that sold in the last 12 months or
 * hold stock, biggest turnover first, optionally narrowed by text / brand / category.
 */
export async function itemMovement(tenantId: string, f: { q?: string; brand?: string; category?: string; limit?: number } = {}): Promise<OrderLine[]> {
  const where = ["(m.qty_12m <> 0 OR m.qty_prev_12m <> 0 OR m.stock_qty <> 0)"];
  const params: unknown[] = [];
  const term = f.q?.trim();
  if (term) {
    params.push(`%${term}%`, `%${latinKeys(term)}%`);
    where.push(`(i.code ILIKE $${params.length - 1} OR i.name ILIKE $${params.length - 1} OR i.code ILIKE $${params.length})`);
  }
  if (f.brand) {
    params.push(f.brand);
    where.push(`i.mtrmark IN (SELECT mtrmark FROM ${qi(schemaName(tenantId))}.brands WHERE name = $${params.length})`);
  }
  if (f.category) {
    params.push(f.category);
    where.push(`i.mtrcategory IN (SELECT mtrcategory FROM ${qi(schemaName(tenantId))}.item_categories WHERE name = $${params.length})`);
  }
  const lines = await orderLinesWhere(tenantId, where.join(" AND "), params, { orderBy: "m.revenue_12m DESC NULLS LAST, m.stock_qty DESC", limit: f.limit ?? 1500 });
  return lines.sort((a, b) => b.revenue12m - a.revenue12m);
}

export type DemandOverview = { categories: GroupWithStock[]; brands: GroupWithStock[]; insights: TrendInsight[] };

/** Category and brand trends with their stock, and what they mean (Προϊόντα → Κίνηση). */
export async function demandOverview(tenantId: string): Promise<DemandOverview> {
  const s = qi(schemaName(tenantId));
  return withWarehouse(async (db) => {
    const hasBrands = !!(await db.query("SELECT to_regclass($1) AS t", [`${s}.brands`])).rows[0]?.t;
    const categories = withStock(await groupTrends(db, s, "category"), await groupStock(db, s, "category"));
    const brands = hasBrands ? withStock(await groupTrends(db, s, "brand"), await groupStock(db, s, "brand")) : [];
    return {
      categories,
      brands,
      insights: trendInsights([
        { by: "category", list: categories },
        { by: "brand", list: brands },
      ]),
    };
  });
}

export type ItemHit = { mtrl: number; code: string | null; name: string; brand: string | null; supplier: string | null; stock: number; qty12m: number };

/** Items by code, name or brand (to add to an order). */
export async function searchOrderItems(tenantId: string, q: string): Promise<ItemHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const s = qi(schemaName(tenantId));
  return withWarehouse(async (db) => {
    const brands = !!(await db.query("SELECT to_regclass($1) AS t", [`${s}.brands`])).rows[0]?.t;
    const r = await db.query(
      `SELECT i.mtrl, i.code, i.name, ${brands ? "b.name" : "NULL"} AS brand, sp.name AS supplier, m.stock_qty, m.qty_12m
       FROM ${s}.items i
       JOIN ${s}.m_item_stats m ON m.mtrl = i.mtrl
       ${brands ? `LEFT JOIN ${s}.brands b ON b.mtrmark = i.mtrmark` : ""}
       LEFT JOIN ${s}.suppliers sp ON sp.trdr = m.main_supplier
       WHERE i.code ILIKE $1 OR i.name ILIKE $2 OR i.code ILIKE $3 ${brands ? "OR b.name ILIKE $2 OR b.name ILIKE $4" : ""}
       ORDER BY (i.code ILIKE $1) DESC, m.qty_12m DESC NULLS LAST
       LIMIT 40`,
      [`${term}%`, `%${term}%`, `${latinKeys(term)}%`, `%${latinKeys(term)}%`],
    );
    return r.rows.map((x) => ({
      mtrl: Number(x.mtrl),
      code: x.code ?? null,
      name: x.name ?? `Είδος ${x.mtrl}`,
      brand: x.brand ?? null,
      supplier: x.supplier ?? null,
      stock: Number(x.stock_qty ?? 0),
      qty12m: Number(x.qty_12m ?? 0),
    }));
  });
}

/** The series of the supplier's latest purchase order in SoftOne (among the allowed ones), if any. */
export async function supplierOrderSeries(tenantId: string, trdr: number, allowed: number[]): Promise<number | null> {
  if (!allowed.length) return null;
  const s = qi(schemaName(tenantId));
  return withWarehouse(async (db) => {
    const r = await db.query(
      `SELECT series FROM ${s}.purchase_docs WHERE trdr = $1 AND series = ANY($2::int[]) ORDER BY trndate DESC NULLS LAST LIMIT 1`,
      [trdr, allowed],
    );
    return r.rows[0] ? Number(r.rows[0].series) : null;
  }).catch(() => null);
}

/** Where orders go: the tenant's verified SoftOne connection, the allowed series and the warehouse. */
export async function orderTarget(tenantId: string) {
  const [settings, conn] = await Promise.all([
    getBiSettings(tenantId),
    prisma.softOneConnection.findFirst({ where: { scope: "TENANT", tenantId }, select: { id: true, lastTestStatus: true } }),
  ]);
  const series = Array.isArray(settings.purchaseOrderSeries) ? settings.purchaseOrderSeries : [];
  const whouse = settings.orderWarehouse ?? settings.mainWarehouses[0] ?? null;
  const problem = !conn
    ? "Δεν υπάρχει σύνδεση με το SoftOne της εταιρείας."
    : conn.lastTestStatus !== "OK"
      ? "Η σύνδεση με το SoftOne δεν είναι ενεργή."
      : !series.length
        ? "Δεν έχουν οριστεί σειρές παραγγελίας αγοράς (ο διαχειριστής τις ρυθμίζει στον πελάτη → Παραγγελίες αγορών)."
        : !whouse
          ? "Δεν έχει οριστεί αποθήκη παραγγελιών."
          : null;
  return { connectionId: conn?.id ?? null, series, whouse, problem };
}

/** Writes the order to SoftOne and reads it back (setData success ≠ persisted). */
export async function createPurchaseOrder(
  tenantId: string,
  order: { trdr: number; series: number; lines: { mtrl: number; qty: number }[]; comment: string },
) {
  const { trdr, lines, comment } = order;
  const target = await orderTarget(tenantId);
  if (target.problem || !target.connectionId) throw new Error(target.problem ?? "Η παραγγελία δεν μπορεί να σταλεί.");
  if (!target.series.some((s) => s.id === order.series)) throw new Error("Η σειρά δεν επιτρέπεται για παραγγελίες.");
  const findoc = Number(
    await s1SetData(target.connectionId, "PURDOC", {
      PURDOC: [{ SERIES: order.series, TRDR: trdr, COMMENTS: comment.slice(0, 255) }],
      MTRDOC: [{ WHOUSE: target.whouse }],
      ITELINES: lines.map((l) => ({ MTRL: l.mtrl, QTY1: l.qty, WHOUSE: target.whouse })),
    }),
  );
  if (!Number.isInteger(findoc) || findoc <= 0) throw new Error("Το SoftOne δεν επέστρεψε αριθμό παραστατικού.");
  const doc = await s1GetData(target.connectionId, "PURDOC", findoc, "PURDOC:FINDOC,FINCODE,TRDR;ITELINES:MTRL,QTY1");
  const data = doc.data as Record<string, Record<string, unknown>[]> | undefined;
  const head = data?.PURDOC?.[0];
  if (!head || Number(head.TRDR) !== trdr) throw new Error(`Η παραγγελία ${findoc} δεν επιβεβαιώθηκε στο SoftOne.`);
  return { findoc, fincode: head.FINCODE ? String(head.FINCODE) : String(findoc), lines: data?.ITELINES?.length ?? lines.length };
}
