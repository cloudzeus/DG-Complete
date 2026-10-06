import "server-only";
import { memo, MEMO_TTL } from "@/lib/memo";
import { schemaName } from "@/lib/warehouse";
import { withWarehouse } from "@/lib/warehouse-writer";
import { clamp, kmeans, linreg, median, qi, quantile, round, standardise } from "@/lib/smart/mining";

// Τιμολόγηση & εκπτώσεις — standard SoftOne data only (sales lines PRICE / DISC1PRC / LNETLINEVAL,
// purchase lines, item PRICEW):
// - price elasticity per item: log-log regression of monthly quantity on the average net price
//   (24 months); items without enough price variation borrow their category's median elasticity;
// - suggested price: the price in ±10% that maximises gross profit under that elasticity, and the
//   matching wholesale list price (PRICEW) for an import into SoftOne;
// - discounts: customers grouped by k-means (size, discount, margin, frequency); a customer whose
//   discount is above the median of its peers (same size band) gives away the difference;
// - cost increases not passed on: purchase cost of the last 90 days vs the 12 months before,
//   against the selling price over the same periods.

export type PriceSuggestion = {
  mtrl: number;
  code: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  price: number;
  cost: number | null;
  marginPct: number | null;
  qty12: number;
  elasticity: number;
  source: "item" | "category";
  r2: number;
  newPrice: number;
  changePct: number;
  pricew: number | null;
  newPricew: number | null;
  profitNow: number;
  profitGain: number;
};
export type DiscountCustomer = {
  trdr: number;
  code: string | null;
  name: string;
  revenue: number;
  gross: number;
  discount: number;
  discountPct: number;
  peerPct: number;
  excess: number;
  marginPct: number | null;
  cluster: string;
};
export type DiscountCluster = { name: string; customers: number; revenue: number; discountPct: number; marginPct: number };
export type CostCreep = {
  mtrl: number;
  code: string | null;
  name: string;
  brand: string | null;
  costBefore: number;
  costNow: number;
  costChangePct: number;
  priceBefore: number;
  priceNow: number;
  priceChangePct: number;
  qty12: number;
  lost: number;
  pricew: number | null;
  neededPricew: number | null;
};
export type CategoryMargin = { name: string; revenue: number; marginPct: number; p25: number; below: number; elasticity: number | null };
export type Pricing = {
  suggestions: PriceSuggestion[];
  totalGain: number;
  discountTotal: number;
  discountPct: number;
  excessTotal: number;
  customers: DiscountCustomer[];
  clusters: DiscountCluster[];
  brandDiscounts: { name: string; gross: number; discount: number; discountPct: number }[];
  creep: CostCreep[];
  creepTotal: number;
  categories: CategoryMargin[];
  elasticityItems: number;
};

const has = async (db: { query: (q: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }, s: string, t: string) =>
  !!(await db.query("SELECT to_regclass($1) AS t", [`${s}.${t}`])).rows[0]?.t;
const n = (v: unknown) => Number(v ?? 0) || 0;

async function compute(tenantId: string): Promise<Pricing> {
  const s = qi(schemaName(tenantId));
  return withWarehouse(async (db) => {
    const brandJoin = (await has(db, s, "brands")) ? `LEFT JOIN ${s}.brands b ON b.mtrmark = i.mtrmark` : "";
    const catJoin = (await has(db, s, "item_categories")) ? `LEFT JOIN ${s}.item_categories c ON c.mtrcategory = i.mtrcategory` : "";
    const brand = brandJoin ? "b.name" : "NULL";
    const cat = catJoin ? "c.name" : "NULL";

    // ── Items: the 1.500 biggest sellers with their monthly price/quantity history.
    const items = (
      await db.query(
        `SELECT m.mtrl, i.code, i.name, ${brand} AS brand, ${cat} AS category, i.pricew::float AS pricew,
                m.qty_12m::float AS q12, m.revenue_12m::float AS rev, m.unit_cost::float AS cost
         FROM ${s}.m_item_stats m JOIN ${s}.items i ON i.mtrl = m.mtrl ${brandJoin} ${catJoin}
         WHERE m.qty_12m > 0 AND m.revenue_12m > 0
         ORDER BY m.revenue_12m DESC LIMIT 1500`,
      )
    ).rows;
    const ids = items.map((x) => Number(x.mtrl));
    const monthly = (
      await db.query(
        `SELECT mtrl, date_trunc('month', trndate) AS m, SUM(qty)::float AS q, SUM(net)::float AS v
         FROM ${s}.f_sales_lines WHERE mtrl = ANY($1::bigint[]) AND sign = 1 AND qty > 0 AND net > 0 AND trndate >= now() - interval '24 months'
         GROUP BY 1, 2`,
        [ids],
      )
    ).rows;
    const recent = new Map(
      (
        await db.query(
          `SELECT mtrl, SUM(net)::float / NULLIF(SUM(qty), 0) AS p FROM ${s}.f_sales_lines
           WHERE mtrl = ANY($1::bigint[]) AND sign = 1 AND qty > 0 AND net > 0 AND trndate >= now() - interval '6 months' GROUP BY 1`,
          [ids],
        )
      ).rows.map((r) => [Number(r.mtrl), n(r.p)]),
    );
    const series = new Map<number, { p: number; q: number }[]>();
    for (const r of monthly) {
      const id = Number(r.mtrl);
      const arr = series.get(id) ?? [];
      arr.push({ p: n(r.v) / n(r.q), q: n(r.q) });
      series.set(id, arr);
    }
    // Elasticity per item where the price actually moved (coefficient of variation ≥ 3%).
    const est = new Map<number, { e: number; r2: number }>();
    for (const [id, pts] of series) {
      if (pts.length < 6) continue;
      const ps = pts.map((x) => x.p);
      const mean = ps.reduce((a, b) => a + b, 0) / ps.length;
      const cv = Math.sqrt(ps.reduce((a, b) => a + (b - mean) ** 2, 0) / ps.length) / mean;
      if (cv < 0.03) continue;
      const r = linreg(ps.map(Math.log), pts.map((x) => Math.log(x.q)));
      if (r.b < 0 && r.r2 >= 0.1) est.set(id, { e: clamp(r.b, -4, -0.2), r2: r.r2 });
    }
    const byCat = new Map<string, number[]>();
    for (const x of items) {
      const e = est.get(Number(x.mtrl));
      if (e && x.category) byCat.set(String(x.category), [...(byCat.get(String(x.category)) ?? []), e.e]);
    }
    const catE = new Map([...byCat].filter(([, v]) => v.length >= 3).map(([k, v]) => [k, median(v)]));

    // Category margins (for the P25 rule and the table).
    const catRows = new Map<string, { rev: number; margin: number; pcts: number[] }>();
    for (const x of items) {
      const p = recent.get(Number(x.mtrl));
      const c = x.cost === null ? null : n(x.cost);
      if (!x.category || !p || !c) continue;
      const k = String(x.category);
      const row = catRows.get(k) ?? { rev: 0, margin: 0, pcts: [] };
      row.rev += n(x.rev);
      row.margin += n(x.rev) * ((p - c) / p);
      row.pcts.push(((p - c) / p) * 100);
      catRows.set(k, row);
    }

    // ── Suggested prices.
    const suggestions: PriceSuggestion[] = [];
    for (const x of items) {
      const id = Number(x.mtrl);
      const p0 = recent.get(id);
      const c = x.cost === null ? null : n(x.cost);
      // Only items sold above cost with a believable cost (cost errors would drive the optimum).
      if (!p0 || !c || c <= 0 || c >= p0 || c < p0 * 0.2) continue;
      const own = est.get(id);
      const e = own?.e ?? (x.category ? catE.get(String(x.category)) : undefined);
      if (e === undefined) continue;
      const q0 = n(x.q12);
      const profit = (p: number) => (p - c) * q0 * (p / p0) ** e;
      let best = p0;
      for (let k = -10; k <= 10; k++) {
        const p = p0 * (1 + k / 100);
        if (p > c && profit(p) > profit(best)) best = p;
      }
      const gain = profit(best) - profit(p0);
      // Borrowed elasticities only move prices up, and only on items below their category's typical margin.
      const catP25 = x.category ? quantile(catRows.get(String(x.category))?.pcts ?? [], 0.5) : 0;
      if (!own && (best < p0 || ((p0 - c) / p0) * 100 >= catP25)) continue;
      if (gain < 50 || Math.abs(best / p0 - 1) < 0.01) continue;
      const pricew = x.pricew ? n(x.pricew) : null;
      suggestions.push({
        mtrl: id,
        code: (x.code as string) ?? null,
        name: String(x.name ?? ""),
        brand: (x.brand as string) ?? null,
        category: (x.category as string) ?? null,
        price: round(p0, 2),
        cost: round(c, 2),
        marginPct: round(((p0 - c) / p0) * 100, 1),
        qty12: q0,
        elasticity: round(e, 2),
        source: own ? "item" : "category",
        r2: round(own?.r2 ?? 0, 2),
        newPrice: round(best, 2),
        changePct: round((best / p0 - 1) * 100, 1),
        pricew,
        newPricew: pricew ? round(pricew * (best / p0), 2) : null,
        profitNow: round(profit(p0)),
        profitGain: round(gain),
      });
    }
    suggestions.sort((a, b) => b.profitGain - a.profitGain);

    // ── Discounts (12 months): list value vs net value on the line.
    const discRows = (
      await db.query(
        `SELECT f.trdr, f.mtrl, SUM(GREATEST(sl.price * sl.qty1, f.net))::float AS gross, SUM(f.net)::float AS net, SUM(f.cost)::float AS cost
         FROM ${s}.f_sales_lines f JOIN ${s}.sales_lines sl ON sl.findoc = f.findoc AND sl.mtrlines = f.mtrlines
         WHERE f.sign = 1 AND f.trndate >= now() - interval '12 months' AND sl.price > 0 AND f.net > 0
         GROUP BY 1, 2`,
      )
    ).rows;
    const brandOf = new Map(items.map((x) => [Number(x.mtrl), (x.brand as string) ?? null]));
    const cust = new Map<number, { gross: number; net: number; cost: number }>();
    const brands = new Map<string, { gross: number; net: number }>();
    for (const r of discRows) {
      const t = Number(r.trdr);
      const c = cust.get(t) ?? { gross: 0, net: 0, cost: 0 };
      c.gross += n(r.gross);
      c.net += n(r.net);
      c.cost += n(r.cost);
      cust.set(t, c);
      const b = brandOf.get(Number(r.mtrl));
      if (b) {
        const x = brands.get(b) ?? { gross: 0, net: 0 };
        x.gross += n(r.gross);
        x.net += n(r.net);
        brands.set(b, x);
      }
    }
    const invoices = new Map(
      (await db.query(`SELECT trdr, invoices_12m::float AS inv FROM ${s}.m_customer_stats`)).rows.map((r) => [Number(r.trdr), n(r.inv)]),
    );
    const names = new Map(
      (await db.query(`SELECT trdr, code, name FROM ${s}.customers`)).rows.map((r) => [Number(r.trdr), { code: (r.code as string) ?? null, name: String(r.name ?? "") }]),
    );
    const list = [...cust].filter(([, c]) => c.net >= 500).map(([trdr, c]) => ({ trdr, ...c, pct: c.gross > 0 ? (1 - c.net / c.gross) * 100 : 0, mpct: c.cost > 0 ? ((c.net - c.cost) / c.net) * 100 : null }));
    // Size bands (quintiles of revenue) → the peers' median discount.
    const revs = list.map((x) => x.net);
    const cuts = [0.2, 0.4, 0.6, 0.8].map((q) => quantile(revs, q));
    const band = (v: number) => cuts.filter((c) => v > c).length;
    const peer = new Map<number, number>();
    for (let b = 0; b <= 4; b++) peer.set(b, median(list.filter((x) => band(x.net) === b).map((x) => x.pct)));
    // Customer groups: k-means on size, discount, margin and frequency.
    const feats = list.map((x) => [Math.log10(x.net), x.pct, x.mpct ?? 0, Math.log10(1 + (invoices.get(x.trdr) ?? 0))]);
    const { labels } = kmeans(standardise(feats).z, 4);
    const groups = new Map<number, typeof list>();
    list.forEach((x, i) => groups.set(labels[i], [...(groups.get(labels[i]) ?? []), x]));
    const avgRev = median(revs);
    const allDisc = median(list.map((x) => x.pct));
    const raw = [...groups].map(([k, g]) => {
      const rev = g.reduce((a, x) => a + x.net, 0);
      const gross = g.reduce((a, x) => a + x.gross, 0);
      const cost = g.reduce((a, x) => a + x.cost, 0);
      const dp = gross ? (1 - rev / gross) * 100 : 0;
      const big = median(g.map((x) => x.net)) > avgRev * 2;
      const name = `${big ? "Μεγάλοι" : "Μικρότεροι"} πελάτες με ${dp > allDisc ? "υψηλή" : "χαμηλή"} έκπτωση`;
      return { k, name, customers: g.length, revenue: round(rev), discountPct: round(dp, 1), marginPct: cost > 0 ? round(((rev - cost) / rev) * 100, 1) : 0 };
    });
    raw.sort((a, b) => b.revenue - a.revenue);
    const used = new Map<string, number>();
    for (const c of raw) {
      const i = (used.get(c.name) ?? 0) + 1;
      used.set(c.name, i);
      if (i > 1) c.name = `${c.name} · ${i}`;
    }
    const clusterName = new Map(raw.map((c) => [c.k, c.name]));
    const clusters: DiscountCluster[] = raw.map((c) => ({ name: c.name, customers: c.customers, revenue: c.revenue, discountPct: c.discountPct, marginPct: c.marginPct }));
    const customers: DiscountCustomer[] = list
      .map((x, i) => {
        const pp = peer.get(band(x.net)) ?? 0;
        const excess = x.pct > pp ? ((x.pct - pp) / 100) * x.gross : 0;
        return {
          trdr: x.trdr,
          code: names.get(x.trdr)?.code ?? null,
          name: names.get(x.trdr)?.name ?? String(x.trdr),
          revenue: round(x.net),
          gross: round(x.gross),
          discount: round(x.gross - x.net),
          discountPct: round(x.pct, 1),
          peerPct: round(pp, 1),
          excess: round(excess),
          marginPct: x.mpct === null ? null : round(x.mpct, 1),
          cluster: clusterName.get(labels[i]) ?? "",
        };
      })
      .filter((x) => x.excess >= 100)
      .sort((a, b) => b.excess - a.excess);
    const gT = list.reduce((a, x) => a + x.gross, 0);
    const nT = list.reduce((a, x) => a + x.net, 0);

    // ── Cost increases not passed on.
    const creepRows = (
      await db.query(
        `WITH pc AS (
           SELECT mtrl,
                  SUM(net) FILTER (WHERE trndate >= now() - interval '90 days')::float / NULLIF(SUM(qty) FILTER (WHERE trndate >= now() - interval '90 days'), 0) AS now_c,
                  SUM(net) FILTER (WHERE trndate < now() - interval '90 days')::float / NULLIF(SUM(qty) FILTER (WHERE trndate < now() - interval '90 days'), 0) AS before_c
           FROM ${s}.f_purchase_lines WHERE sign = 1 AND qty > 0 AND net > 0 AND trndate >= now() - interval '15 months' GROUP BY 1
         ), sp AS (
           SELECT mtrl,
                  SUM(net) FILTER (WHERE trndate >= now() - interval '90 days')::float / NULLIF(SUM(qty) FILTER (WHERE trndate >= now() - interval '90 days'), 0) AS now_p,
                  SUM(net) FILTER (WHERE trndate < now() - interval '90 days')::float / NULLIF(SUM(qty) FILTER (WHERE trndate < now() - interval '90 days'), 0) AS before_p
           FROM ${s}.f_sales_lines WHERE sign = 1 AND qty > 0 AND net > 0 AND trndate >= now() - interval '15 months' GROUP BY 1
         )
         SELECT pc.mtrl, i.code, i.name, ${brand} AS brand, i.pricew::float AS pricew, m.qty_12m::float AS q12,
                pc.before_c, pc.now_c, sp.before_p, sp.now_p
         FROM pc JOIN sp ON sp.mtrl = pc.mtrl JOIN ${s}.items i ON i.mtrl = pc.mtrl JOIN ${s}.m_item_stats m ON m.mtrl = pc.mtrl ${brandJoin}
         WHERE pc.before_c > 0 AND pc.now_c > 0 AND sp.before_p > 0 AND sp.now_p > 0 AND m.qty_12m > 0`,
      )
    ).rows;
    const creep: CostCreep[] = [];
    for (const r of creepRows) {
      const cb = n(r.before_c);
      const cn = n(r.now_c);
      const pb = n(r.before_p);
      const pn = n(r.now_p);
      const dc = cn / cb - 1;
      const dp = pn / pb - 1;
      if (dc < 0.03 || dc > 1 || dp >= dc - 0.02) continue;
      // Margin kept in € per unit if the price had followed the cost in %.
      const lost = (pb * (1 + dc) - pn) * n(r.q12);
      if (lost < 50) continue;
      const pricew = r.pricew ? n(r.pricew) : null;
      creep.push({
        mtrl: Number(r.mtrl),
        code: (r.code as string) ?? null,
        name: String(r.name ?? ""),
        brand: (r.brand as string) ?? null,
        costBefore: round(cb, 2),
        costNow: round(cn, 2),
        costChangePct: round(dc * 100, 1),
        priceBefore: round(pb, 2),
        priceNow: round(pn, 2),
        priceChangePct: round(dp * 100, 1),
        qty12: n(r.q12),
        lost: round(lost),
        pricew,
        neededPricew: pricew ? round(pricew * ((pb * (1 + dc)) / pn), 2) : null,
      });
    }
    creep.sort((a, b) => b.lost - a.lost);

    const categories: CategoryMargin[] = [...catRows]
      .map(([name, r]) => ({
        name,
        revenue: round(r.rev),
        marginPct: r.rev ? round((r.margin / r.rev) * 100, 1) : 0,
        p25: round(quantile(r.pcts, 0.25), 1),
        below: r.pcts.filter((v) => v < quantile(r.pcts, 0.25)).length,
        elasticity: catE.has(name) ? round(catE.get(name)!, 2) : null,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 30);

    return {
      suggestions: suggestions.slice(0, 500),
      totalGain: round(suggestions.reduce((a, x) => a + x.profitGain, 0)),
      discountTotal: round(gT - nT),
      discountPct: gT ? round((1 - nT / gT) * 100, 1) : 0,
      excessTotal: round(customers.reduce((a, x) => a + x.excess, 0)),
      customers: customers.slice(0, 300),
      clusters,
      brandDiscounts: [...brands]
        .map(([name, b]) => ({ name, gross: round(b.gross), discount: round(b.gross - b.net), discountPct: b.gross ? round((1 - b.net / b.gross) * 100, 1) : 0 }))
        .sort((a, b) => b.discount - a.discount)
        .slice(0, 20),
      creep: creep.slice(0, 300),
      creepTotal: round(creep.reduce((a, x) => a + x.lost, 0)),
      categories,
      elasticityItems: est.size,
    };
  });
}

export function pricing(tenantId: string) {
  return memo(`pricing:${tenantId}`, MEMO_TTL, () => compute(tenantId));
}
