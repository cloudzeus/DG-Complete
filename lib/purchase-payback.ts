import "server-only";
import { memo, MEMO_TTL } from "@/lib/memo";
import { schemaName } from "@/lib/warehouse";
import { withWarehouse } from "@/lib/warehouse-writer";

// Payback of purchases: for each purchase invoice, how long the sales of the very units bought took
// to bring its cost back. FIFO per item — the stock that was there before the purchase sells first
// (stock before = stock now − purchases since + sales since; other stock moves are ignored), then the
// units of this purchase; each sale counts at its own net price. Not yet paid back: the share that
// came back and an estimate at the pace of the last 90 days.

const qi = (v: string) => `"${v.replace(/"/g, '""')}"`;
const DAY = 86_400_000;

export type PaybackDoc = {
  findoc: number;
  code: string | null;
  date: string;
  supplier: string;
  supplierId: number | null;
  cost: number;
  /** Sales of these units so far (net). */
  recovered: number;
  recoveredPct: number;
  /** Days from the purchase to the day sales covered its cost. */
  paybackDays: number | null;
  /** Not paid back yet: days still needed at the recent pace (null: no recent sales). */
  estimateDays: number | null;
  soldPct: number;
  /** Gross profit of the units sold so far. */
  margin: number;
  /** Cost of the units still unsold — cash tied up in this purchase. */
  tiedCost: number;
  ageDays: number;
};

export type PaybackSupplier = {
  supplierId: number | null;
  supplier: string;
  docs: number;
  cost: number;
  recoveredPct: number;
  paidDocs: number;
  medianDays: number | null;
  /** Purchases older than 90 days: cost of what is still unsold, and its share. */
  idleCost: number;
  idlePct: number | null;
};

export type PaybackItem = {
  mtrl: number;
  code: string | null;
  name: string;
  supplier: string | null;
  cost: number;
  recoveredPct: number;
  lots: number;
  paidLots: number;
  /** Purchases older than 90 days not paid back yet. */
  openOldLots: number;
  medianDays: number | null;
  tiedCost: number;
};

async function computePurchasePayback(tenantId: string, opts: { months?: number; minCost?: number } = {}) {
  const s = qi(schemaName(tenantId));
  const since = new Date(Date.now() - (opts.months ?? 18) * 30 * DAY);
  const minCost = opts.minCost ?? 200;
  return withWarehouse(async (db) => {
    // Goods only: fixed assets, services and expenses bought on purchase documents are not sold on.
    const goods = (await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'items' AND column_name = 'sodtype'", [schemaName(tenantId)])).rowCount;
    const lines = await db.query(
      `SELECT f.findoc, f.trdr, f.trndate, f.mtrl, SUM(f.qty)::float AS qty, SUM(f.net)::float AS net
       FROM ${s}.f_purchase_lines f ${goods ? `JOIN ${s}.items i ON i.mtrl = f.mtrl AND COALESCE(i.sodtype, 51) = 51` : ""}
       WHERE f.trndate >= $1 AND f.qty > 0 AND f.net > 0
       GROUP BY f.findoc, f.trdr, f.trndate, f.mtrl`,
      [since],
    );
    if (!lines.rows.length)
      return {
        docs: [] as PaybackDoc[],
        suppliers: [] as PaybackSupplier[],
        cashDrags: [] as PaybackDoc[],
        fastest: [] as PaybackItem[],
        slowest: [] as PaybackItem[],
        brandMonths: { months: [] as string[], brands: [] as { name: string; values: (number | null)[] }[] },
      };
    const items = [...new Set(lines.rows.map((x) => Number(x.mtrl)))];
    const [stock, purchases, sales, names] = [
      await db.query(`SELECT mtrl, stock_qty::float AS q FROM ${s}.m_item_stats WHERE mtrl = ANY($1::bigint[])`, [items]),
      await db.query(`SELECT mtrl, trndate, SUM(qty)::float AS q FROM ${s}.f_purchase_lines WHERE mtrl = ANY($1::bigint[]) AND trndate >= $2 GROUP BY 1, 2`, [items, since]),
      await db.query(
        `SELECT mtrl, trndate, SUM(qty)::float AS q, SUM(net)::float AS net FROM ${s}.f_sales_lines WHERE mtrl = ANY($1::bigint[]) AND trndate >= $2 GROUP BY 1, 2 ORDER BY 1, 2`,
        [items, since],
      ),
      await db.query(
        `SELECT d.findoc, d.fincode, sp.name FROM ${s}.purchase_docs d LEFT JOIN ${s}.suppliers sp ON sp.trdr = d.trdr WHERE d.findoc = ANY($1::bigint[])`,
        [[...new Set(lines.rows.map((x) => Number(x.findoc)))]],
      ),
    ];
    const stockNow = new Map(stock.rows.map((x) => [Number(x.mtrl), Number(x.q)]));
    const buys = new Map<number, { t: number; q: number }[]>();
    for (const x of purchases.rows) buys.set(Number(x.mtrl), [...(buys.get(Number(x.mtrl)) ?? []), { t: new Date(x.trndate).getTime(), q: Number(x.q) }]);
    const sold = new Map<number, { t: number; q: number; net: number }[]>();
    for (const x of sales.rows) sold.set(Number(x.mtrl), [...(sold.get(Number(x.mtrl)) ?? []), { t: new Date(x.trndate).getTime(), q: Number(x.q), net: Number(x.net) }]);
    const hasBrands = !!(await db.query("SELECT to_regclass($1) AS t", [`${s}.brands`])).rows[0]?.t;
    const brandRows = await db.query(
      `SELECT i.mtrl, ${hasBrands ? "b.name" : "NULL"} AS brand
       FROM ${s}.items i ${hasBrands ? `LEFT JOIN ${s}.brands b ON b.mtrmark = i.mtrmark` : ""}
       WHERE i.mtrl = ANY($1::bigint[])`,
      [items],
    );
    const brandOf = new Map(brandRows.rows.map((x) => [Number(x.mtrl), (x.brand as string | null) ?? null]));
    const docName = new Map(names.rows.map((x) => [Number(x.findoc), { code: x.fincode as string | null, supplier: (x.name as string | null) ?? null }]));

    // Group lines into documents.
    type Lot = { mtrl: number; qty: number; cost: number };
    const docs = new Map<number, { trdr: number | null; t: number; lots: Lot[] }>();
    for (const x of lines.rows) {
      const id = Number(x.findoc);
      const d = docs.get(id) ?? { trdr: x.trdr === null ? null : Number(x.trdr), t: new Date(x.trndate).getTime(), lots: [] };
      d.lots.push({ mtrl: Number(x.mtrl), qty: Number(x.qty), cost: Number(x.net) });
      docs.set(id, d);
    }

    const now = Date.now();
    const out: PaybackDoc[] = [];
    const itemStats = new Map<number, { cost: number; rev: number; tied: number; paid: number[]; lots: number; open: number }>();
    const lotRecords: { brand: string; month: string; cost: number; days: number }[] = [];
    for (const [findoc, d] of docs) {
      const cost = d.lots.reduce((a, l) => a + l.cost, 0);
      if (cost < minCost) continue;
      const events: { t: number; rev: number; units: number; unitCost: number }[] = [];
      let units = 0;
      for (const lot of d.lots) {
        units += lot.qty;
        const salesOf = sold.get(lot.mtrl) ?? [];
        const boughtSince = (buys.get(lot.mtrl) ?? []).filter((b) => b.t >= d.t).reduce((a, b) => a + b.q, 0);
        const soldSince = salesOf.filter((x) => x.t >= d.t).reduce((a, x) => a + x.q, 0);
        const before = Math.max(0, (stockNow.get(lot.mtrl) ?? 0) - boughtSince + soldSince);
        let cum = 0;
        let lotRev = 0;
        let lotPaid: number | null = null;
        let lotSold = 0;
        for (const sale of salesOf) {
          if (sale.t < d.t || sale.q <= 0) continue;
          const from = cum;
          cum += sale.q;
          const overlap = Math.max(0, Math.min(cum, before + lot.qty) - Math.max(from, before));
          if (overlap > 0) {
            const rev = (sale.net * overlap) / sale.q;
            events.push({ t: sale.t, rev, units: overlap, unitCost: lot.cost / lot.qty });
            lotRev += rev;
            lotSold += overlap;
            if (lotPaid === null && lotRev >= lot.cost) lotPaid = sale.t;
          }
          if (cum >= before + lot.qty) break;
        }
        // Lots older than 30 days: days to pay back (unpaid: their age so far, a lower bound).
        if (now - d.t >= 30 * DAY) {
          const brand = brandOf.get(lot.mtrl);
          if (brand) lotRecords.push({ brand, month: new Date(d.t).toISOString().slice(0, 7), cost: lot.cost, days: lotPaid !== null ? Math.round((lotPaid - d.t) / DAY) : Math.round((now - d.t) / DAY) });
        }
        const st = itemStats.get(lot.mtrl) ?? { cost: 0, rev: 0, tied: 0, paid: [] as number[], lots: 0, open: 0 };
        st.cost += lot.cost;
        st.rev += lotRev;
        st.lots++;
        if (lotPaid !== null) st.paid.push(Math.round((lotPaid - d.t) / DAY));
        else if (now - d.t >= 90 * DAY) st.open++;
        st.tied += Math.max(0, lot.cost - (lot.cost / lot.qty) * lotSold);
        itemStats.set(lot.mtrl, st);
      }
      events.sort((a, b) => a.t - b.t);
      let rev = 0;
      let paidAt: number | null = null;
      let soldUnits = 0;
      let soldCost = 0;
      for (const e of events) {
        rev += e.rev;
        soldUnits += e.units;
        soldCost += e.units * e.unitCost;
        if (paidAt === null && rev >= cost) paidAt = e.t;
      }
      const recent = events.filter((e) => e.t >= now - 90 * DAY).reduce((a, e) => a + e.rev, 0);
      const name = docName.get(findoc);
      out.push({
        findoc,
        code: name?.code ?? null,
        date: new Date(d.t).toISOString().slice(0, 10),
        supplier: name?.supplier ?? `Προμηθευτής ${d.trdr ?? "—"}`,
        supplierId: d.trdr,
        cost,
        recovered: rev,
        recoveredPct: cost > 0 ? (100 * rev) / cost : 0,
        paybackDays: paidAt === null ? null : Math.max(0, Math.round((paidAt - d.t) / DAY)),
        estimateDays: paidAt === null && recent > 0 ? Math.round((cost - rev) / (recent / 90)) : null,
        soldPct: units > 0 ? (100 * soldUnits) / units : 0,
        margin: rev - soldCost,
        tiedCost: Math.max(0, cost - soldCost),
        ageDays: Math.round((now - d.t) / DAY),
      });
    }
    out.sort((a, b) => b.date.localeCompare(a.date) || b.cost - a.cost);

    // Per supplier: how fast their purchases come back (documents older than 30 days).
    const bySup = new Map<string, PaybackDoc[]>();
    for (const p of out) bySup.set(`${p.supplierId}`, [...(bySup.get(`${p.supplierId}`) ?? []), p]);
    const suppliers: PaybackSupplier[] = [...bySup.values()]
      .map((list) => {
        const mature = list.filter((p) => now - new Date(p.date).getTime() >= 30 * DAY);
        const paid = mature.filter((p) => p.paybackDays !== null).map((p) => p.paybackDays!).sort((a, b) => a - b);
        const cost = list.reduce((a, p) => a + p.cost, 0);
        const old = list.filter((p) => p.ageDays >= 90);
        const oldCost = old.reduce((a, p) => a + p.cost, 0);
        const idleCost = old.reduce((a, p) => a + p.tiedCost, 0);
        return {
          supplierId: list[0].supplierId,
          supplier: list[0].supplier,
          docs: list.length,
          cost,
          recoveredPct: cost > 0 ? (100 * list.reduce((a, p) => a + p.recovered, 0)) / cost : 0,
          paidDocs: paid.length,
          medianDays: paid.length ? paid[Math.floor(paid.length / 2)] : null,
          idleCost,
          idlePct: oldCost > 0 ? (100 * idleCost) / oldCost : null,
        };
      })
      .sort((a, b) => b.cost - a.cost);
    // Purchases that weighed on cash: older than 90 days, ranked by the cash still tied up.
    const cashDrags = out
      .filter((p) => p.ageDays >= 90 && p.tiedCost >= 100 && p.recoveredPct < 100)
      .sort((a, b) => b.tiedCost - a.tiedCost)
      .slice(0, 15);
    // Items: median payback over their purchases — fastest and slowest (enough money involved).
    const itemNames = await db.query(
      `SELECT i.mtrl, i.code, i.name, sp.name AS supplier FROM ${s}.items i LEFT JOIN ${s}.m_item_stats m ON m.mtrl = i.mtrl
       LEFT JOIN ${s}.suppliers sp ON sp.trdr = m.main_supplier WHERE i.mtrl = ANY($1::bigint[])`,
      [[...itemStats.keys()]],
    );
    const info = new Map(itemNames.rows.map((x) => [Number(x.mtrl), { code: x.code as string | null, name: (x.name as string | null) ?? `Είδος ${x.mtrl}`, supplier: x.supplier as string | null }]));
    const itemRows: PaybackItem[] = [...itemStats].map(([mtrl, st]) => {
      const paid = [...st.paid].sort((a, b) => a - b);
      return {
        mtrl,
        code: info.get(mtrl)?.code ?? null,
        name: info.get(mtrl)?.name ?? `Είδος ${mtrl}`,
        supplier: info.get(mtrl)?.supplier ?? null,
        cost: st.cost,
        recoveredPct: st.cost > 0 ? (100 * st.rev) / st.cost : 0,
        lots: st.lots,
        paidLots: paid.length,
        openOldLots: st.open,
        medianDays: paid.length ? paid[Math.floor(paid.length / 2)] : null,
        tiedCost: st.tied,
      };
    });
    const fastest = itemRows
      // Stock items (bought at least 3 times) — one-off purchases for a customer order pay back on day 0.
      .filter((x) => x.medianDays !== null && x.cost >= 300 && x.lots >= 3 && x.paidLots >= Math.ceil(x.lots / 2))
      .sort((a, b) => a.medianDays! - b.medianDays! || b.cost - a.cost)
      .slice(0, 15);
    const slowest = itemRows
      .filter((x) => x.cost >= 300 && x.tiedCost >= 100 && x.recoveredPct < 100 && (x.openOldLots > 0 || (x.medianDays ?? 0) >= 180))
      .sort((a, b) => b.tiedCost - a.tiedCost)
      .slice(0, 15);
    // Brand × month of purchase: cost-weighted median days to pay back, the 6 biggest brands.
    const brandCost = new Map<string, number>();
    for (const r of lotRecords) brandCost.set(r.brand, (brandCost.get(r.brand) ?? 0) + r.cost);
    const topBrands = [...brandCost].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([b]) => b);
    const monthsSeen = [...new Set(lotRecords.map((r) => r.month))].sort();
    const weightedMedian = (list: { days: number; cost: number }[]) => {
      const sorted = [...list].sort((a, b) => a.days - b.days);
      const half = sorted.reduce((a, x) => a + x.cost, 0) / 2;
      let acc = 0;
      for (const x of sorted) {
        acc += x.cost;
        if (acc >= half) return x.days;
      }
      return null;
    };
    const brandMonths = {
      months: monthsSeen,
      brands: topBrands.map((b) => ({
        name: b,
        values: monthsSeen.map((m) => {
          const list = lotRecords.filter((r) => r.brand === b && r.month === m);
          return list.length ? weightedMedian(list) : null;
        }),
      })),
    };
    return { docs: out, suppliers, cashDrags, fastest, slowest, brandMonths };
  });
}

/** Cached for 15 minutes per tenant and options. */
export function purchasePayback(tenantId: string, opts: { months?: number; minCost?: number } = {}) {
  return memo(`payback:${tenantId}:${opts.months ?? 18}:${opts.minCost ?? 200}`, MEMO_TTL, () => computePurchasePayback(tenantId, opts));
}
