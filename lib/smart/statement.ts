import "server-only";
import { schemaName } from "@/lib/warehouse";
import { withWarehouse } from "@/lib/warehouse-writer";
import { median, qi, round } from "@/lib/smart/mining";

// Customer statement (καρτέλα) for the PDF: the documents of the last 12 months — sales documents
// that move the balance (invoices +, credit notes −) and collections (−, refunds +) — with a running
// balance. The opening balance is derived from the official balance (SoftOne partner ledger), so
// the statement always ends at the balance SoftOne shows. Plus the analysis: ageing, payment
// behaviour, monthly purchases, top categories/brands.

export type StatementLine = { date: string; doc: string; kind: string; debit: number; credit: number; balance: number };
export type CustomerStatement = {
  customer: { trdr: number; code: string | null; name: string; afm: string | null; address: string | null; city: string | null; email: string | null };
  from: string;
  to: string;
  opening: number;
  closing: number;
  lines: StatementLine[];
  totals: { invoiced: number; credited: number; collected: number };
  ageing: { label: string; amount: number }[];
  overdue: number;
  payDays: number | null;
  companyPayDays: number;
  lastPayment: string | null;
  grade: string | null;
  monthly: { month: string; purchases: number; payments: number }[];
  categories: { name: string; amount: number }[];
  brands: { name: string; amount: number }[];
  revenue12: number;
  revenuePrev: number;
};

const n = (v: unknown) => Number(v ?? 0) || 0;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function customerStatement(tenantId: string, trdr: number): Promise<CustomerStatement> {
  const schema = schemaName(tenantId);
  const s = qi(schema);
  return withWarehouse(async (db) => {
    const col = async (t: string, c: string) => !!(await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3", [schema, t, c])).rowCount;
    const has = async (t: string) => !!(await db.query("SELECT to_regclass($1) AS t", [`${s}.${t}`])).rows[0]?.t;
    const c = (
      await db.query(
        `SELECT trdr, code, name, ${(await col("customers", "afm")) ? "afm" : "NULL"} AS afm, ${(await col("customers", "address")) ? "address" : "NULL"} AS address,
                ${(await col("customers", "city")) ? "city" : "NULL"} AS city, ${(await col("customers", "email")) ? "email" : "NULL"} AS email
         FROM ${s}.customers WHERE trdr = $1`,
        [trdr],
      )
    ).rows[0];
    if (!c) throw new Error("Ο πελάτης δεν βρέθηκε.");
    const now = new Date();
    const from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() + 1);
    const amount = (await col("sales_docs", "sumlamnt")) ? "COALESCE(d.sumlamnt, d.sumamnt)" : "d.sumamnt";
    const docs = (
      await db.query(
        `SELECT d.trndate, COALESCE(d.fincode, d.findoc::text) AS doc, ds.name AS kind, (${amount} * ds.sign)::float AS amt
         FROM ${s}.sales_docs d JOIN ${s}.doc_series ds ON ds.series = d.series AND ds.sign <> 0
         WHERE d.trdr = $1 AND COALESCE(d.iscancel, 0) = 0 AND d.trndate >= $2`,
        [trdr, from],
      )
    ).rows;
    const pays = (await has("collections"))
      ? (
          await db.query(
            `SELECT c.trndate, COALESCE(c.fincode, c.findoc::text) AS doc, COALESCE(sr.name, 'Είσπραξη') AS kind, COALESCE(c.sumlamnt, c.sumamnt)::float AS amt
             FROM ${s}.collections c ${(await has("series")) ? `LEFT JOIN ${s}.series sr ON sr.series = c.series` : "LEFT JOIN (SELECT NULL::int AS series, NULL::text AS name) sr ON false"}
             WHERE c.trdr = $1 AND COALESCE(c.iscancel, 0) = 0 AND c.trndate >= $2`,
            [trdr, from],
          )
        ).rows
      : [];
    const bal = (
      await db.query(
        `SELECT balance::float, open_0_30::float AS a, open_31_60::float AS b, open_61_90::float AS c, open_90_plus::float AS d, avg_payment_days::float AS pay,
                last_payment, payment_grade FROM ${s}.m_partner_balances WHERE kind = 'R' AND trdr = $1`,
        [trdr],
      )
    ).rows[0];
    const companyPay = median((await db.query(`SELECT avg_payment_days::float AS p FROM ${s}.m_partner_balances WHERE kind = 'R' AND avg_payment_days > 0`)).rows.map((r) => n(r.p))) || 0;

    type Mv = { date: Date; doc: string; kind: string; debit: number; credit: number };
    const moves: Mv[] = [
      ...docs.map((d) => ({ date: new Date(d.trndate as string), doc: String(d.doc), kind: String(d.kind ?? ""), debit: Math.max(0, n(d.amt)), credit: Math.max(0, -n(d.amt)) })),
      ...pays.map((p) => {
        // Refunds of a collection (returned money) raise the balance.
        const refund = /επιστροφ/i.test(String(p.kind));
        return { date: new Date(p.trndate as string), doc: String(p.doc), kind: String(p.kind), debit: refund ? n(p.amt) : 0, credit: refund ? 0 : n(p.amt) };
      }),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());
    const closing = bal ? n(bal.balance) : moves.reduce((a, m) => a + m.debit - m.credit, 0);
    const opening = closing - moves.reduce((a, m) => a + m.debit - m.credit, 0);
    let running = opening;
    const lines: StatementLine[] = moves.map((m) => {
      running += m.debit - m.credit;
      return { date: iso(m.date), doc: m.doc, kind: m.kind, debit: round(m.debit, 2), credit: round(m.credit, 2), balance: round(running, 2) };
    });

    // Monthly purchases (net of credit notes) and payments, 12 months.
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
    const monthly = months.map((m) => ({
      month: m,
      purchases: round(moves.filter((x) => iso(x.date).startsWith(m) && !/είσπραξ|κατάθεσ|επιστροφ/i.test(x.kind)).reduce((a, x) => a + x.debit - x.credit, 0)),
      payments: round(pays.filter((p) => iso(new Date(p.trndate as string)).startsWith(m)).reduce((a, p) => a + n(p.amt), 0)),
    }));

    const top = async (dim: "category" | "brand") => {
      const t = dim === "category" ? "item_categories" : "brands";
      const k = dim === "category" ? "mtrcategory" : "mtrmark";
      if (!(await has(t))) return [];
      return (
        await db.query(
          `SELECT COALESCE(x.name, '—') AS name, SUM(f.net)::float AS v FROM ${s}.f_sales_lines f JOIN ${s}.items i ON i.mtrl = f.mtrl LEFT JOIN ${s}.${t} x ON x.${k} = i.${k}
           WHERE f.trdr = $1 AND f.trndate >= $2 GROUP BY 1 HAVING SUM(f.net) > 0 ORDER BY 2 DESC LIMIT 6`,
          [trdr, from],
        )
      ).rows.map((r) => ({ name: String(r.name), amount: round(n(r.v)) }));
    };
    const rev = (await db.query(`SELECT revenue_12m::float AS r, revenue_prev_12m::float AS p FROM ${s}.m_customer_stats WHERE trdr = $1`, [trdr])).rows[0];

    return {
      customer: { trdr, code: (c.code as string) ?? null, name: String(c.name ?? ""), afm: (c.afm as string) ?? null, address: (c.address as string) ?? null, city: (c.city as string) ?? null, email: (c.email as string) ?? null },
      from: iso(from),
      to: iso(now),
      opening: round(opening, 2),
      closing: round(closing, 2),
      lines,
      totals: {
        invoiced: round(moves.filter((m) => !/είσπραξ|κατάθεσ|επιστροφ/i.test(m.kind)).reduce((a, m) => a + m.debit, 0), 2),
        credited: round(moves.filter((m) => !/είσπραξ|κατάθεσ|επιστροφ/i.test(m.kind)).reduce((a, m) => a + m.credit, 0), 2),
        collected: round(pays.reduce((a, p) => a + (/επιστροφ/i.test(String(p.kind)) ? -n(p.amt) : n(p.amt)), 0), 2),
      },
      ageing: bal
        ? [
            { label: "0–30 ημέρες", amount: round(n(bal.a)) },
            { label: "31–60 ημέρες", amount: round(n(bal.b)) },
            { label: "61–90 ημέρες", amount: round(n(bal.c)) },
            { label: "Πάνω από 90", amount: round(n(bal.d)) },
          ]
        : [],
      overdue: bal ? round(n(bal.b) + n(bal.c) + n(bal.d)) : 0,
      payDays: bal?.pay ? round(n(bal.pay)) : null,
      companyPayDays: round(companyPay),
      lastPayment: bal?.last_payment ? iso(new Date(bal.last_payment as string)) : null,
      grade: (bal?.payment_grade as string) ?? null,
      monthly,
      categories: await top("category"),
      brands: await top("brand"),
      revenue12: round(n(rev?.r)),
      revenuePrev: round(n(rev?.p)),
    };
  });
}
