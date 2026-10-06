import "server-only";
import { memo, MEMO_TTL } from "@/lib/memo";
import type { Client } from "pg";
import { getAssumptions, type Assumptions } from "@/lib/assumptions";
import { schemaName } from "@/lib/warehouse";
import { withWarehouse } from "@/lib/warehouse-writer";

// Ανάλυση πελατών: cohorts & retention, customer lifetime value, true profitability per customer
// (cost to serve), credit risk that is getting worse, cross-sell rules (what is bought together and
// who doesn't buy it yet) and what peers of the same industry buy.

const qi = (v: string) => `"${v.replace(/"/g, '""')}"`;
const eur = (v: number) => `${Math.round(v).toLocaleString("el-GR")} €`;
const has = async (db: Client, s: string, t: string) => !!(await db.query("SELECT to_regclass($1) AS t", [`${s}.${t}`])).rows[0]?.t;


export type Cohorts = { quarters: string[]; rows: { cohort: string; size: number; values: (number | null)[] }[]; flow: { quarter: string; active: number; new: number; lost: number }[] };
export type ClvRow = { name: string; customers: number; annualMargin: number; lifetimeYears: number; clv: number };
export type CustomerPl = { name: string; revenue: number; margin: number; documents: number; serveCost: number; net: number; netPct: number | null; balance: number; payDays: number | null };
export type CreditRow = { name: string; balance: number; balance3m: number; growthPct: number | null; overdue90: number; payDays: number | null; grade: string | null; invoiced3m: number };
export type Rule = { from: string; to: string; both: number; confidence: number; lift: number; missing: number; potential: number; examples: string[] };
export type PeerGap = { segment: string; category: string; penetration: number; missing: number; potential: number; examples: string[] };

export type CustomerInsights = {
  cohorts: Cohorts;
  churnRate: number | null;
  clv: ClvRow[];
  pl: { best: CustomerPl[]; worst: CustomerPl[]; bubbles: { name: string; x: number; y: number; size: number }[]; lossMakers: number; lossMakersRevenue: number };
  credit: CreditRow[];
  rules: Rule[];
  peers: PeerGap[];
  findings: { level: "risk" | "warning" | "opportunity" | "info"; title: string; detail: string }[];
  assumptions: Assumptions;
};

const quarterOf = (d: Date) => `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
const qIndex = (q: string) => Number(q.slice(0, 4)) * 4 + Number(q.slice(6)) - 1;

async function computeCustomerInsights(tenantId: string): Promise<CustomerInsights> {
  const s = qi(schemaName(tenantId));
  const SERVE = await getAssumptions(tenantId);
  return withWarehouse(async (db) => {
    // ── Activity per customer and quarter (positive sales).
    const act = await db.query(
      `SELECT trdr, date_trunc('quarter', trndate)::date AS q, SUM(net)::float AS rev
       FROM ${s}.f_sales_lines WHERE trdr IS NOT NULL GROUP BY 1, 2 HAVING SUM(net) > 0`,
    );
    const byCustomer = new Map<number, Map<string, number>>();
    let minQ = Infinity;
    for (const x of act.rows) {
      const q = quarterOf(new Date(x.q));
      minQ = Math.min(minQ, qIndex(q));
      const m = byCustomer.get(Number(x.trdr)) ?? new Map<string, number>();
      m.set(q, Number(x.rev));
      byCustomer.set(Number(x.trdr), m);
    }
    const nowQ = qIndex(quarterOf(new Date()));
    const qName = (i: number) => `${Math.floor(i / 4)}-Q${(i % 4) + 1}`;
    const quarters = Number.isFinite(minQ) ? Array.from({ length: nowQ - minQ + 1 }, (_, i) => qName(minQ + i)) : [];
    // Cohorts from the 2nd quarter of the history (the first one holds every existing customer).
    const firstQ = new Map<number, number>();
    for (const [c, m] of byCustomer) firstQ.set(c, Math.min(...[...m.keys()].map(qIndex)));
    const cohortRows: Cohorts["rows"] = [];
    for (let ci = minQ + 1; ci <= nowQ; ci++) {
      const members = [...firstQ].filter(([, f]) => f === ci).map(([c]) => c);
      if (!members.length) continue;
      const values = Array.from({ length: nowQ - minQ }, (_, k) => {
        const qi2 = ci + k;
        // The current quarter is not over yet: not a retention figure.
        if (qi2 >= nowQ && k > 0) return null;
        const active = members.filter((c) => byCustomer.get(c)!.has(qName(qi2))).length;
        return Math.round((100 * active) / members.length);
      });
      cohortRows.push({ cohort: qName(ci), size: members.length, values });
    }
    const flow = quarters.map((q, i) => {
      const qi2 = qIndex(q);
      let active = 0;
      let fresh = 0;
      let lost = 0;
      for (const [c, m] of byCustomer) {
        const isActive = m.has(q);
        if (isActive) active++;
        if (isActive && firstQ.get(c) === qi2 && i > 0) fresh++;
        if (i > 0 && !isActive && m.has(quarters[i - 1])) lost++;
      }
      return { quarter: q, active, new: fresh, lost };
    });

    // ── Yearly churn (active in the 12 months before last year, not in the last 12) → lifetime.
    const yr = await db.query(
      `SELECT trdr,
              SUM(net) FILTER (WHERE trndate >= now() - interval '12 months')::float AS cur,
              SUM(net) FILTER (WHERE trndate >= now() - interval '24 months' AND trndate < now() - interval '12 months')::float AS prev,
              SUM(net - COALESCE(cost, 0)) FILTER (WHERE trndate >= now() - interval '12 months')::float AS margin
       FROM ${s}.f_sales_lines WHERE trdr IS NOT NULL AND trndate >= now() - interval '24 months' GROUP BY 1`,
    );
    const prevActive = yr.rows.filter((x) => Number(x.prev) > 0);
    const kept = prevActive.filter((x) => Number(x.cur) > 0).length;
    const churnRate = prevActive.length ? 1 - kept / prevActive.length : null;
    const lifetime = churnRate && churnRate > 0 ? Math.min(10, 1 / churnRate) : 10;
    const marginOf = new Map(yr.rows.map((x) => [Number(x.trdr), Number(x.margin ?? 0)]));

    // CLV per RFM segment (m_customer_stats) — else one overall row.
    const clv: ClvRow[] = [];
    if (await has(db, s, "m_customer_stats")) {
      const seg = await db.query(`SELECT trdr, segment FROM ${s}.m_customer_stats WHERE segment IS NOT NULL`);
      const groups = new Map<string, number[]>();
      for (const x of seg.rows) {
        const m = marginOf.get(Number(x.trdr));
        if (m === undefined || m <= 0) continue;
        groups.set(x.segment, [...(groups.get(x.segment) ?? []), m]);
      }
      for (const [name, list] of groups) {
        const annual = list.reduce((a, v) => a + v, 0) / list.length;
        clv.push({ name, customers: list.length, annualMargin: annual, lifetimeYears: lifetime, clv: annual * lifetime });
      }
      clv.sort((a, b) => b.clv - a.clv);
    }

    // ── Customer P&L (12 months): margin − documents × cost − financing of the balance − returns handling.
    const balances = (await has(db, s, "m_partner_balances"))
      ? new Map(
          (await db.query(`SELECT trdr, balance::float AS b, avg_payment_days::float AS d, payment_grade AS g, open_90_plus::float AS o FROM ${s}.m_partner_balances WHERE kind = 'R'`)).rows.map((x) => [
            Number(x.trdr),
            { balance: Number(x.b ?? 0), days: x.d === null ? null : Number(x.d), grade: (x.g as string | null) ?? null, overdue90: Number(x.o ?? 0) },
          ]),
        )
      : new Map<number, { balance: number; days: number | null; grade: string | null; overdue90: number }>();
    const plQ = await db.query(
      `SELECT f.trdr, MAX(c.name) AS name, SUM(f.net)::float AS rev, SUM(f.net - COALESCE(f.cost, 0))::float AS margin,
              COUNT(DISTINCT f.findoc)::int AS docs, SUM(CASE WHEN f.net < 0 THEN -f.net ELSE 0 END)::float AS returns
       FROM ${s}.f_sales_lines f LEFT JOIN ${s}.customers c ON c.trdr = f.trdr
       WHERE f.trdr IS NOT NULL AND f.trndate >= now() - interval '12 months'
       GROUP BY f.trdr HAVING SUM(f.net) > 0`,
    );
    const pl: CustomerPl[] = plQ.rows.map((x) => {
      const b = balances.get(Number(x.trdr));
      const serveCost = Number(x.docs) * SERVE.perDocument + Math.max(0, b?.balance ?? 0) * SERVE.financingRate + Number(x.returns) * SERVE.returnsHandling;
      const net = Number(x.margin) - serveCost;
      return {
        name: x.name ?? `Πελάτης ${x.trdr}`,
        revenue: Number(x.rev),
        margin: Number(x.margin),
        documents: Number(x.docs),
        serveCost,
        net,
        netPct: Number(x.rev) > 0 ? (100 * net) / Number(x.rev) : null,
        balance: b?.balance ?? 0,
        payDays: b?.days ?? null,
      };
    });
    const best = [...pl].sort((a, b) => b.net - a.net).slice(0, 12);
    const worst = [...pl].filter((p) => p.net < 0).sort((a, b) => a.net - b.net).slice(0, 12);
    const lossMakers = pl.filter((p) => p.net < 0);
    const bubbles = [...pl]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 60)
      .filter((p) => p.netPct !== null)
      .map((p) => ({ name: p.name, x: Math.round(p.revenue), y: Math.round(p.netPct! * 10) / 10, size: Math.max(1, Math.abs(p.net)) }));

    // ── Credit trend: balance now vs 3 months ago (partner ledger), with invoicing of the last 3 months.
    const credit: CreditRow[] = [];
    if ((await has(db, s, "partner_ledger")) && (await has(db, s, "customers"))) {
      const r = await db.query(
        `WITH l AS (
           SELECT p.trdr, CASE WHEN p.period = 0 THEN make_date(p.fiscprd::int, 1, 1) ELSE make_date(p.fiscprd::int, LEAST(p.period, 12)::int, 15) END AS d,
                  COALESCE(p.ldebit, 0) AS dr, COALESCE(p.lcredit, 0) AS cr, p.period
           FROM ${s}.partner_ledger p JOIN ${s}.customers c ON c.trdr = p.trdr
           WHERE p.period BETWEEN 1 AND 12 OR (p.period = 0 AND p.fiscprd = (SELECT MIN(fiscprd) FROM ${s}.partner_ledger))
         )
         SELECT l.trdr, MAX(c.name) AS name,
                SUM(dr - cr) FILTER (WHERE d <= now() - interval '90 days')::float AS b3,
                SUM(dr) FILTER (WHERE d > now() - interval '90 days' AND period > 0)::float AS inv3
         FROM l JOIN ${s}.customers c ON c.trdr = l.trdr GROUP BY l.trdr`,
      );
      for (const x of r.rows) {
        const b = balances.get(Number(x.trdr));
        const now = b?.balance ?? 0;
        const b3 = Number(x.b3 ?? 0);
        const growth = b3 > 100 ? ((now - b3) / b3) * 100 : null;
        const worse = (now - b3 >= 2000 && (growth === null || growth >= 30)) || ((b?.overdue90 ?? 0) >= 1000 && (b?.grade === "Γ" || b?.grade === "Δ"));
        if (!worse) continue;
        credit.push({ name: x.name ?? "—", balance: now, balance3m: b3, growthPct: growth, overdue90: b?.overdue90 ?? 0, payDays: b?.days ?? null, grade: b?.grade ?? null, invoiced3m: Number(x.inv3 ?? 0) });
      }
      credit.sort((a, b) => b.overdue90 + (b.balance - b.balance3m) - (a.overdue90 + (a.balance - a.balance3m)));
      credit.splice(15);
    }

    // ── Cross-sell rules between categories (customers of the last 12 months).
    const rules: Rule[] = [];
    if (await has(db, s, "item_categories")) {
      const cc = await db.query(
        `SELECT f.trdr, MAX(cu.name) AS cname, c.name AS cat, SUM(f.net)::float AS rev
         FROM ${s}.f_sales_lines f JOIN ${s}.items i ON i.mtrl = f.mtrl JOIN ${s}.item_categories c ON c.mtrcategory = i.mtrcategory
         LEFT JOIN ${s}.customers cu ON cu.trdr = f.trdr
         WHERE f.trdr IS NOT NULL AND f.trndate >= now() - interval '12 months'
         GROUP BY f.trdr, c.name HAVING SUM(f.net) > 0`,
      );
      const cats = new Map<string, Map<number, number>>(); // category → customer → revenue
      const custName = new Map<number, string>();
      const custRev = new Map<number, number>();
      for (const x of cc.rows) {
        const m = cats.get(x.cat) ?? new Map<number, number>();
        m.set(Number(x.trdr), Number(x.rev));
        cats.set(x.cat, m);
        custName.set(Number(x.trdr), x.cname ?? `Πελάτης ${x.trdr}`);
        custRev.set(Number(x.trdr), (custRev.get(Number(x.trdr)) ?? 0) + Number(x.rev));
      }
      const N = custName.size;
      const minBoth = N >= 1000 ? 15 : N >= 200 ? 8 : 4;
      const list = [...cats].filter(([, m]) => m.size >= minBoth);
      for (const [a, ma] of list) {
        for (const [b, mb] of list) {
          if (a === b) continue;
          let both = 0;
          let bRevBoth = 0;
          for (const c of ma.keys()) if (mb.has(c)) {
            both++;
            bRevBoth += mb.get(c)!;
          }
          if (both < minBoth) continue;
          const conf = both / ma.size;
          const lift = conf / (mb.size / N);
          if (lift < 1.4 || conf < 0.15) continue;
          const missingIds = [...ma.keys()].filter((c) => !mb.has(c)).sort((x, y) => (custRev.get(y) ?? 0) - (custRev.get(x) ?? 0));
          rules.push({
            from: a,
            to: b,
            both,
            confidence: conf,
            lift,
            missing: missingIds.length,
            potential: missingIds.length * conf * (bRevBoth / both) * 0.5,
            examples: missingIds.slice(0, 5).map((c) => custName.get(c)!),
          });
        }
      }
      rules.sort((x, y) => y.potential - x.potential);
      // Keep one direction per pair.
      const seen = new Set<string>();
      const out: Rule[] = [];
      for (const r of rules) {
        const k = [r.from, r.to].sort().join("|");
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(r);
      }
      rules.length = 0;
      rules.push(...out.slice(0, 12));
    }

    // ── Peers: in each industry segment, categories most of the segment buys — who doesn't.
    const peers: PeerGap[] = [];
    if ((await has(db, s, "customer_segment")) && (await has(db, s, "item_categories"))) {
      const r = await db.query(
        `SELECT cs.segment_name AS seg, f.trdr, MAX(cu.name) AS cname, c.name AS cat, SUM(f.net)::float AS rev
         FROM ${s}.f_sales_lines f JOIN ${s}.customer_segment cs ON cs.trdr = f.trdr
         JOIN ${s}.items i ON i.mtrl = f.mtrl JOIN ${s}.item_categories c ON c.mtrcategory = i.mtrcategory
         LEFT JOIN ${s}.customers cu ON cu.trdr = f.trdr
         WHERE f.trndate >= now() - interval '12 months' AND cs.segment_key NOT IN ('retail', 'foreign', 'unknown', 'other')
         GROUP BY 1, 2, 4 HAVING SUM(f.net) > 0`,
      );
      const segs = new Map<string, { customers: Map<number, string>; cats: Map<string, Map<number, number>> }>();
      for (const x of r.rows) {
        const e = segs.get(x.seg) ?? { customers: new Map(), cats: new Map() };
        e.customers.set(Number(x.trdr), x.cname ?? `Πελάτης ${x.trdr}`);
        const m = e.cats.get(x.cat) ?? new Map<number, number>();
        m.set(Number(x.trdr), Number(x.rev));
        e.cats.set(x.cat, m);
        segs.set(x.seg, e);
      }
      for (const [seg, e] of segs) {
        if (e.customers.size < 8) continue;
        for (const [cat, buyers] of e.cats) {
          const pen = buyers.size / e.customers.size;
          if (pen < 0.4) continue;
          const missing = [...e.customers.keys()].filter((c) => !buyers.has(c));
          if (!missing.length) continue;
          const avg = [...buyers.values()].reduce((a, v) => a + v, 0) / buyers.size;
          peers.push({ segment: seg, category: cat, penetration: pen, missing: missing.length, potential: missing.length * avg * 0.3, examples: missing.slice(0, 4).map((c) => e.customers.get(c)!) });
        }
      }
      peers.sort((a, b) => b.potential - a.potential);
      peers.splice(12);
    }

    // ── Findings.
    const findings: CustomerInsights["findings"] = [];
    if (churnRate !== null)
      findings.push({
        level: churnRate > 0.3 ? "warning" : "info",
        title: `Διατήρηση πελατών ${Math.round((1 - churnRate) * 100)}% τον χρόνο`,
        detail: `Από τους πελάτες του προηγούμενου 12μήνου, το ${Math.round(churnRate * 100)}% δεν αγόρασε στους τελευταίους 12 μήνες — μέση «ζωή» πελάτη ~${lifetime.toLocaleString("el-GR", { maximumFractionDigits: 1 })} έτη.`,
      });
    if (lossMakers.length)
      findings.push({
        level: "warning",
        title: `${lossMakers.length} πελάτες με αρνητική συνεισφορά μετά το κόστος εξυπηρέτησης`,
        detail: `Τζίρος ${eur(lossMakers.reduce((a, p) => a + p.revenue, 0))}, συνεισφορά ${eur(lossMakers.reduce((a, p) => a + p.net, 0))}: πολλά μικρά παραστατικά, χαμηλό περιθώριο ή μεγάλο υπόλοιπο.`,
      });
    if (rules[0])
      findings.push({
        level: "opportunity",
        title: `Cross-sell: ${rules[0].missing} πελάτες αγοράζουν «${rules[0].from}» αλλά όχι «${rules[0].to}»`,
        detail: `Όσοι αγοράζουν το πρώτο αγοράζουν το δεύτερο ${rules[0].lift.toLocaleString("el-GR", { maximumFractionDigits: 1 })}× συχνότερα από τον μέσο πελάτη — δυνητικά ~${eur(rules[0].potential)}.`,
      });
    if (credit.length)
      findings.push({
        level: "risk",
        title: `${credit.length} πελάτες με πιστωτικό κίνδυνο που αυξάνεται`,
        detail: `Υπόλοιπο που μεγάλωσε στο τρίμηνο ή ληξιπρόθεσμα άνω των 90 ημερών με βαθμό πληρωμής Γ/Δ.${credit[0] ? ` Πρώτος: ${credit[0].name} (${eur(credit[0].balance)}).` : ""}`,
      });

    return {
      // Flow: complete quarters only (the running one would show every customer not yet back as lost).
      cohorts: { quarters: Array.from({ length: Math.max(0, nowQ - minQ) }, (_, k) => (k === 0 ? "1ο τρίμηνο" : `+${k}`)), rows: cohortRows, flow: flow.slice(1, -1) },
      churnRate,
      clv,
      pl: { best, worst, bubbles, lossMakers: lossMakers.length, lossMakersRevenue: lossMakers.reduce((a, p) => a + p.revenue, 0) },
      credit,
      rules,
      peers,
      findings,
      assumptions: SERVE,
    };
  });
}

/** Cached for 15 minutes per tenant. */
export function customerInsights(tenantId: string): Promise<CustomerInsights> {
  return memo(`customer-insights:${tenantId}`, MEMO_TTL, () => computeCustomerInsights(tenantId));
}
