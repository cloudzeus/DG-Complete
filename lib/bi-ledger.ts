import "server-only";
import type { Client } from "pg";
import type { BiSettings } from "@/lib/bi-marts";

// Receivables / payables from SoftOne's partner ledger (TRDBALSHEET, monthly per customer/supplier).
// Payments are matched to the oldest open invoices (FIFO) → payment days per partner, open items
// with ageing, a payment score, and a 13-week cash forecast. Cash/bank movements (38.xx) by month.

type LedgerRow = { trdr: number; d: Date; debit: number; credit: number };
type OpenItem = { date: Date; amount: number };
type PartnerResult = {
  trdr: number;
  balance: number;
  open: OpenItem[];
  paidAmount12m: number;
  weightedDays12m: number;
  payments12m: number;
  lastPayment: Date | null;
  invoiced12m: number;
  /** Average of the 12 last month-end balances (for balance-based payment days). */
  avgBalance12m: number;
};

const DAY = 86_400_000;
const qi = (s: string) => {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(s)) throw new Error(`Invalid identifier: ${s}`);
  return `"${s}"`;
};
const prefixSql = (col: string, prefixes: string[]) =>
  prefixes.length
    ? `(${prefixes.map((p) => `(${col} = '${p.replace(/[^0-9.]/g, "")}' OR ${col} LIKE '${p.replace(/[^0-9.]/g, "")}.%')`).join(" OR ")})`
    : "false";

/**
 * Monthly partner ledger (SoftOne TRDBALSHEET: debit/credit per customer or supplier per month),
 * all fiscal years since the company started. Movements are dated mid-month; an opening
 * entry (period 0) only of the first year.
 */
async function ledgerRows(db: Client, schema: string, kind: "R" | "P"): Promise<LedgerRow[]> {
  const s = qi(schema);
  const partners = kind === "R" ? "customers" : "suppliers";
  const res = await db.query(
    `SELECT p.trdr::bigint AS trdr,
            CASE WHEN p.period = 0 THEN make_date(p.fiscprd::int, 1, 1) ELSE make_date(p.fiscprd::int, LEAST(p.period, 12)::int, 15) END AS d,
            COALESCE(p.ldebit, 0)::float8 AS debit, COALESCE(p.lcredit, 0)::float8 AS credit
     FROM ${s}.partner_ledger p
     WHERE p.trdr IN (SELECT trdr FROM ${s}.${partners})
       AND (p.period BETWEEN 1 AND 12 OR (p.period = 0 AND p.fiscprd = (SELECT MIN(fiscprd) FROM ${s}.partner_ledger)))
     ORDER BY p.trdr, p.fiscprd, p.period`,
  );
  return res.rows.map((r) => ({ trdr: Number(r.trdr), d: new Date(r.d), debit: Number(r.debit), credit: Number(r.credit) }));
}

/**
 * FIFO matching. `increases` is the side that opens items (customers: debit; suppliers: credit).
 */
function matchPartners(rows: LedgerRow[], increases: "debit" | "credit"): PartnerResult[] {
  const out: PartnerResult[] = [];
  const since12m = Date.now() - 365 * DAY;
  let i = 0;
  while (i < rows.length) {
    const trdr = rows[i].trdr;
    const open: OpenItem[] = [];
    let credit = 0; // unapplied payments / credit notes (negative open balance)
    const r: PartnerResult = { trdr, balance: 0, open, paidAmount12m: 0, weightedDays12m: 0, payments12m: 0, lastPayment: null, invoiced12m: 0, avgBalance12m: 0 };
    const startRow = i;
    for (; i < rows.length && rows[i].trdr === trdr; i++) {
      const row = rows[i];
      const inc = increases === "debit" ? row.debit - row.credit : row.credit - row.debit;
      if (inc > 0) {
        // new invoice: first absorb any unapplied payment
        let amount = inc;
        const used = Math.min(amount, credit);
        amount -= used;
        credit -= used;
        if (amount > 0.005) open.push({ date: row.d, amount });
        if (row.d.getTime() >= since12m) r.invoiced12m += inc;
      } else if (inc < 0) {
        let pay = -inc;
        if (row.d.getTime() >= since12m) {
          r.payments12m++;
          r.lastPayment = row.d;
        } else if (!r.lastPayment || row.d > r.lastPayment) r.lastPayment = row.d;
        while (pay > 0.005 && open.length) {
          const item = open[0];
          const applied = Math.min(item.amount, pay);
          if (row.d.getTime() >= since12m) {
            r.paidAmount12m += applied;
            r.weightedDays12m += applied * Math.max(0, (row.d.getTime() - item.date.getTime()) / DAY);
          }
          item.amount -= applied;
          pay -= applied;
          if (item.amount <= 0.005) open.shift();
        }
        credit += pay;
      }
    }
    r.balance = open.reduce((t, o) => t + o.amount, 0) - credit;
    // month-end balances of the last 12 months (rows are monthly, dated mid-month)
    const mine = rows.slice(startRow, i);
    let sumEnds = 0;
    const today = new Date();
    for (let m = 1; m <= 12; m++) {
      const end = new Date(today.getFullYear(), today.getMonth() - m + 1, 0);
      let bal = 0;
      for (const x of mine) if (x.d <= end) bal += increases === "debit" ? x.debit - x.credit : x.credit - x.debit;
      sumEnds += Math.max(0, bal);
    }
    r.avgBalance12m = sumEnds / 12;
    out.push(r);
  }
  return out;
}

function ageing(open: OpenItem[], now: number) {
  const b = { d0_30: 0, d31_60: 0, d61_90: 0, d90p: 0, oldest: null as Date | null };
  for (const o of open) {
    const age = (now - o.date.getTime()) / DAY;
    if (age <= 30) b.d0_30 += o.amount;
    else if (age <= 60) b.d31_60 += o.amount;
    else if (age <= 90) b.d61_90 += o.amount;
    else b.d90p += o.amount;
    if (!b.oldest || o.date < b.oldest) b.oldest = o.date;
  }
  return b;
}

/** 0–100: slow payment and old open balances cost points. Α ≥ 80, Β ≥ 60, Γ ≥ 40, Δ below. */
function paymentScore(avgDays: number | null, balance: number, a: ReturnType<typeof ageing>) {
  let score = 100;
  if (avgDays !== null) score -= Math.min(40, Math.max(0, avgDays - 30) * 0.5);
  if (balance > 0) {
    score -= 40 * Math.min(1, a.d90p / balance);
    score -= 20 * Math.min(1, a.d61_90 / balance);
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, grade: score >= 80 ? "Α" : score >= 60 ? "Β" : score >= 40 ? "Γ" : "Δ" };
}

async function writeTable(db: Client, schema: string, name: string, ddl: string, rows: Record<string, unknown>[], recordDef: string) {
  const s = qi(schema);
  const fresh = qi(`${name}__new`);
  await db.query("BEGIN");
  try {
    await db.query(`DROP TABLE IF EXISTS ${s}.${fresh}`);
    await db.query(`CREATE TABLE ${s}.${fresh} (${ddl})`);
    for (let i = 0; i < rows.length; i += 2000) {
      await db.query(`INSERT INTO ${s}.${fresh} SELECT * FROM jsonb_to_recordset($1::jsonb) AS r(${recordDef})`, [JSON.stringify(rows.slice(i, i + 2000))]);
    }
    await db.query(`DROP TABLE IF EXISTS ${s}.${qi(name)}`);
    await db.query(`ALTER TABLE ${s}.${fresh} RENAME TO ${qi(name)}`);
    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
}

const round = (n: number) => Math.round(n * 100) / 100;
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

const PARTNER_DDL =
  "trdr bigint, kind text, balance numeric(19,2), open_0_30 numeric(19,2), open_31_60 numeric(19,2), open_61_90 numeric(19,2), open_90_plus numeric(19,2), oldest_open date, avg_payment_days numeric(9,1), paid_12m numeric(19,2), payments_12m int, invoiced_12m numeric(19,2), last_payment date, dso_days numeric(9,1), payment_score int, payment_grade text";
const PARTNER_REC =
  "trdr bigint, kind text, balance numeric, open_0_30 numeric, open_31_60 numeric, open_61_90 numeric, open_90_plus numeric, oldest_open date, avg_payment_days numeric, paid_12m numeric, payments_12m int, invoiced_12m numeric, last_payment date, dso_days numeric, payment_score int, payment_grade text";

export async function buildLedgerMarts(db: Client, schema: string, settings: BiSettings): Promise<string[]> {
  const s = qi(schema);
  const ok = async (t: string) => !!(await db.query("SELECT to_regclass($1) AS t", [`${schema}.${t}`])).rows[0]?.t;
  const now = Date.now();
  const built: string[] = [];
  const hasLedger = await ok("partner_ledger");
  const hasGl = (await ok("gl_lines")) && (await ok("gl_accounts"));

  const partners: Record<string, unknown>[] = [];
  const openItems: Record<string, unknown>[] = [];
  for (const kind of hasLedger ? (["R", "P"] as const) : []) {
    if (!(await ok(kind === "R" ? "customers" : "suppliers"))) continue;
    const rows = await ledgerRows(db, schema, kind);
    for (const p of matchPartners(rows, kind === "R" ? "debit" : "credit")) {
      const a = ageing(p.open, now);
      // Payment days = average balance / average daily invoicing (robust to old disputed items).
      const avgDays = p.invoiced12m > 0 ? Math.min(720, p.avgBalance12m / (p.invoiced12m / 365)) : null;
      const sc = paymentScore(avgDays, p.balance, a);
      partners.push({
        trdr: p.trdr,
        kind,
        balance: round(p.balance),
        open_0_30: round(a.d0_30),
        open_31_60: round(a.d31_60),
        open_61_90: round(a.d61_90),
        open_90_plus: round(a.d90p),
        oldest_open: iso(a.oldest),
        avg_payment_days: avgDays === null ? null : Math.round(avgDays * 10) / 10,
        paid_12m: round(p.paidAmount12m),
        payments_12m: p.payments12m,
        invoiced_12m: round(p.invoiced12m),
        last_payment: iso(p.lastPayment),
        dso_days: p.invoiced12m > 0 ? Math.round((Math.max(0, p.balance) / (p.invoiced12m / 365)) * 10) / 10 : null,
        payment_score: sc.score,
        payment_grade: sc.grade,
      });
      const expectDays = avgDays ?? 60;
      for (const o of p.open) {
        const expected = new Date(o.date.getTime() + expectDays * DAY);
        openItems.push({
          trdr: p.trdr,
          kind,
          doc_date: iso(o.date),
          amount: round(o.amount),
          age_days: Math.floor((now - o.date.getTime()) / DAY),
          expected_date: iso(expected),
        });
      }
    }
  }
  await writeTable(db, schema, "m_partner_balances", PARTNER_DDL, partners, PARTNER_REC);
  await writeTable(
    db,
    schema,
    "m_open_items",
    "trdr bigint, kind text, doc_date date, amount numeric(19,2), age_days int, expected_date date",
    openItems,
    "trdr bigint, kind text, doc_date date, amount numeric, age_days int, expected_date date",
  );
  built.push("m_partner_balances", "m_open_items");

  // 13-week cash forecast: open receivables in, open payables out, at each partner's pace.
  // Already-late items fall in week 0.
  const weeks = Array.from({ length: 13 }, (_, w) => ({ week: w, inflow: 0, outflow: 0 }));
  const today = new Date(new Date().toISOString().slice(0, 10)).getTime();
  for (const o of openItems as { kind: string; amount: number; expected_date: string }[]) {
    if (o.amount <= 0) continue;
    const w = Math.max(0, Math.floor((new Date(o.expected_date).getTime() - today) / (7 * DAY)));
    if (w > 12) continue;
    if (o.kind === "R") weeks[w].inflow += o.amount;
    else weeks[w].outflow += o.amount;
  }
  await writeTable(
    db,
    schema,
    "m_cash_forecast",
    "week int, week_start date, inflow numeric(19,2), outflow numeric(19,2), net numeric(19,2)",
    weeks.map((w) => ({
      week: w.week,
      week_start: iso(new Date(today + w.week * 7 * DAY)),
      inflow: round(w.inflow),
      outflow: round(w.outflow),
      net: round(w.inflow - w.outflow),
    })),
    "week int, week_start date, inflow numeric, outflow numeric, net numeric",
  );
  built.push("m_cash_forecast");

  // Cash & banks by month (debit = in, credit = out) with running balance.
  if (hasGl && settings.cashPrefixes.length) {
    await db.query("BEGIN");
    try {
      await db.query(`DROP TABLE IF EXISTS ${s}.m_cash_monthly__new`);
      await db.query(`
        CREATE TABLE ${s}.m_cash_monthly__new AS
        WITH m AS (
          SELECT date_trunc('month', l.trndate)::date AS month,
                 SUM(COALESCE(l.debit, 0)) FILTER (WHERE l.period BETWEEN 1 AND 12) AS inflow,
                 SUM(COALESCE(l.credit, 0)) FILTER (WHERE l.period BETWEEN 1 AND 12) AS outflow,
                 SUM(COALESCE(l.debit, 0) - COALESCE(l.credit, 0)) AS net
          FROM ${s}.gl_lines l JOIN ${s}.gl_accounts a ON a.acnt = l.acnt
          WHERE COALESCE(l.iscancel, 0) = 0 AND ${prefixSql("a.code", settings.cashPrefixes)}
            AND (l.period BETWEEN 1 AND 12 OR (l.period = 0 AND l.fiscprd = (SELECT MIN(fiscprd) FROM ${s}.gl_lines)))
          GROUP BY 1
        )
        SELECT month, COALESCE(inflow, 0)::numeric(19,2) AS inflow, COALESCE(outflow, 0)::numeric(19,2) AS outflow,
               SUM(net) OVER (ORDER BY month)::numeric(19,2) AS balance
        FROM m`);
      await db.query(`DROP TABLE IF EXISTS ${s}.m_cash_monthly`);
      await db.query(`ALTER TABLE ${s}.m_cash_monthly__new RENAME TO m_cash_monthly`);
      await db.query("COMMIT");
      built.push("m_cash_monthly");
    } catch (err) {
      await db.query("ROLLBACK");
      throw err;
    }
  }
  return built;
}
