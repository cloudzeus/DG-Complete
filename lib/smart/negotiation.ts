import "server-only";
import { memo, MEMO_TTL } from "@/lib/memo";
import { schemaName } from "@/lib/warehouse";
import { withWarehouse } from "@/lib/warehouse-writer";
import { linreg, median, qi, round } from "@/lib/smart/mining";

// Διαπραγμάτευση προμηθευτών — for every supplier with purchases in the last 12 months:
// - price index of the same items (chained month-to-month on items bought in both months, value-
//   weighted) over 24 months and its yearly trend (log-linear regression) vs. all suppliers;
// - delivery: median / p90 lead days and their spread; how much we depend on them (share of our
//   purchases and of our sales revenue from their items); payment terms (days we pay them in);
// - negotiating levers: volume growth, our share of their sales is unknown, so the levers are
//   ours: spend, growth, alternatives (other suppliers selling the same brands), price drift.

export type SupplierBrief = {
  trdr: number;
  code: string | null;
  name: string;
  spend12: number;
  spendPrev: number;
  growthPct: number | null;
  sharePct: number;
  salesDependencyPct: number;
  items: number;
  priceTrendPct: number | null;
  priceIndex: { month: string; index: number }[];
  leadMedian: number | null;
  leadP90: number | null;
  orders: number;
  payDays: number | null;
  balance: number;
  alternatives: number;
  topRises: { name: string; before: number; now: number; changePct: number; qty: number }[];
  levers: string[];
  score: number;
};
export type Negotiation = { suppliers: SupplierBrief[]; marketTrendPct: number | null; spend12: number };

const n = (v: unknown) => Number(v ?? 0) || 0;

async function compute(tenantId: string): Promise<Negotiation> {
  const s = qi(schemaName(tenantId));
  return withWarehouse(async (db) => {
    const sup = (
      await db.query(
        `SELECT st.trdr, sp.code, sp.name, st.spend_12m::float AS spend, st.spend_prev_12m::float AS prev, st.spend_share_pct::float AS share,
                st.items_12m::float AS items, st.lead_days_median::float AS lmed, st.lead_days_p90::float AS lp90, st.orders_received::float AS orders,
                b.avg_payment_days::float AS pay, b.balance::float AS bal
         FROM ${s}.m_supplier_stats st LEFT JOIN ${s}.suppliers sp ON sp.trdr = st.trdr
         LEFT JOIN ${s}.m_partner_balances b ON b.trdr = st.trdr AND b.kind = 'P'
         WHERE st.spend_12m > 0 ORDER BY st.spend_12m DESC LIMIT 60`,
      )
    ).rows;
    const ids = sup.map((x) => Number(x.trdr));
    // Monthly unit prices per supplier × item (24 months).
    const px = (
      await db.query(
        `SELECT trdr, mtrl, to_char(date_trunc('month', trndate), 'YYYY-MM') AS m, SUM(net)::float AS v, SUM(qty)::float AS q
         FROM ${s}.f_purchase_lines WHERE trdr = ANY($1::bigint[]) AND sign = 1 AND qty > 0 AND net > 0 AND trndate >= date_trunc('month', now()) - interval '24 months'
         GROUP BY 1, 2, 3`,
        [ids],
      )
    ).rows;
    const months = [...new Set(px.map((r) => String(r.m)))].sort();
    type Cell = { p: number; v: number };
    const grid = new Map<number, Map<number, Map<string, Cell>>>(); // supplier → item → month → price
    for (const r of px) {
      const t = Number(r.trdr);
      const i = Number(r.mtrl);
      const g = grid.get(t) ?? new Map();
      const im = g.get(i) ?? new Map();
      im.set(String(r.m), { p: n(r.v) / n(r.q), v: n(r.v) });
      g.set(i, im);
      grid.set(t, g);
    }
    // Chained index: each month vs the previous month with data, on items bought in both.
    const chain = (items: Map<number, Map<string, Cell>>) => {
      const out: { month: string; index: number }[] = [];
      let idx = 100;
      let prev: string | null = null;
      for (const m of months) {
        if (prev) {
          let num = 0;
          let w = 0;
          for (const im of items.values()) {
            const a = im.get(prev);
            const b = im.get(m);
            if (a && b && a.p > 0) {
              const r = b.p / a.p;
              if (r > 0.5 && r < 2) {
                num += Math.log(r) * b.v;
                w += b.v;
              }
            }
          }
          if (w > 0) idx *= Math.exp(num / w);
          else continue;
        }
        out.push({ month: m, index: round(idx, 1) });
        prev = m;
      }
      return out;
    };
    const trendOf = (ix: { month: string; index: number }[]) => {
      if (ix.length < 6) return null;
      const r = linreg(ix.map((_, i) => i), ix.map((x) => Math.log(x.index)));
      return round((Math.exp(r.b * 12) - 1) * 100, 1);
    };
    const all = new Map<number, Map<string, Cell>>();
    let k = 0;
    for (const g of grid.values()) for (const im of g.values()) all.set(k++, im);
    const marketTrendPct = trendOf(chain(all));

    // Sales dependency: revenue of the items whose main supplier is this one.
    const dep = new Map(
      (await db.query(`SELECT main_supplier AS trdr, SUM(revenue_12m)::float AS rev FROM ${s}.m_item_stats WHERE main_supplier IS NOT NULL GROUP BY 1`)).rows.map((r) => [Number(r.trdr), n(r.rev)]),
    );
    const totalRev = (await db.query(`SELECT SUM(revenue_12m)::float AS r FROM ${s}.m_item_stats`)).rows[0]?.r ?? 0;
    // Alternatives: other suppliers we bought the same brands from (24 months).
    const alt = new Map(
      (
        await db.query(
          `WITH sb AS (SELECT DISTINCT p.trdr, i.mtrmark FROM ${s}.f_purchase_lines p JOIN ${s}.items i ON i.mtrl = p.mtrl WHERE p.trndate >= now() - interval '24 months' AND i.mtrmark IS NOT NULL)
           SELECT a.trdr, COUNT(DISTINCT b.trdr)::float AS alts FROM sb a JOIN sb b ON b.mtrmark = a.mtrmark AND b.trdr <> a.trdr WHERE a.trdr = ANY($1::bigint[]) GROUP BY 1`,
          [ids],
        )
      ).rows.map((r) => [Number(r.trdr), n(r.alts)]),
    );
    const names = new Map((await db.query(`SELECT mtrl, name FROM ${s}.items WHERE mtrl IN (SELECT DISTINCT mtrl FROM ${s}.f_purchase_lines WHERE trdr = ANY($1::bigint[]))`, [ids])).rows.map((r) => [Number(r.mtrl), String(r.name ?? "")]));
    const medPay = median(sup.map((x) => n(x.pay)).filter((v) => v > 0));

    const suppliers: SupplierBrief[] = sup.map((x) => {
      const t = Number(x.trdr);
      const items = grid.get(t) ?? new Map();
      const ix = chain(items);
      const trend = trendOf(ix);
      // Biggest increases: last price of the last 6 months vs the average of 7–18 months ago.
      const cut6 = months[Math.max(0, months.length - 6)];
      const cut18 = months[Math.max(0, months.length - 18)];
      const rises: SupplierBrief["topRises"] = [];
      for (const [mtrl, im] of items) {
        const before = [...im].filter(([m]) => m < cut6 && m >= cut18);
        const after = [...im].filter(([m]) => m >= cut6);
        if (!before.length || !after.length) continue;
        const pb = before.reduce((a, [, c]) => a + c.v, 0) / before.reduce((a, [, c]) => a + c.v / c.p, 0);
        const pn = after.reduce((a, [, c]) => a + c.v, 0) / after.reduce((a, [, c]) => a + c.v / c.p, 0);
        const ch = pn / pb - 1;
        const qty = after.reduce((a, [, c]) => a + c.v / c.p, 0);
        if (ch > 0.02 && ch < 1) rises.push({ name: names.get(mtrl) ?? String(mtrl), before: round(pb, 2), now: round(pn, 2), changePct: round(ch * 100, 1), qty: round(qty) });
      }
      rises.sort((a, b) => (b.now - b.before) * b.qty - (a.now - a.before) * a.qty);
      const growth = n(x.prev) > 0 ? round((n(x.spend) / n(x.prev) - 1) * 100, 1) : null;
      const levers = [
        growth !== null && growth > 10 && `Αυξήσατε τις αγορές ${growth}% σε έναν χρόνο — ζητήστε επιπλέον έκπτωση όγκου.`,
        n(x.spend) > 0 && `Αγορές 12 μηνών ${Math.round(n(x.spend)).toLocaleString("el-GR")} € (${round(n(x.share), 1)}% των αγορών σας).`,
        trend !== null && marketTrendPct !== null && trend > marketTrendPct + 2 && `Οι τιμές του κινούνται ${trend > 0 ? "+" : ""}${trend}% τον χρόνο, ενώ του συνόλου των προμηθευτών σας ${marketTrendPct > 0 ? "+" : ""}${marketTrendPct}% — ακριβαίνει ταχύτερα από την αγορά.`,
        rises.length > 0 && `${rises.length} είδη ακρίβυναν πάνω από 2% τους τελευταίους 6 μήνες (π.χ. ${rises[0].name}: +${rises[0].changePct}%).`,
        n(x.lp90) > 0 && n(x.lmed) > 0 && n(x.lp90) > n(x.lmed) * 2 && `Ασταθείς παραδόσεις: συνήθως ${Math.round(n(x.lmed))} ημέρες, αλλά 1 στις 10 πάνω από ${Math.round(n(x.lp90))}.`,
        (alt.get(t) ?? 0) > 0 && `Υπάρχουν ${alt.get(t)} άλλοι προμηθευτές για τις ίδιες μάρκες — εναλλακτική στη διαπραγμάτευση.`,
        n(x.pay) > 0 && medPay > 0 && n(x.pay) < medPay - 10 && `Τον πληρώνετε σε ${Math.round(n(x.pay))} ημέρες, ταχύτερα από τους άλλους (${Math.round(medPay)}) — ζητήστε έκπτωση τοις μετρητοίς ή μεγαλύτερη πίστωση.`,
      ].filter(Boolean) as string[];
      // Negotiation potential 0–100: spend, price drift above market, alternatives, unstable delivery, growth.
      const score = Math.round(
        Math.min(30, (n(x.share) / 10) * 30) +
          (trend !== null && marketTrendPct !== null ? Math.max(0, Math.min(25, (trend - marketTrendPct) * 3)) : 0) +
          Math.min(20, (alt.get(t) ?? 0) * 5) +
          (n(x.lp90) > n(x.lmed) * 2 ? 10 : 0) +
          (growth !== null && growth > 10 ? 15 : 0),
      );
      return {
        trdr: t,
        code: (x.code as string) ?? null,
        name: String(x.name ?? t),
        spend12: round(n(x.spend)),
        spendPrev: round(n(x.prev)),
        growthPct: growth,
        sharePct: round(n(x.share), 1),
        salesDependencyPct: totalRev ? round(((dep.get(t) ?? 0) / Number(totalRev)) * 100, 1) : 0,
        items: n(x.items),
        priceTrendPct: trend,
        priceIndex: ix,
        leadMedian: x.lmed === null ? null : round(n(x.lmed)),
        leadP90: x.lp90 === null ? null : round(n(x.lp90)),
        orders: n(x.orders),
        payDays: x.pay === null ? null : round(n(x.pay)),
        balance: round(n(x.bal)),
        alternatives: alt.get(t) ?? 0,
        topRises: rises.slice(0, 10),
        levers,
        score,
      };
    });
    return { suppliers, marketTrendPct, spend12: round(sup.reduce((a, x) => a + n(x.spend), 0)) };
  });
}

export function negotiation(tenantId: string) {
  return memo(`negotiation:${tenantId}`, MEMO_TTL, () => compute(tenantId));
}
