import "server-only";
import { getBiSettings } from "@/lib/bi-marts";
import { prisma } from "@/lib/prisma";
import { s1GetData, s1SetData } from "@/lib/softone";
import { schemaName } from "@/lib/warehouse";
import { withWarehouse } from "@/lib/warehouse-writer";

// Purchase orders from the order suggestions (m_item_stats): grouped per main supplier, edited by
// the user, then written to the tenant's SoftOne as a PURDOC (item + quantity only — SoftOne prices
// the lines with its own rules).

export type OrderSupplier = { trdr: number | null; code: string | null; name: string; items: number };
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
};

const RISING = 20; // % — demand of the last 90 days this much above the 12-month average
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
    reasons.push(x.stock < 0 ? "Αρνητικό απόθεμα — ελέγξτε και τις καταχωρήσεις" : "Εξαντλημένο, με πωλήσεις το τελευταίο τρίμηνο");
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
  const s = qi(schemaName(tenantId));
  return withWarehouse(async (db) => {
    const r = await db.query(
      `SELECT m.main_supplier AS trdr, sp.code, sp.name, COUNT(*)::int AS items
       FROM ${s}.m_item_stats m LEFT JOIN ${s}.suppliers sp ON sp.trdr = m.main_supplier
       WHERE m.suggested_order_qty > 0
       GROUP BY m.main_supplier, sp.code, sp.name
       ORDER BY (m.main_supplier IS NULL), COUNT(*) DESC`,
    );
    return r.rows.map((x) => ({ trdr: n(x.trdr), code: x.code ?? null, name: x.name ?? "Χωρίς κύριο προμηθευτή", items: Number(x.items) }));
  });
}

export async function supplierOrderLines(tenantId: string, trdr: number): Promise<OrderLine[]> {
  const s = qi(schemaName(tenantId));
  return withWarehouse(async (db) => {
    const r = await db.query(
      `SELECT m.mtrl, i.code, i.name, m.abc, m.stock_qty, m.days_of_cover, m.lead_days, m.qty_12m, m.qty_prev_12m, m.qty_90d,
              m.suggested_order_qty
       FROM ${s}.m_item_stats m LEFT JOIN ${s}.items i ON i.mtrl = m.mtrl
       WHERE m.main_supplier = $1 AND m.suggested_order_qty > 0`,
      [trdr],
    );
    const mtrls = r.rows.map((x) => Number(x.mtrl));
    // Monthly sales of these items, last 12 calendar months (current month included).
    const months = await db.query(
      `SELECT mtrl, (EXTRACT(YEAR FROM age(date_trunc('month', now()), date_trunc('month', trndate))) * 12
                     + EXTRACT(MONTH FROM age(date_trunc('month', now()), date_trunc('month', trndate))))::int AS ago,
              SUM(qty)::float AS qty
       FROM ${s}.f_sales_lines
       WHERE mtrl = ANY($1::bigint[]) AND trndate >= date_trunc('month', now()) - interval '11 months'
       GROUP BY 1, 2`,
      [mtrls],
    );
    const monthly = new Map<number, number[]>();
    for (const m of months.rows) {
      const arr = monthly.get(Number(m.mtrl)) ?? Array(12).fill(0);
      const i = 11 - Number(m.ago);
      if (i >= 0 && i < 12) arr[i] = Math.round(Number(m.qty) * 100) / 100;
      monthly.set(Number(m.mtrl), arr);
    }
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
          ...base,
          ...assess(base),
        };
      })
      .sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] || (a.coverNow ?? 1e9) - (b.coverNow ?? 1e9));
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
