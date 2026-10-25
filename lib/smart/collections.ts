import "server-only";
import { memo, MEMO_TTL } from "@/lib/memo";
import { schemaName } from "@/lib/warehouse";
import { withWarehouse } from "@/lib/warehouse-writer";
import { clamp, kmeans, median, qi, round, standardise } from "@/lib/smart/mining";

// Βοηθός εισπράξεων — from the partner ledger (TRDBALSHEET → m_partner_balances / m_open_items,
// payments matched FIFO) and the sales history:
// - predicted payment date of every open invoice = invoice date + the customer's own payment days
//   (falls back to the company median), adjusted for customers paying later than they used to;
// - risk 0–100: overdue share, how late vs. their habit, balance growth, payment score, recency;
//   customers grouped by k-means into payment behaviours;
// - suggested credit limit = monthly invoicing × payment cycle × factor of the risk band;
// - today's call list: the overdue amount × risk, with the reason.

export type CollectionCustomer = {
  trdr: number;
  code: string | null;
  name: string;
  balance: number;
  overdue: number;
  overdue90: number;
  oldestDays: number | null;
  payDays: number | null;
  grade: string | null;
  invoiced12m: number;
  lastPayment: string | null;
  daysSincePayment: number | null;
  risk: number;
  riskBand: "Χαμηλός" | "Μέτριος" | "Υψηλός" | "Πολύ υψηλός";
  behaviour: string;
  creditLimit: number;
  overLimit: number;
  priority: number;
  reason: string;
  nextPayment: string | null;
};
export type Collections = {
  receivables: number;
  overdue: number;
  overdue90: number;
  expected30: number;
  expected90: number;
  weeks: { week: string; expected: number; late: number }[];
  bands: { band: string; customers: number; balance: number }[];
  behaviours: { name: string; customers: number; balance: number; payDays: number }[];
  customers: CollectionCustomer[];
  callList: CollectionCustomer[];
  medianPayDays: number;
};

const DAY = 86_400_000;
const n = (v: unknown) => Number(v ?? 0) || 0;
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function compute(tenantId: string): Promise<Collections> {
  const s = qi(schemaName(tenantId));
  return withWarehouse(async (db) => {
    const now = Date.now();
    const bal = (
      await db.query(
        `SELECT b.trdr, c.code, c.name, b.balance::float, (b.open_31_60 + b.open_61_90 + b.open_90_plus)::float AS overdue, b.open_90_plus::float AS o90,
                b.oldest_open, b.avg_payment_days::float AS pay_days, b.payment_grade AS grade, b.invoiced_12m::float AS inv12, b.last_payment,
                b.payment_score::float AS score, cs.recency_days::float AS recency
         FROM ${s}.m_partner_balances b LEFT JOIN ${s}.customers c ON c.trdr = b.trdr LEFT JOIN ${s}.m_customer_stats cs ON cs.trdr = b.trdr
         WHERE b.kind = 'R' AND b.balance > 1`,
      )
    ).rows;
    // Balance 3 months ago, from the monthly ledger (growth of exposure).
    const before = new Map(
      (
        await db.query(
          `SELECT trdr, SUM(COALESCE(ldebit, 0) - COALESCE(lcredit, 0))::float AS bal FROM ${s}.partner_ledger
           WHERE trdr IN (SELECT trdr FROM ${s}.customers)
             AND (period BETWEEN 1 AND 12 OR (period = 0 AND fiscprd = (SELECT MIN(fiscprd) FROM ${s}.partner_ledger)))
             AND make_date(fiscprd::int, GREATEST(LEAST(period, 12), 1)::int, 1) < date_trunc('month', now()) - interval '2 months'
           GROUP BY 1`,
        ).catch(() => ({ rows: [] as Record<string, unknown>[] }))
      ).rows.map((r) => [Number(r.trdr), n(r.bal)]),
    );
    const open = (await db.query(`SELECT trdr, doc_date, amount::float FROM ${s}.m_open_items WHERE kind = 'R' AND amount > 0`)).rows;
    const medianPayDays = median(bal.map((b) => n(b.pay_days)).filter((d) => d > 0)) || 60;

    // Features for k-means: payment days, overdue share, balance vs monthly invoicing, growth.
    const feats = bal.map((b) => {
      const balance = n(b.balance);
      const growth = before.has(Number(b.trdr)) ? clamp((balance - (before.get(Number(b.trdr)) ?? 0)) / Math.max(1000, Math.abs(before.get(Number(b.trdr)) ?? 0)), -1, 3) : 0;
      return [n(b.pay_days) || medianPayDays, balance ? n(b.overdue) / balance : 0, n(b.inv12) ? balance / (n(b.inv12) / 12) : 6, growth];
    });
    const { labels } = kmeans(standardise(feats).z, Math.min(4, Math.max(1, bal.length)));
    const groupDays = new Map<number, number[]>();
    labels.forEach((l, i) => groupDays.set(l, [...(groupDays.get(l) ?? []), feats[i][0]]));
    const order = [...groupDays].map(([l, d]) => [l, median(d)] as const).sort((a, b) => a[1] - b[1]);
    const NAMES = ["Συνεπείς", "Κανονικοί", "Αργοπορούν", "Χρόνιοι οφειλέτες"];
    const behaviourOf = new Map(order.map(([l], i) => [l, NAMES[Math.min(NAMES.length - 1, Math.round((i * (NAMES.length - 1)) / Math.max(1, order.length - 1)))]]));

    const customers: CollectionCustomer[] = bal.map((b, i) => {
      const trdr = Number(b.trdr);
      const balance = n(b.balance);
      const overdue = n(b.overdue);
      const payDays = n(b.pay_days) || null;
      const oldest = b.oldest_open ? Math.round((now - new Date(b.oldest_open as string).getTime()) / DAY) : null;
      const last = b.last_payment ? new Date(b.last_payment as string) : null;
      const since = last ? Math.round((now - last.getTime()) / DAY) : null;
      const growth = feats[i][3];
      // Risk: overdue share, delay beyond their own habit, growing exposure, no recent payment, ERP score.
      const lateness = oldest !== null ? clamp((oldest - (payDays ?? medianPayDays)) / 90, 0, 1) : 0;
      const risk = round(
        clamp(
          35 * (balance ? n(b.o90) / balance : 0) +
            15 * (balance ? overdue / balance : 0) +
            20 * lateness +
            10 * clamp(growth, 0, 1) +
            10 * (since === null ? 1 : clamp((since - 45) / 120, 0, 1)) +
            10 * (b.score === null ? 0.5 : 1 - clamp(n(b.score) / 100, 0, 1)),
          0,
          100,
        ),
      );
      const riskBand = risk >= 60 ? "Πολύ υψηλός" : risk >= 40 ? "Υψηλός" : risk >= 20 ? "Μέτριος" : "Χαμηλός";
      const factor = { Χαμηλός: 1.5, Μέτριος: 1.2, Υψηλός: 0.8, "Πολύ υψηλός": 0.4 }[riskBand];
      const monthly = n(b.inv12) / 12;
      const creditLimit = Math.round((monthly * ((payDays ?? medianPayDays) / 30) * factor) / 100) * 100;
      const reasons = [
        n(b.o90) > 0 && `${Math.round(n(b.o90)).toLocaleString("el-GR")} € πάνω από 90 ημέρες`,
        oldest !== null && payDays && oldest > payDays + 30 && `η παλαιότερη οφειλή είναι ${oldest} ημερών ενώ συνήθως πληρώνει σε ${Math.round(payDays)}`,
        since !== null && since > 60 && `καμία πληρωμή εδώ και ${since} ημέρες`,
        growth > 0.3 && `το υπόλοιπο αυξήθηκε ${Math.round(growth * 100)}% σε 3 μήνες`,
        creditLimit > 0 && balance > creditLimit * 1.2 && `υπόλοιπο πάνω από το προτεινόμενο όριο`,
      ].filter(Boolean) as string[];
      return {
        trdr,
        code: (b.code as string) ?? null,
        name: String(b.name ?? trdr),
        balance: round(balance),
        overdue: round(overdue),
        overdue90: round(n(b.o90)),
        oldestDays: oldest,
        payDays: payDays === null ? null : round(payDays),
        grade: (b.grade as string) ?? null,
        invoiced12m: round(n(b.inv12)),
        lastPayment: last ? iso(last) : null,
        daysSincePayment: since,
        risk,
        riskBand,
        behaviour: behaviourOf.get(labels[i]) ?? "",
        creditLimit,
        overLimit: creditLimit > 0 ? round(Math.max(0, balance - creditLimit)) : 0,
        priority: round(overdue * (0.5 + risk / 100)),
        reason: reasons.join(" · ") || "εντός συνηθισμένων ορίων",
        nextPayment: null,
      };
    });

    // Expected collections: each open invoice at invoice date + the customer's payment days;
    // invoices already past that date are expected over the next 4 weeks ("late").
    const payDaysOf = new Map(customers.map((c) => [c.trdr, c.payDays ?? medianPayDays]));
    const weeks = Array.from({ length: 13 }, (_, w) => ({ week: iso(new Date(now + w * 7 * DAY)), expected: 0, late: 0 }));
    const next = new Map<number, number>();
    let e30 = 0;
    let e90 = 0;
    for (const o of open) {
      const trdr = Number(o.trdr);
      if (!payDaysOf.has(trdr)) continue;
      const due = new Date(o.doc_date as string).getTime() + (payDaysOf.get(trdr) ?? medianPayDays) * DAY;
      const amt = n(o.amount);
      if (due < now) {
        for (let w = 0; w < 4; w++) weeks[w].late += amt / 4;
        e30 += amt * 0.75;
        e90 += amt;
      } else {
        const w = Math.floor((due - now) / (7 * DAY));
        if (w < 13) weeks[w].expected += amt;
        if (due - now <= 30 * DAY) e30 += amt;
        if (due - now <= 90 * DAY) e90 += amt;
        if (!next.has(trdr) || due < next.get(trdr)!) next.set(trdr, due);
      }
    }
    for (const c of customers) if (next.has(c.trdr)) c.nextPayment = iso(new Date(next.get(c.trdr)!));

    customers.sort((a, b) => b.priority - a.priority);
    const bands = (["Πολύ υψηλός", "Υψηλός", "Μέτριος", "Χαμηλός"] as const).map((band) => {
      const g = customers.filter((c) => c.riskBand === band);
      return { band, customers: g.length, balance: round(g.reduce((a, c) => a + c.balance, 0)) };
    });
    const behaviours = [...new Set(customers.map((c) => c.behaviour))].map((name) => {
      const g = customers.filter((c) => c.behaviour === name);
      return { name, customers: g.length, balance: round(g.reduce((a, c) => a + c.balance, 0)), payDays: round(median(g.map((c) => c.payDays ?? medianPayDays))) };
    });
    return {
      receivables: round(customers.reduce((a, c) => a + c.balance, 0)),
      overdue: round(customers.reduce((a, c) => a + c.overdue, 0)),
      overdue90: round(customers.reduce((a, c) => a + c.overdue90, 0)),
      expected30: round(e30),
      expected90: round(e90),
      weeks: weeks.map((w) => ({ ...w, expected: round(w.expected), late: round(w.late) })),
      bands,
      behaviours: behaviours.sort((a, b) => a.payDays - b.payDays),
      customers: customers.slice(0, 1000),
      callList: customers.filter((c) => c.overdue > 0 && c.risk >= 20).slice(0, 25),
      medianPayDays: round(medianPayDays),
    };
  });
}

export function collections(tenantId: string) {
  return memo(`collections:${tenantId}`, MEMO_TTL, () => compute(tenantId));
}
