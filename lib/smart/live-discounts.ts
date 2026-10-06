import "server-only";
import { schemaName } from "@/lib/warehouse";
import { withWarehouse } from "@/lib/warehouse-writer";
import { qi, round } from "@/lib/smart/mining";

// Today's discounts per SoftOne user (FINDOC.INSUSER) and per customer, straight from the synced
// sales documents and lines (fresh every sync): list value (PRICE × QTY) vs the net line value.

export type LiveDiscountUser = {
  user: number;
  name: string;
  documents: number;
  list: number;
  net: number;
  discount: number;
  pct: number;
  customers: { trdr: number; name: string; list: number; net: number; discount: number; pct: number; documents: number }[];
};

const n = (v: unknown) => Number(v ?? 0) || 0;

export async function liveDiscounts(tenantId: string): Promise<LiveDiscountUser[] | null> {
  const schema = schemaName(tenantId);
  const s = qi(schema);
  return withWarehouse(async (db) => {
    const col = async (t: string, c: string) => !!(await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3", [schema, t, c])).rowCount;
    if (!(await col("sales_docs", "insuser")) || !(await col("sales_lines", "price"))) return null;
    const users = (await db.query("SELECT to_regclass($1) AS t", [`${s}.s1_users`])).rows[0]?.t ? `(SELECT name FROM ${s}.s1_users u WHERE u.users = d.insuser)` : "NULL";
    const net = (await col("sales_lines", "lnetlineval")) ? "COALESCE(l.lnetlineval, l.netlineval, 0)" : "COALESCE(l.netlineval, 0)";
    const rows = (
      await db.query(
        `SELECT d.insuser AS u, ${users} AS uname, d.trdr, c.name AS cname, COUNT(DISTINCT d.findoc)::float AS docs,
                SUM(GREATEST(l.price * l.qty1, ${net}))::float AS list, SUM(${net})::float AS net
         FROM ${s}.sales_docs d
         JOIN ${s}.doc_series ds ON ds.series = d.series AND ds.sign = 1
         JOIN ${s}.sales_lines l ON l.findoc = d.findoc
         LEFT JOIN ${s}.customers c ON c.trdr = d.trdr
         WHERE COALESCE(d.iscancel, 0) = 0 AND d.insuser IS NOT NULL AND l.price > 0 AND l.qty1 > 0
           AND d.trndate::date = (now() AT TIME ZONE 'Europe/Athens')::date
         GROUP BY 1, 2, 3, 4`,
      )
    ).rows;
    const byUser = new Map<number, LiveDiscountUser>();
    for (const r of rows) {
      const u = Number(r.u);
      const x = byUser.get(u) ?? { user: u, name: (r.uname as string) || `Χρήστης ${u}`, documents: 0, list: 0, net: 0, discount: 0, pct: 0, customers: [] };
      const list = n(r.list);
      const nt = n(r.net);
      x.documents += n(r.docs);
      x.list += list;
      x.net += nt;
      x.customers.push({ trdr: Number(r.trdr), name: String(r.cname ?? r.trdr), list: round(list, 2), net: round(nt, 2), discount: round(list - nt, 2), pct: list > 0 ? round((1 - nt / list) * 100, 1) : 0, documents: n(r.docs) });
      byUser.set(u, x);
    }
    return [...byUser.values()]
      .map((x) => ({ ...x, list: round(x.list, 2), net: round(x.net, 2), discount: round(x.list - x.net, 2), pct: x.list > 0 ? round((1 - x.net / x.list) * 100, 1) : 0, customers: x.customers.sort((a, b) => b.discount - a.discount) }))
      .sort((a, b) => b.discount - a.discount);
  });
}
