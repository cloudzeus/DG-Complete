import "server-only";
import { memo, MEMO_TTL } from "@/lib/memo";
import { schemaName } from "@/lib/warehouse";
import { withWarehouse } from "@/lib/warehouse-writer";
import { clamp, qi, round } from "@/lib/smart/mining";

// Επαναπροσέλκυση πελατών:
// - probability that a customer is lost: how far past their own purchase rhythm they are (a
//   Weibull-shaped curve on recency ÷ usual interval), raised by a falling trend;
// - value at risk = their yearly revenue × that probability;
// - brands they stopped buying (bought in the previous year, nothing in the last 6 months);
// - what similar customers buy (same top category, the brands most of them buy) that they don't —
//   the "customers like you also buy" rule (support among peers), for the offer.

export type WinbackCustomer = {
  trdr: number;
  code: string | null;
  name: string;
  revenuePrev: number;
  revenue12: number;
  recency: number;
  usualGap: number | null;
  probability: number;
  valueAtRisk: number;
  stage: "Σε κίνδυνο" | "Χάνεται" | "Χαμένος";
  stoppedBrands: { brand: string; before: number }[];
  peerBrands: { brand: string; share: number }[];
  topCategory: string | null;
};
export type Winback = {
  customers: WinbackCustomer[];
  valueAtRisk: number;
  stages: { stage: string; customers: number; value: number }[];
  stoppedBrands: { brand: string; customers: number; value: number }[];
};

const n = (v: unknown) => Number(v ?? 0) || 0;

async function compute(tenantId: string): Promise<Winback> {
  const s = qi(schemaName(tenantId));
  return withWarehouse(async (db) => {
    const has = async (t: string) => !!(await db.query("SELECT to_regclass($1) AS t", [`${s}.${t}`])).rows[0]?.t;
    const brandName = (await has("brands")) ? `COALESCE((SELECT name FROM ${s}.brands b WHERE b.mtrmark = i.mtrmark), 'Χωρίς μάρκα')` : "'Χωρίς μάρκα'";
    const catName = (await has("item_categories")) ? `COALESCE((SELECT name FROM ${s}.item_categories c WHERE c.mtrcategory = i.mtrcategory), 'Χωρίς κατηγορία')` : "'Χωρίς κατηγορία'";

    const cust = (
      await db.query(
        `SELECT cs.trdr, c.code, c.name, cs.recency_days::float AS rec, cs.avg_days_between_purchases::float AS gap, cs.invoices_24m::float AS inv,
                cs.revenue_12m::float AS r12, cs.revenue_prev_12m::float AS rp
         FROM ${s}.m_customer_stats cs JOIN ${s}.customers c ON c.trdr = cs.trdr
         WHERE cs.invoices_24m >= 3 AND cs.revenue_12m + cs.revenue_prev_12m >= 1000 AND cs.recency_days < 730`,
      )
    ).rows;
    const scored = cust
      .map((c) => {
        const gap = n(c.gap) || null;
        const rec = n(c.rec);
        const yearly = Math.max(n(c.r12), n(c.rp));
        const ratio = rec / Math.max(14, gap ?? 60);
        // P(lost) ~ Weibull CDF on "periods missed": ~0 at the usual rhythm, ~0.6 at 3×, ~0.9 at 5×.
        let p = 1 - Math.exp(-((Math.max(0, ratio - 1) / 2.5) ** 1.6));
        const trend = n(c.rp) > 0 ? n(c.r12) / n(c.rp) : 1;
        if (trend < 0.7) p = clamp(p + (0.7 - trend) * 0.5, 0, 1);
        return { c, gap, rec, yearly, p };
      })
      .filter((x) => x.p >= 0.35 && x.yearly * x.p >= 300)
      .sort((a, b) => b.yearly * b.p - a.yearly * a.p)
      .slice(0, 300);
    const ids = scored.map((x) => Number(x.c.trdr));

    // Brand purchases of these customers: previous year vs the last 6 months.
    const brandRows = (
      await db.query(
        `SELECT f.trdr, ${brandName} AS brand, ${catName} AS cat,
                SUM(f.net) FILTER (WHERE f.trndate >= now() - interval '24 months' AND f.trndate < now() - interval '12 months')::float AS before,
                SUM(f.net) FILTER (WHERE f.trndate >= now() - interval '6 months')::float AS recent,
                SUM(f.net)::float AS total
         FROM ${s}.f_sales_lines f JOIN ${s}.items i ON i.mtrl = f.mtrl
         WHERE f.trdr = ANY($1::bigint[]) AND f.trndate >= now() - interval '24 months' AND f.sign = 1
         GROUP BY 1, 2, 3`,
        [ids],
      )
    ).rows;
    const byCust = new Map<number, typeof brandRows>();
    for (const r of brandRows) byCust.set(Number(r.trdr), [...(byCust.get(Number(r.trdr)) ?? []), r]);

    // Peer brand shares per top category: among all active customers whose biggest category is X,
    // the share buying each brand (12 months).
    const peers = (
      await db.query(
        `WITH cat AS (
           SELECT DISTINCT ON (f.trdr) f.trdr, ${catName} AS cat
           FROM ${s}.f_sales_lines f JOIN ${s}.items i ON i.mtrl = f.mtrl
           WHERE f.trndate >= now() - interval '12 months' AND f.sign = 1
           GROUP BY f.trdr, 2 ORDER BY f.trdr, SUM(f.net) DESC
         ), cb AS (
           SELECT DISTINCT f.trdr, ${brandName} AS brand FROM ${s}.f_sales_lines f JOIN ${s}.items i ON i.mtrl = f.mtrl
           WHERE f.trndate >= now() - interval '12 months' AND f.sign = 1 AND f.net > 0
         )
         SELECT cat.cat, cb.brand, COUNT(*)::float AS buyers, (SELECT COUNT(*) FROM cat c2 WHERE c2.cat = cat.cat)::float AS total
         FROM cat JOIN cb ON cb.trdr = cat.trdr GROUP BY 1, 2`,
      )
    ).rows;
    const peerOf = new Map<string, { brand: string; share: number }[]>();
    for (const r of peers) {
      if (n(r.total) < 5 || r.brand === "Χωρίς μάρκα") continue;
      const arr = peerOf.get(String(r.cat)) ?? [];
      arr.push({ brand: String(r.brand), share: n(r.buyers) / n(r.total) });
      peerOf.set(String(r.cat), arr);
    }
    for (const arr of peerOf.values()) arr.sort((a, b) => b.share - a.share);

    const customers: WinbackCustomer[] = scored.map(({ c, gap, rec, p }) => {
      const rows = byCust.get(Number(c.trdr)) ?? [];
      const catTotals = new Map<string, number>();
      for (const r of rows) catTotals.set(String(r.cat), (catTotals.get(String(r.cat)) ?? 0) + n(r.total));
      const topCategory = [...catTotals].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const bought = new Set(rows.filter((r) => n(r.total) > 0).map((r) => String(r.brand)));
      const stoppedBrands = rows
        .filter((r) => n(r.before) >= 200 && n(r.recent) <= 0 && r.brand !== "Χωρίς μάρκα")
        .map((r) => ({ brand: String(r.brand), before: round(n(r.before)) }))
        .sort((a, b) => b.before - a.before)
        .slice(0, 5);
      const peerBrands = (topCategory ? (peerOf.get(topCategory) ?? []) : [])
        .filter((x) => !bought.has(x.brand) && x.share >= 0.15)
        .slice(0, 4)
        .map((x) => ({ brand: x.brand, share: round(x.share * 100) }));
      const yearly = Math.max(n(c.r12), n(c.rp));
      return {
        trdr: Number(c.trdr),
        code: (c.code as string) ?? null,
        name: String(c.name ?? ""),
        revenuePrev: round(n(c.rp)),
        revenue12: round(n(c.r12)),
        recency: Math.round(rec),
        usualGap: gap === null ? null : Math.round(gap),
        probability: round(p * 100),
        valueAtRisk: round(yearly * p),
        stage: p >= 0.8 ? "Χαμένος" : p >= 0.55 ? "Χάνεται" : "Σε κίνδυνο",
        stoppedBrands,
        peerBrands,
        topCategory,
      };
    });
    const stages = (["Σε κίνδυνο", "Χάνεται", "Χαμένος"] as const).map((stage) => {
      const g = customers.filter((c) => c.stage === stage);
      return { stage, customers: g.length, value: round(g.reduce((a, c) => a + c.valueAtRisk, 0)) };
    });
    const sb = new Map<string, { customers: number; value: number }>();
    for (const c of customers)
      for (const b of c.stoppedBrands) {
        const x = sb.get(b.brand) ?? { customers: 0, value: 0 };
        x.customers++;
        x.value += b.before;
        sb.set(b.brand, x);
      }
    return {
      customers,
      valueAtRisk: round(customers.reduce((a, c) => a + c.valueAtRisk, 0)),
      stages,
      stoppedBrands: [...sb].map(([brand, x]) => ({ brand, customers: x.customers, value: round(x.value) })).sort((a, b) => b.value - a.value).slice(0, 15),
    };
  });
}

export function winback(tenantId: string) {
  return memo(`winback:${tenantId}`, MEMO_TTL, () => compute(tenantId));
}
