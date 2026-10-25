import "server-only";
import { memo, MEMO_TTL } from "@/lib/memo";
import { schemaName } from "@/lib/warehouse";
import { withWarehouse } from "@/lib/warehouse-writer";
import { kmeans, median, qi, round, standardise } from "@/lib/smart/mining";

// Απόδοση χρηστών — per SoftOne user who entered the sales documents (FINDOC.INSUSER, always set):
// revenue, gross margin, discounts (list value PRICE × QTY vs net value of the line), customers,
// new customers, documents; the change vs the previous 12 months; selling styles by k-means
// (margin, discount, new-customer share, average document); the discounts each user gave to
// each customer (for the drill-down and the export).

export type UserPerf = {
  user: number;
  name: string;
  revenue: number;
  revenuePrev: number;
  growthPct: number | null;
  margin: number | null;
  marginPct: number | null;
  listValue: number;
  discount: number;
  discountPct: number;
  discountLines: number;
  lines: number;
  documents: number;
  avgDocument: number;
  customers: number;
  newCustomers: number;
  style: string;
};
export type UserCustomerDiscount = { user: number; userName: string; trdr: number; customer: string; listValue: number; net: number; discount: number; discountPct: number; lines: number };
export type UsersPerf = {
  available: boolean;
  source: "insuser" | "salesman" | null;
  users: UserPerf[];
  pairs: UserCustomerDiscount[];
  styles: { name: string; users: number; revenue: number }[];
  monthly: { month: string; [user: string]: number | string }[];
  topUsers: string[];
};

const n = (v: unknown) => Number(v ?? 0) || 0;

async function compute(tenantId: string): Promise<UsersPerf> {
  const schema = schemaName(tenantId);
  const s = qi(schema);
  return withWarehouse(async (db) => {
    const col = async (t: string, c: string) => !!(await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3", [schema, t, c])).rowCount;
    // INSUSER is filled on every document; if the facts don't have it yet, fall back to salesman.
    const covered = async (c: string) =>
      (await col("f_sales_lines", c)) &&
      n((await db.query(`SELECT COUNT(${c})::float / NULLIF(COUNT(*), 0) AS x FROM ${s}.f_sales_lines WHERE trndate >= now() - interval '12 months'`)).rows[0]?.x) >= 0.5;
    const source = (await covered("insuser")) ? "insuser" : (await covered("salesman")) ? "salesman" : null;
    if (!source) return { available: false, source: null, users: [], pairs: [], styles: [], monthly: [], topUsers: [] };
    const names = new Map<number, string>();
    if (source === "insuser" && (await db.query("SELECT to_regclass($1) AS t", [`${s}.s1_users`])).rows[0]?.t)
      for (const r of (await db.query(`SELECT users, name FROM ${s}.s1_users`)).rows) names.set(Number(r.users), String(r.name ?? ""));
    if (source === "salesman") for (const r of (await db.query(`SELECT prsn, name FROM ${s}.salesmen`)).rows) names.set(Number(r.prsn), String(r.name ?? ""));
    const nameOf = (u: number) => names.get(u) || `Χρήστης ${u}`;

    const rows = (
      await db.query(
        `SELECT f.${source} AS u,
                SUM(f.net) FILTER (WHERE f.trndate >= now() - interval '12 months')::float AS rev,
                SUM(f.net) FILTER (WHERE f.trndate < now() - interval '12 months')::float AS prev,
                SUM(f.net - f.cost) FILTER (WHERE f.trndate >= now() - interval '12 months' AND f.cost IS NOT NULL)::float AS margin,
                SUM(f.net) FILTER (WHERE f.trndate >= now() - interval '12 months' AND f.cost IS NOT NULL)::float AS costed,
                SUM(CASE WHEN sl.price > 0 AND f.sign = 1 THEN GREATEST(sl.price * sl.qty1, f.net) ELSE 0 END) FILTER (WHERE f.trndate >= now() - interval '12 months')::float AS list,
                SUM(CASE WHEN sl.price > 0 AND f.sign = 1 THEN f.net ELSE 0 END) FILTER (WHERE f.trndate >= now() - interval '12 months')::float AS listnet,
                COUNT(*) FILTER (WHERE f.trndate >= now() - interval '12 months' AND f.sign = 1 AND sl.price > 0 AND sl.price * sl.qty1 > f.net + 0.01)::float AS dlines,
                COUNT(*) FILTER (WHERE f.trndate >= now() - interval '12 months')::float AS lines,
                COUNT(DISTINCT f.findoc) FILTER (WHERE f.trndate >= now() - interval '12 months')::float AS docs,
                COUNT(DISTINCT f.trdr) FILTER (WHERE f.trndate >= now() - interval '12 months')::float AS custs
         FROM ${s}.f_sales_lines f LEFT JOIN ${s}.sales_lines sl ON sl.findoc = f.findoc AND sl.mtrlines = f.mtrlines
         WHERE f.${source} IS NOT NULL AND f.trndate >= now() - interval '24 months'
         GROUP BY 1`,
      )
    ).rows.filter((r) => n(r.rev) >= 1);
    // New customers: first ever purchase in the last 12 months, credited to the user of that first document.
    const newc = new Map(
      (
        await db.query(
          `SELECT u, COUNT(*)::float AS c FROM (
             SELECT DISTINCT ON (trdr) trdr, ${source} AS u, trndate FROM ${s}.f_sales_lines WHERE sign = 1 ORDER BY trdr, trndate
           ) x WHERE trndate >= now() - interval '12 months' AND u IS NOT NULL GROUP BY 1`,
        )
      ).rows.map((r) => [Number(r.u), n(r.c)]),
    );
    const users: UserPerf[] = rows.map((r) => {
      const u = Number(r.u);
      const docs = n(r.docs);
      return {
        user: u,
        name: nameOf(u),
        revenue: round(n(r.rev)),
        revenuePrev: round(n(r.prev)),
        growthPct: n(r.prev) > 0 ? round((n(r.rev) / n(r.prev) - 1) * 100, 1) : null,
        margin: n(r.costed) > 0 ? round(n(r.margin)) : null,
        marginPct: n(r.costed) > 0 ? round((n(r.margin) / n(r.costed)) * 100, 1) : null,
        listValue: round(n(r.list)),
        discount: round(n(r.list) - n(r.listnet)),
        discountPct: n(r.list) > 0 ? round((1 - n(r.listnet) / n(r.list)) * 100, 1) : 0,
        discountLines: n(r.dlines),
        lines: n(r.lines),
        documents: docs,
        avgDocument: docs ? round(n(r.rev) / docs) : 0,
        customers: n(r.custs),
        newCustomers: newc.get(u) ?? 0,
        style: "",
      };
    });
    users.sort((a, b) => b.revenue - a.revenue);

    // Selling styles (k-means on users with a meaningful volume).
    const active = users.filter((u) => u.documents >= 20);
    const styles: UsersPerf["styles"] = [];
    if (active.length >= 4) {
      const feats = active.map((u) => [u.marginPct ?? 0, u.discountPct, u.customers ? u.newCustomers / u.customers : 0, Math.log10(1 + u.avgDocument)]);
      const { labels } = kmeans(standardise(feats).z, Math.min(4, Math.max(2, Math.floor(active.length / 3))));
      const medMargin = median(active.map((u) => u.marginPct ?? 0));
      const medDisc = median(active.map((u) => u.discountPct));
      const medDoc = median(active.map((u) => u.avgDocument));
      const groups = new Map<number, UserPerf[]>();
      active.forEach((u, i) => groups.set(labels[i], [...(groups.get(labels[i]) ?? []), u]));
      for (const g of groups.values()) {
        const m = median(g.map((u) => u.marginPct ?? 0));
        const d = median(g.map((u) => u.discountPct));
        const doc = median(g.map((u) => u.avgDocument));
        const name =
          d > medDisc + 2 && m < medMargin
            ? "Πουλάνε με έκπτωση"
            : m > medMargin + 1 && d <= medDisc
              ? "Υπερασπίζονται το περιθώριο"
              : doc > medDoc * 1.5
                ? "Μεγάλες παραγγελίες"
                : "Ισορροπημένοι";
        g.forEach((u) => (u.style = name));
        const prev = styles.find((x) => x.name === name);
        if (prev) {
          prev.users += g.length;
          prev.revenue += round(g.reduce((a, u) => a + u.revenue, 0));
        } else styles.push({ name, users: g.length, revenue: round(g.reduce((a, u) => a + u.revenue, 0)) });
      }
    }
    for (const u of users) if (!u.style) u.style = "Μικρός όγκος";

    // Discounts per user × customer (12 months).
    const pairs: UserCustomerDiscount[] = (
      await db.query(
        `SELECT f.${source} AS u, f.trdr, c.name AS customer, SUM(GREATEST(sl.price * sl.qty1, f.net))::float AS list, SUM(f.net)::float AS net, COUNT(*)::float AS lines
         FROM ${s}.f_sales_lines f JOIN ${s}.sales_lines sl ON sl.findoc = f.findoc AND sl.mtrlines = f.mtrlines LEFT JOIN ${s}.customers c ON c.trdr = f.trdr
         WHERE f.${source} IS NOT NULL AND f.sign = 1 AND sl.price > 0 AND f.net > 0 AND f.trndate >= now() - interval '12 months'
         GROUP BY 1, 2, 3 HAVING SUM(GREATEST(sl.price * sl.qty1, f.net)) - SUM(f.net) > 1
         ORDER BY SUM(GREATEST(sl.price * sl.qty1, f.net)) - SUM(f.net) DESC LIMIT 2000`,
      )
    ).rows.map((r) => ({
      user: Number(r.u),
      userName: nameOf(Number(r.u)),
      trdr: Number(r.trdr),
      customer: String(r.customer ?? r.trdr),
      listValue: round(n(r.list)),
      net: round(n(r.net)),
      discount: round(n(r.list) - n(r.net)),
      discountPct: n(r.list) > 0 ? round((1 - n(r.net) / n(r.list)) * 100, 1) : 0,
      lines: n(r.lines),
    }));

    // Monthly revenue of the top 6 users (12 months).
    const top = users.slice(0, 6);
    const mrows = (
      await db.query(
        `SELECT to_char(date_trunc('month', trndate), 'YYYY-MM') AS m, ${source} AS u, SUM(net)::float AS v FROM ${s}.f_sales_lines
         WHERE ${source} = ANY($1::int[]) AND trndate >= date_trunc('month', now()) - interval '11 months' GROUP BY 1, 2 ORDER BY 1`,
        [top.map((u) => u.user)],
      )
    ).rows;
    const monthMap = new Map<string, { month: string; [user: string]: number | string }>();
    for (const r of mrows) {
      const m = monthMap.get(String(r.m)) ?? { month: String(r.m) };
      m[`u${r.u}`] = round(n(r.v));
      monthMap.set(String(r.m), m);
    }
    return { available: true, source, users, pairs, styles, monthly: [...monthMap.values()], topUsers: top.map((u) => `u${u.user}`) };
  });
}

export function usersPerformance(tenantId: string) {
  return memo(`users-perf:${tenantId}`, MEMO_TTL, () => compute(tenantId));
}
