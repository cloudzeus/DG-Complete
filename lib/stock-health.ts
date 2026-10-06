import "server-only";
import { memo, MEMO_TTL } from "@/lib/memo";
import type { Client } from "pg";
import { purchasePayback } from "@/lib/purchase-payback";
import { schemaName } from "@/lib/warehouse";
import { withWarehouse } from "@/lib/warehouse-writer";

// Απόθεμα & προμηθευτές 360°:
// - lost sales: the daily stock of the A/B items over the last 180 days is rebuilt from today's
//   stock and the purchases / sales since (other moves ignored); days out of stock × the item's
//   pace on the days it was in stock = sales most likely lost (an estimate);
// - dead stock: what to do with each item (return to supplier, offer, liquidate) and the cash it frees;
// - supplier scorecard: delivery speed and reliability, price stability, payback of purchases,
//   idle stock, return on stock — one 0–100 score.

const qi = (v: string) => `"${v.replace(/"/g, '""')}"`;
const DAY = 86_400_000;
const WINDOW = 180;
const has = async (db: Client, s: string, t: string) => !!(await db.query("SELECT to_regclass($1) AS t", [`${s}.${t}`])).rows[0]?.t;

export type LostItem = { code: string | null; name: string; supplier: string | null; outDays: number; lostQty: number; lostRevenue: number; lostMargin: number; stock: number };
export type DeadItem = { code: string | null; name: string; supplier: string | null; value: number; daysSinceSale: number | null; action: "return" | "offer" | "liquidate"; reason: string; freed: number };
export type SupplierScore = {
  name: string;
  spend: number;
  score: number;
  dims: { delivery: number; reliability: number; price: number; payback: number; idle: number; roi: number };
  facts: { leadMedian: number | null; leadP90: number | null; priceChange: number | null; paybackDays: number | null; idlePct: number | null; gmroi: number | null };
};

export type StockHealth = {
  lost: { revenue: number; margin: number; serviceLevel: number | null; itemsOut: number; incomplete: number; checked: number; reliable: boolean; coveragePct: number; items: LostItem[]; bySupplier: { name: string; value: number }[]; weekly: { week: string; out: number }[] };
  dead: { value: number; freed: number; byAction: { action: DeadItem["action"]; value: number; freed: number; items: number }[]; items: DeadItem[] };
  suppliers: SupplierScore[];
};

const RECOVERY = { return: 0.9, offer: 0.7, liquidate: 0.35 } as const;

async function computeStockHealth(tenantId: string): Promise<StockHealth> {
  const s = qi(schemaName(tenantId));
  const payback = await purchasePayback(tenantId).catch(() => null);
  return withWarehouse(async (db) => {
    const since = new Date(Date.now() - WINDOW * DAY);
    const goods = (await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'items' AND column_name = 'sodtype'", [schemaName(tenantId)])).rowCount;
    const sup = (await has(db, s, "suppliers")) ? `LEFT JOIN ${s}.suppliers sp ON sp.trdr = m.main_supplier` : "";
    const supName = sup ? "sp.name" : "NULL";

    // Stock data must cover most items that sell (some installations import only some warehouses).
    const cov = (await db.query(`SELECT COUNT(*) FILTER (WHERE stock_qty > 0)::float AS instock, COUNT(*) FILTER (WHERE qty_12m > 0)::float AS selling FROM ${s}.m_item_stats`)).rows[0];
    const coverage = Number(cov.selling) > 0 ? Number(cov.instock) / Number(cov.selling) : 0;
    const reliable = coverage >= 0.3;

    // ── Lost sales on the A/B items that sell.
    const items = await db.query(
      `SELECT m.mtrl, i.code, i.name, ${supName} AS supplier, m.stock_qty::float AS stock, m.qty_12m::float AS q12,
              m.revenue_12m::float AS rev, COALESCE(m.margin_12m, 0)::float AS margin
       FROM ${s}.m_item_stats m JOIN ${s}.items i ON i.mtrl = m.mtrl ${sup}
       WHERE m.qty_12m > 0 AND m.revenue_12m > 0 AND m.abc IN ('A', 'B') ${goods ? "AND COALESCE(i.sodtype, 51) = 51" : ""}
       ORDER BY m.revenue_12m DESC LIMIT ${reliable ? 2500 : 0}`,
    );
    const ids = items.rows.map((x) => Number(x.mtrl));
    const flows = new Map<number, Map<number, number>>(); // item → day index → stock change (+ bought, − sold)
    const soldPerDay = new Map<number, Map<number, number>>();
    const dayIdx = (d: Date) => Math.floor((d.getTime() - since.getTime()) / DAY);
    for (const [sql, sign] of [
      [`SELECT mtrl, trndate::date AS d, SUM(qty)::float AS q FROM ${s}.f_purchase_lines WHERE mtrl = ANY($1::bigint[]) AND trndate >= $2 GROUP BY 1, 2`, 1],
      [`SELECT mtrl, trndate::date AS d, SUM(qty)::float AS q FROM ${s}.f_sales_lines WHERE mtrl = ANY($1::bigint[]) AND trndate >= $2 GROUP BY 1, 2`, -1],
    ] as const) {
      for (const x of (await db.query(sql, [ids, since])).rows) {
        const id = Number(x.mtrl);
        const di = dayIdx(new Date(x.d));
        const m = flows.get(id) ?? new Map<number, number>();
        m.set(di, (m.get(di) ?? 0) + sign * Number(x.q));
        flows.set(id, m);
        if (sign < 0) {
          const sm = soldPerDay.get(id) ?? new Map<number, number>();
          sm.set(di, (sm.get(di) ?? 0) + Number(x.q));
          soldPerDay.set(id, sm);
        }
      }
    }
    const lostItems: LostItem[] = [];
    const weeklyOut = Array(Math.ceil(WINDOW / 7)).fill(0) as number[];
    let weightedService = 0;
    let incomplete = 0;
    let weightTotal = 0;
    for (const x of items.rows) {
      const id = Number(x.mtrl);
      const f = flows.get(id) ?? new Map<number, number>();
      // End-of-day stock, walking back from today.
      let stock = Number(x.stock);
      let outDays = 0;
      let inDays = 0;
      let soldInStock = 0;
      let minStock = stock;
      const itemWeeks: number[] = [];
      let soldTotal = 0;
      for (let d = WINDOW; d >= 0; d--) {
        minStock = Math.min(minStock, stock);
        soldTotal += soldPerDay.get(id)?.get(d) ?? 0;
        // stock now is the end of today (d = WINDOW); before applying day d's moves backwards
        // Out of stock and nothing sold that day (a sale the same day = bought to order, not lost).
        const isOut = stock <= 0 && !(soldPerDay.get(id)?.get(d) ?? 0);
        if (isOut) {
          outDays++;
          itemWeeks.push(Math.min(weeklyOut.length - 1, Math.floor(d / 7)));
        } else {
          inDays++;
          soldInStock += soldPerDay.get(id)?.get(d) ?? 0;
        }
        stock -= f.get(d) ?? 0; // undo the day's moves → stock at the end of the previous day
      }
      const days = WINDOW + 1;
      // Rebuilt stock far below zero = moves we don't see (other warehouses, transfers): no estimate.
      if (minStock < -Math.max(2, 0.1 * soldTotal)) {
        incomplete++;
        continue;
      }
      const pace = inDays > 0 ? soldInStock / inDays : Number(x.q12) / 365;
      const rate = Math.max(pace, Number(x.q12) / 365 * 0.5);
      for (const w of itemWeeks) weeklyOut[w]++;
      const service = 1 - outDays / days;
      weightedService += service * Number(x.rev);
      weightTotal += Number(x.rev);
      // Items out of stock nearly all the time are sold to order — not lost sales.
      if (outDays < 3 || outDays / days > 0.8) continue;
      const unitPrice = Number(x.rev) / Number(x.q12);
      const unitMargin = Math.max(0, Number(x.margin) / Number(x.q12)); // wrong costs can make it negative
      const lostQty = outDays * rate;
      lostItems.push({
        code: x.code ?? null,
        name: x.name ?? `Είδος ${id}`,
        supplier: x.supplier ?? null,
        outDays,
        lostQty,
        lostRevenue: lostQty * unitPrice,
        lostMargin: lostQty * unitMargin,
        stock: Number(x.stock),
      });
    }
    lostItems.sort((a, b) => b.lostRevenue - a.lostRevenue);
    const bySup = new Map<string, number>();
    for (const l of lostItems) bySup.set(l.supplier ?? "Χωρίς προμηθευτή", (bySup.get(l.supplier ?? "Χωρίς προμηθευτή") ?? 0) + l.lostRevenue);
    const weekly = weeklyOut.map((v, i) => ({ week: new Date(since.getTime() + i * 7 * DAY).toLocaleDateString("el-GR", { day: "numeric", month: "numeric" }), out: Math.round(v / 7) }));

    // ── Dead stock: an action per item.
    const deadQ = await db.query(
      `SELECT m.mtrl, i.code, i.name, ${supName} AS supplier, GREATEST(m.stock_value, 0)::float AS value, m.days_since_sale::int AS dss,
              (SELECT MAX(trndate) FROM ${s}.f_purchase_lines p WHERE p.mtrl = m.mtrl) AS last_buy, m.qty_prev_12m::float AS prev
       FROM ${s}.m_item_stats m JOIN ${s}.items i ON i.mtrl = m.mtrl ${sup}
       WHERE m.dead_stock AND m.stock_value > 0
       ORDER BY m.stock_value DESC LIMIT 2000`,
    );
    const deadItems: DeadItem[] = deadQ.rows.map((x) => {
      const lastBuy = x.last_buy ? new Date(x.last_buy) : null;
      const recentBuy = lastBuy && Date.now() - lastBuy.getTime() < 365 * DAY;
      const dss = x.dss === null ? null : Number(x.dss);
      let action: DeadItem["action"];
      let reason: string;
      if (recentBuy && x.supplier) {
        action = "return";
        reason = `Αγοράστηκε ${lastBuy!.toLocaleDateString("el-GR")} από ${x.supplier} και δεν κινείται — ζητήστε επιστροφή ή ανταλλαγή.`;
      } else if (dss !== null && dss < 730 && Number(x.prev) > 0) {
        action = "offer";
        reason = `Πουλούσε μέχρι πριν ${dss} ημέρες — προσφορά κοντά στο κόστος ή πακέτο με είδη που κινούνται.`;
      } else {
        action = "liquidate";
        reason = dss === null ? "Δεν έχει πουληθεί ποτέ — ρευστοποίηση, δωρεά ή διαγραφή στην απογραφή." : `Χωρίς πώληση ${dss} ημέρες — ρευστοποίηση ή διαγραφή στην απογραφή.`;
      }
      const value = Number(x.value);
      return { code: x.code ?? null, name: x.name ?? `Είδος ${x.mtrl}`, supplier: x.supplier ?? null, value, daysSinceSale: dss, action, reason, freed: value * RECOVERY[action] };
    });
    const byAction = (["return", "offer", "liquidate"] as const).map((a) => {
      const list = deadItems.filter((d) => d.action === a);
      return { action: a, value: list.reduce((x, d) => x + d.value, 0), freed: list.reduce((x, d) => x + d.freed, 0), items: list.length };
    });

    // ── Supplier scorecard.
    const suppliers: SupplierScore[] = [];
    if (await has(db, s, "m_lead_times")) {
      const sq = await db.query(
        `WITH spend AS (
           SELECT trdr, SUM(net)::float AS spend FROM ${s}.f_purchase_lines WHERE trndate >= now() - interval '12 months' GROUP BY trdr HAVING SUM(net) > 0
         ), lead AS (
           SELECT trdr, percentile_cont(0.5) WITHIN GROUP (ORDER BY lead_days)::float AS med, percentile_cont(0.9) WITHIN GROUP (ORDER BY lead_days)::float AS p90, COUNT(*) AS n
           FROM ${s}.m_lead_times WHERE ordered >= now() - interval '24 months' GROUP BY trdr
         ), roi AS (
           SELECT main_supplier AS trdr, SUM(COALESCE(margin_12m, 0))::float AS margin, SUM(GREATEST(stock_value, 0))::float AS stock FROM ${s}.m_item_stats GROUP BY 1
         ), price AS (
           SELECT c.trdr, SUM(c.net) / NULLIF(SUM(c.qty * p.price), 0) - 1 AS chg
           FROM (SELECT trdr, mtrl, SUM(net) AS net, SUM(qty) AS qty FROM ${s}.f_purchase_lines WHERE trndate >= now() - interval '12 months' AND qty > 0 AND net > 0 GROUP BY 1, 2) c
           JOIN (SELECT mtrl, SUM(net) / NULLIF(SUM(qty), 0) AS price FROM ${s}.f_purchase_lines WHERE trndate >= now() - interval '24 months' AND trndate < now() - interval '12 months' AND qty > 0 AND net > 0 GROUP BY 1) p
             ON p.mtrl = c.mtrl AND p.price > 0
           GROUP BY c.trdr
         )
         SELECT sp.trdr, ${sup ? "x.name" : "NULL"} AS name, sp.spend, l.med, l.p90, l.n, r.margin, r.stock, pr.chg::float AS chg
         FROM spend sp LEFT JOIN lead l ON l.trdr = sp.trdr LEFT JOIN roi r ON r.trdr = sp.trdr LEFT JOIN price pr ON pr.trdr = sp.trdr
         ${sup ? `LEFT JOIN ${s}.suppliers x ON x.trdr = sp.trdr` : ""}
         ORDER BY sp.spend DESC LIMIT 15`,
      );
      const pbBy = new Map((payback?.suppliers ?? []).map((p) => [p.supplierId, p]));
      const clamp = (v: number) => Math.max(0, Math.min(100, v));
      for (const x of sq.rows) {
        const pb = pbBy.get(Number(x.trdr));
        const med = x.med === null ? null : Number(x.med);
        const p90 = x.p90 === null ? null : Number(x.p90);
        const chg = x.chg === null ? null : Number(x.chg) * 100;
        const gmroi = Number(x.stock) > 0 ? Number(x.margin) / Number(x.stock) : null;
        const dims = {
          delivery: med === null ? 50 : clamp(100 - (med / 30) * 100 + 20),
          reliability: med === null || p90 === null ? 50 : clamp(100 - ((p90 - med) / Math.max(7, med)) * 50),
          price: chg === null ? 50 : clamp(70 - chg * 6),
          payback: pb?.medianDays == null ? 50 : clamp(100 - (pb.medianDays / 365) * 100),
          idle: pb?.idlePct == null ? 50 : clamp(100 - pb.idlePct),
          roi: gmroi === null ? 50 : clamp(gmroi * 50),
        };
        const score = Math.round(dims.delivery * 0.2 + dims.reliability * 0.15 + dims.price * 0.2 + dims.payback * 0.2 + dims.idle * 0.15 + dims.roi * 0.1);
        suppliers.push({
          name: x.name ?? `Προμηθευτής ${x.trdr}`,
          spend: Number(x.spend),
          score,
          dims: Object.fromEntries(Object.entries(dims).map(([k, v]) => [k, Math.round(v)])) as SupplierScore["dims"],
          facts: { leadMedian: med === null ? null : Math.round(med), leadP90: p90 === null ? null : Math.round(p90), priceChange: chg, paybackDays: pb?.medianDays ?? null, idlePct: pb?.idlePct ?? null, gmroi },
        });
      }
    }

    return {
      lost: {
        revenue: lostItems.reduce((a, l) => a + l.lostRevenue, 0),
        margin: lostItems.reduce((a, l) => a + l.lostMargin, 0),
        serviceLevel: weightTotal > 0 ? (100 * weightedService) / weightTotal : null,
        itemsOut: items.rows.filter((x) => Number(x.stock) <= 0).length,
        incomplete,
        checked: items.rows.length,
        reliable,
        coveragePct: Math.round(coverage * 100),
        items: lostItems.slice(0, 20),
        bySupplier: [...bySup].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value })),
        weekly,
      },
      dead: { value: deadItems.reduce((a, d) => a + d.value, 0), freed: deadItems.reduce((a, d) => a + d.freed, 0), byAction, items: deadItems.slice(0, 25) },
      suppliers,
    };
  });
}

/** Cached for 15 minutes per tenant. */
export function stockHealth(tenantId: string): Promise<StockHealth> {
  return memo(`stock-health:${tenantId}`, MEMO_TTL, () => computeStockHealth(tenantId));
}
