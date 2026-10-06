import "server-only";
import type { Client } from "pg";
import { schemaName } from "@/lib/warehouse";
import { withWarehouse } from "@/lib/warehouse-writer";

// Working capital and the cash conversion cycle, month by month (last 13 month-ends):
//   receivables / payables = cumulative partner ledger (TRDBALSHEET) of customers / suppliers,
//   inventory at cost      = stock now − purchases since + cost of sales since (other moves ignored),
//   DSO = receivables ÷ invoiced per day, DPO = payables ÷ purchased per day (both incl. VAT, 3 months),
//   DIO = inventory ÷ cost of sales per day (12 months — evens out the season), CCC = DIO + DSO − DPO.
// Plus where the money sits (customers, suppliers, categories) and what one day less is worth.

const qi = (v: string) => `"${v.replace(/"/g, '""')}"`;
const DAY = 86_400_000;
const eur = (v: number) => `${Math.round(v).toLocaleString("el-GR")} €`;

export type WcMonth = {
  month: string; // YYYY-MM
  inventory: number;
  receivables: number;
  payables: number;
  workingCapital: number;
  dio: number | null;
  dso: number | null;
  dpo: number | null;
  ccc: number | null;
};

export type WcTop = { name: string; value: number; detail?: string };
export type WcFinding = { level: "risk" | "warning" | "opportunity" | "info"; title: string; detail: string };

export type WorkingCapital = {
  months: WcMonth[];
  now: WcMonth;
  yearAgo: WcMonth | null;
  /** € that one day less of each lever frees (at the current pace). */
  perDay: { dio: number; dso: number; dpo: number };
  overdue: { total: number; d31_60: number; d61_90: number; d90plus: number };
  customers: WcTop[];
  suppliers: WcTop[];
  categories: WcTop[];
  findings: WcFinding[];
  hasLedger: boolean;
};

const has = async (db: Client, s: string, t: string) => !!(await db.query("SELECT to_regclass($1) AS t", [`${s}.${t}`])).rows[0]?.t;
const monthEnd = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0, 23, 59, 59));

export async function workingCapital(tenantId: string): Promise<WorkingCapital> {
  const s = qi(schemaName(tenantId));
  return withWarehouse(async (db) => {
    const hasLedger = (await has(db, s, "partner_ledger")) && (await has(db, s, "customers")) && (await has(db, s, "suppliers"));
    const hasSales = await has(db, s, "f_sales_lines");
    const hasPurch = await has(db, s, "f_purchase_lines");
    const hasStats = await has(db, s, "m_item_stats");

    const now = new Date();
    const ends = Array.from({ length: 13 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 12 + i, 1);
      return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, end: i === 12 ? now : monthEnd(d.getFullYear(), d.getMonth()) };
    });
    const from = new Date(ends[0].end.getTime() - 380 * DAY);

    // Partner ledger per month: customers (debit − credit), suppliers (credit − debit).
    const ledger = new Map<string, { arMove: number; apMove: number; invoiced: number; purchased: number }>();
    let arBefore = 0;
    let apBefore = 0;
    if (hasLedger) {
      const r = await db.query(
        `SELECT CASE WHEN p.period = 0 THEN make_date(p.fiscprd::int, 1, 1) ELSE make_date(p.fiscprd::int, LEAST(p.period, 12)::int, 15) END AS d,
                SUM(CASE WHEN c.trdr IS NOT NULL THEN COALESCE(p.ldebit, 0) - COALESCE(p.lcredit, 0) ELSE 0 END)::float AS ar,
                SUM(CASE WHEN sp.trdr IS NOT NULL THEN COALESCE(p.lcredit, 0) - COALESCE(p.ldebit, 0) ELSE 0 END)::float AS ap,
                SUM(CASE WHEN c.trdr IS NOT NULL AND p.period > 0 THEN COALESCE(p.ldebit, 0) ELSE 0 END)::float AS invoiced,
                SUM(CASE WHEN sp.trdr IS NOT NULL AND p.period > 0 THEN COALESCE(p.lcredit, 0) ELSE 0 END)::float AS purchased
         FROM ${s}.partner_ledger p
         LEFT JOIN ${s}.customers c ON c.trdr = p.trdr
         LEFT JOIN ${s}.suppliers sp ON sp.trdr = p.trdr AND c.trdr IS NULL
         WHERE p.period BETWEEN 1 AND 12 OR (p.period = 0 AND p.fiscprd = (SELECT MIN(fiscprd) FROM ${s}.partner_ledger))
         GROUP BY 1 ORDER BY 1`,
      );
      for (const x of r.rows) {
        const d = new Date(x.d);
        if (d < from) {
          arBefore += Number(x.ar);
          apBefore += Number(x.ap);
          continue;
        }
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const e = ledger.get(key) ?? { arMove: 0, apMove: 0, invoiced: 0, purchased: 0 };
        e.arMove += Number(x.ar);
        e.apMove += Number(x.ap);
        e.invoiced += Number(x.invoiced);
        e.purchased += Number(x.purchased);
        ledger.set(key, e);
      }
    }

    // Monthly purchases (net) and cost of sales — to roll the stock value back.
    const flows = new Map<string, { purchases: number; cogs: number }>();
    const flow = async (sql: string, k: "purchases" | "cogs") => {
      for (const x of (await db.query(sql, [from])).rows) {
        const e = flows.get(x.m) ?? { purchases: 0, cogs: 0 };
        e[k] += Number(x.v);
        flows.set(x.m, e);
      }
    };
    if (hasPurch) await flow(`SELECT to_char(trndate, 'YYYY-MM') AS m, SUM(net)::float AS v FROM ${s}.f_purchase_lines WHERE trndate >= $1 GROUP BY 1`, "purchases");
    if (hasSales) await flow(`SELECT to_char(trndate, 'YYYY-MM') AS m, SUM(COALESCE(cost, 0))::float AS v FROM ${s}.f_sales_lines WHERE trndate >= $1 GROUP BY 1`, "cogs");
    const stockNow = hasStats ? Number((await db.query(`SELECT COALESCE(SUM(GREATEST(stock_value, 0)), 0)::float AS v FROM ${s}.m_item_stats`)).rows[0].v) : 0;

    // Walk the months: ledger cumulates forward, stock rolls back from today.
    const keysAll = [...new Set([...ledger.keys(), ...flows.keys()])].sort();
    let ar = arBefore;
    let ap = apBefore;
    const arAt = new Map<string, number>();
    const apAt = new Map<string, number>();
    for (const k of keysAll) {
      ar += ledger.get(k)?.arMove ?? 0;
      ap += ledger.get(k)?.apMove ?? 0;
      arAt.set(k, ar);
      apAt.set(k, ap);
    }
    const valueAt = (map: Map<string, number>, key: string, before: number) => {
      let v = before;
      for (const k of keysAll) if (k <= key) v = map.get(k) ?? v;
      return v;
    };
    const after = (key: string, f: (e: { purchases: number; cogs: number }) => number) =>
      [...flows].filter(([k]) => k > key).reduce((a, [, e]) => a + f(e), 0);
    const lastN = (n: number, key: string, f: (k: string) => number) => {
      const [y, m] = key.split("-").map(Number);
      return Array.from({ length: n }, (_, i) => i).reduce((a, i) => {
        const d = new Date(y, m - 1 - i, 1);
        return a + f(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }, 0);
    };
    const last3 = (key: string, f: (k: string) => number) => lastN(3, key, f);
    const last12 = (key: string, f: (k: string) => number) => lastN(12, key, f);
    // Current month is partial: its windows count only the days elapsed.
    const daysIn3 = (key: string, i: number) => (i === 12 ? 61 + now.getDate() : 91);
    const daysIn12 = (i: number) => (i === 12 ? 334 + now.getDate() : 365);

    const months: WcMonth[] = ends.map(({ key }, i) => {
      const inventory = Math.max(0, stockNow - after(key, (e) => e.purchases) + after(key, (e) => e.cogs));
      const receivables = hasLedger ? valueAt(arAt, key, arBefore) : 0;
      const payables = hasLedger ? valueAt(apAt, key, apBefore) : 0;
      const days = daysIn3(key, i);
      const cogsDay = last12(key, (k) => flows.get(k)?.cogs ?? 0) / daysIn12(i);
      const invDay = last3(key, (k) => ledger.get(k)?.invoiced ?? 0) / days;
      const purDay = last3(key, (k) => ledger.get(k)?.purchased ?? 0) / days;
      const dio = cogsDay > 0 ? inventory / cogsDay : null;
      const dso = hasLedger && invDay > 0 ? Math.max(0, receivables) / invDay : null;
      const dpo = hasLedger && purDay > 0 ? Math.max(0, payables) / purDay : null;
      return {
        month: key,
        inventory,
        receivables,
        payables,
        workingCapital: inventory + receivables - payables,
        dio,
        dso,
        dpo,
        ccc: dio !== null && dso !== null && dpo !== null ? dio + dso - dpo : dio !== null && dso !== null ? dio + dso : null,
      };
    });
    const cur = months[months.length - 1];
    const yearAgo = months[0] ?? null;
    const curKey = cur.month;
    const perDay = {
      dio: last12(curKey, (k) => flows.get(k)?.cogs ?? 0) / daysIn12(12),
      dso: last3(curKey, (k) => ledger.get(k)?.invoiced ?? 0) / daysIn3(curKey, 12),
      dpo: last3(curKey, (k) => ledger.get(k)?.purchased ?? 0) / daysIn3(curKey, 12),
    };

    // Where the money sits.
    let customers: WcTop[] = [];
    let suppliers: WcTop[] = [];
    let overdue = { total: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
    if (await has(db, s, "m_partner_balances")) {
      const c = await db.query(
        `SELECT c.name, b.balance::float AS v, b.open_90_plus::float AS o90, b.avg_payment_days::float AS days
         FROM ${s}.m_partner_balances b JOIN ${s}.customers c ON c.trdr = b.trdr
         WHERE b.kind = 'R' AND b.balance > 0 ORDER BY b.balance DESC LIMIT 10`,
      );
      customers = c.rows.map((x) => ({
        name: x.name ?? "—",
        value: Number(x.v),
        detail: [x.days ? `πληρώνει σε ~${Math.round(Number(x.days))} ημ.` : null, Number(x.o90) > 0 ? `${eur(Number(x.o90))} άνω των 90 ημ.` : null].filter(Boolean).join(" · "),
      }));
      const p = await db.query(
        `SELECT sp.name, b.balance::float AS v FROM ${s}.m_partner_balances b JOIN ${s}.suppliers sp ON sp.trdr = b.trdr
         WHERE b.kind = 'P' AND b.balance > 0 ORDER BY b.balance DESC LIMIT 10`,
      );
      suppliers = p.rows.map((x) => ({ name: x.name ?? "—", value: Number(x.v) }));
      const o = (
        await db.query(
          `SELECT COALESCE(SUM(open_31_60 + open_61_90 + open_90_plus), 0)::float AS total, COALESCE(SUM(open_31_60), 0)::float AS a,
                  COALESCE(SUM(open_61_90), 0)::float AS b, COALESCE(SUM(open_90_plus), 0)::float AS c
           FROM ${s}.m_partner_balances WHERE kind = 'R'`,
        )
      ).rows[0];
      overdue = { total: Number(o.total), d31_60: Number(o.a), d61_90: Number(o.b), d90plus: Number(o.c) };
    }
    let categories: WcTop[] = [];
    if (hasStats && (await has(db, s, "item_categories"))) {
      const r = await db.query(
        `SELECT COALESCE(c.name, 'Χωρίς κατηγορία') AS name, SUM(GREATEST(m.stock_value, 0))::float AS v, SUM(COALESCE(m.cost_12m, 0))::float AS cogs
         FROM ${s}.m_item_stats m JOIN ${s}.items i ON i.mtrl = m.mtrl LEFT JOIN ${s}.item_categories c ON c.mtrcategory = i.mtrcategory
         GROUP BY 1 HAVING SUM(GREATEST(m.stock_value, 0)) > 0 ORDER BY 2 DESC LIMIT 10`,
      );
      categories = r.rows.map((x) => ({
        name: x.name,
        value: Number(x.v),
        detail: Number(x.cogs) > 0 ? `${Math.round((Number(x.v) / Number(x.cogs)) * 365)} ημέρες αποθέματος` : "χωρίς πωλήσεις 12μ",
      }));
    }

    // Findings.
    const findings: WcFinding[] = [];
    const d = (a: number | null, b: number | null) => (a !== null && b !== null ? a - b : null);
    const cccChange = d(cur.ccc, yearAgo?.ccc ?? null);
    if (cur.ccc !== null)
      findings.push({
        level: cccChange !== null && cccChange > 10 ? "warning" : cccChange !== null && cccChange < -10 ? "opportunity" : "info",
        title: `Κύκλος μετατροπής μετρητών: ${Math.round(cur.ccc)} ημέρες${cccChange !== null ? ` (${cccChange > 0 ? "+" : ""}${Math.round(cccChange)} από πέρσι)` : ""}`,
        detail: `Τόσες ημέρες χρηματοδοτεί η εταιρεία από ίδια μέσα κάθε € που κινείται: απόθεμα ${Math.round(cur.dio ?? 0)} + είσπραξη ${Math.round(cur.dso ?? 0)} − πληρωμή προμηθευτών ${Math.round(cur.dpo ?? 0)} ημέρες.`,
      });
    if (cur.dio !== null && perDay.dio > 0) {
      const target = Math.max(30, Math.round(cur.dio * 0.8));
      findings.push({
        level: cur.dio > 180 ? "risk" : "info",
        title: `Απόθεμα για ${Math.round(cur.dio)} ημέρες — 1 ημέρα λιγότερη = ${eur(perDay.dio)}`,
        detail: `Με μείωση στις ${target} ημέρες (−20%) αποδεσμεύονται ~${eur((cur.dio - target) * perDay.dio)} μετρητά.`,
      });
    }
    if (cur.dso !== null && perDay.dso > 0)
      findings.push({
        level: overdue.d90plus > cur.receivables * 0.15 ? "warning" : "info",
        title: `Είσπραξη σε ${Math.round(cur.dso)} ημέρες — 1 ημέρα λιγότερη = ${eur(perDay.dso)}`,
        detail: `Ληξιπρόθεσμα άνω των 30 ημερών ${eur(overdue.total)}, εκ των οποίων ${eur(overdue.d90plus)} άνω των 90.${customers[0] ? ` Μεγαλύτερο υπόλοιπο: ${customers[0].name} (${eur(customers[0].value)}).` : ""}`,
      });
    if (cur.dpo !== null && cur.dso !== null && cur.dpo < cur.dso - 15)
      findings.push({
        level: "opportunity",
        title: `Πληρώνετε τους προμηθευτές σε ${Math.round(cur.dpo)} ημέρες, εισπράττετε σε ${Math.round(cur.dso)}`,
        detail: `Κάθε ημέρα επιπλέον πίστωσης από προμηθευτές αξίζει ~${eur(perDay.dpo)} — θέμα διαπραγμάτευσης όρων πληρωμής.`,
      });
    const wcChange = yearAgo ? cur.workingCapital - yearAgo.workingCapital : null;
    if (wcChange !== null && Math.abs(wcChange) > Math.abs(cur.workingCapital) * 0.1)
      findings.push({
        level: wcChange > 0 ? "warning" : "opportunity",
        title: `Το κεφάλαιο κίνησης ${wcChange > 0 ? "αυξήθηκε" : "μειώθηκε"} κατά ${eur(Math.abs(wcChange))} σε 12 μήνες`,
        detail: wcChange > 0 ? "Περισσότερα μετρητά δεμένα σε απόθεμα και πελάτες — ελέγξτε ποιο από τα δύο το προκάλεσε." : "Αποδεσμεύτηκαν μετρητά από τη λειτουργία.",
      });

    return { months, now: cur, yearAgo, perDay, overdue, customers, suppliers, categories, findings, hasLedger };
  });
}
