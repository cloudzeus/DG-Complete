import "server-only";
import type { Client } from "pg";
import { schemaName } from "@/lib/warehouse";
import { withWarehouse } from "@/lib/warehouse-writer";

// Αγορές → analysis: purchases vs cost of sales (is stock building up?), by category and brand vs
// what they sell, purchase-price inflation on the same items, supplier concentration and delivery
// times, and plain-words findings. Same period of both years (Jan → last month with data).

const qi = (v: string) => `"${v.replace(/"/g, '""')}"`;
const eur = (v: number) => `${Math.round(v).toLocaleString("el-GR")} €`;
const pctTxt = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)}%`;

export type GroupRow = { name: string; purchases: number; purchasesPrev: number; cogs: number; cogsPrev: number; growthPct: number | null; coverRatio: number | null };
export type PriceRow = { code: string | null; name: string; supplier: string | null; brand: string | null; spend: number; qty: number; price: number; pricePrev: number; changePct: number };
export type SupplierRow = { name: string; spend: number; spendPrev: number; sharePct: number; growthPct: number | null; leadMedian: number | null; leadAvg: number | null; deliveries: number; priceChangePct: number | null };
/** Return on the money tied up in stock (last 12 months, current stock at cost). */
export type RoiRow = { name: string; revenue: number; margin: number; marginPct: number | null; stockValue: number; gmroi: number | null; turns: number | null; stockDays: number | null };

export type Finding = { level: "risk" | "warning" | "opportunity" | "info"; title: string; detail: string };

export type PurchaseAnalysis = {
  months: { purchases: number; cogs: number; sales: number }[];
  totals: { purchases: number; purchasesPrev: number; cogs: number; cogsPrev: number; sales: number; stockChange: number };
  priceIndexPct: number | null;
  pricedSpendPct: number;
  categories: GroupRow[];
  brands: GroupRow[];
  priceUp: PriceRow[];
  priceDown: PriceRow[];
  suppliers: SupplierRow[];
  top5SharePct: number;
  leadMedian: number | null;
  findings: Finding[];
  roi: { suppliers: RoiRow[]; categories: RoiRow[]; brands: RoiRow[] };
};

const has = async (db: Client, s: string, t: string) => !!(await db.query("SELECT to_regclass($1) AS t", [`${s}.${t}`])).rows[0]?.t;

export async function purchaseAnalysis(tenantId: string, year: number, lastMonth: number): Promise<PurchaseAnalysis> {
  const s = qi(schemaName(tenantId));
  const from = `${year}-01-01`;
  // Same months of both years: January → the last month with data (exclusive ends).
  const toExcl = new Date(year, lastMonth, 1).toISOString().slice(0, 10);
  const pFrom = `${year - 1}-01-01`;
  const pTo = new Date(year - 1, lastMonth, 1).toISOString().slice(0, 10);

  return withWarehouse(async (db) => {
    const sales = await has(db, s, "f_sales_lines");
    const brands = await has(db, s, "brands");
    const cats = await has(db, s, "item_categories");
    const leads = await has(db, s, "m_lead_times");
    const sodtype = (await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'items' AND column_name = 'sodtype'", [s.slice(1, -1)])).rowCount;

    // ── Monthly: purchases, cost of sales and sales of the selected year.
    const monthsQ = await db.query(
      `SELECT m, SUM(p)::float AS purchases, SUM(c)::float AS cogs, SUM(n)::float AS sales FROM (
         SELECT EXTRACT(MONTH FROM trndate)::int AS m, net AS p, 0 AS c, 0 AS n FROM ${s}.f_purchase_lines WHERE trndate >= $1 AND trndate < $2
         ${sales ? `UNION ALL SELECT EXTRACT(MONTH FROM trndate)::int, 0, COALESCE(cost, 0), net FROM ${s}.f_sales_lines WHERE trndate >= $1 AND trndate < $2` : ""}
       ) x GROUP BY m`,
      [`${year}-01-01`, `${year + 1}-01-01`],
    );
    const months = Array.from({ length: 12 }, () => ({ purchases: 0, cogs: 0, sales: 0 }));
    for (const r of monthsQ.rows) months[Number(r.m) - 1] = { purchases: Number(r.purchases), cogs: Number(r.cogs), sales: Number(r.sales) };

    // ── By category / brand: purchases vs cost of sales, this period and the same period last year.
    const grouped = async (col: "mtrcategory" | "mtrmark", table: string, none: string, limit: number): Promise<GroupRow[]> => {
      const r = await db.query(
        `WITH x AS (
           SELECT i.${col} AS g,
                  SUM(CASE WHEN p.trndate >= $1 AND p.trndate < $2 THEN p.net ELSE 0 END) AS pur,
                  SUM(CASE WHEN p.trndate >= $3 AND p.trndate < $4 THEN p.net ELSE 0 END) AS pur_prev,
                  0 AS cogs, 0 AS cogs_prev
           FROM ${s}.f_purchase_lines p JOIN ${s}.items i ON i.mtrl = p.mtrl
           WHERE p.trndate >= $3 AND p.trndate < $2 GROUP BY 1
           ${
             sales
               ? `UNION ALL
           SELECT i.${col}, 0, 0,
                  SUM(CASE WHEN f.trndate >= $1 AND f.trndate < $2 THEN COALESCE(f.cost, 0) ELSE 0 END),
                  SUM(CASE WHEN f.trndate >= $3 AND f.trndate < $4 THEN COALESCE(f.cost, 0) ELSE 0 END)
           FROM ${s}.f_sales_lines f JOIN ${s}.items i ON i.mtrl = f.mtrl
           WHERE f.trndate >= $3 AND f.trndate < $2 GROUP BY 1`
               : ""
           }
         )
         SELECT x.g, ${table ? `MAX(n.name)` : "NULL"} AS name, SUM(pur)::float AS pur, SUM(pur_prev)::float AS pur_prev, SUM(cogs)::float AS cogs, SUM(cogs_prev)::float AS cogs_prev
         FROM x ${table ? `LEFT JOIN ${s}.${table} n ON n.${col} = x.g` : ""}
         GROUP BY x.g HAVING SUM(pur) > 0 OR SUM(pur_prev) > 0
         ORDER BY SUM(pur) DESC LIMIT ${limit}`,
        [from, toExcl, pFrom, pTo],
      );
      return r.rows.map((x) => {
        const purchases = Number(x.pur);
        const purchasesPrev = Number(x.pur_prev);
        const cogs = Number(x.cogs);
        return {
          name: x.name ?? none,
          purchases,
          purchasesPrev,
          cogs,
          cogsPrev: Number(x.cogs_prev),
          growthPct: purchasesPrev > 0 ? ((purchases - purchasesPrev) / purchasesPrev) * 100 : null,
          coverRatio: cogs > 0 ? purchases / cogs : null,
        };
      });
    };
    const categories = await grouped("mtrcategory", cats ? "item_categories" : "", "Χωρίς κατηγορία", 15);
    const brandRows = brands ? await grouped("mtrmark", "brands", "Χωρίς μάρκα", 15) : [];

    // ── Purchase prices: the same items bought in both periods (unit price = net / qty).
    const prices = await db.query(
      `WITH cur AS (
         SELECT mtrl, SUM(net) AS spend, SUM(qty) AS qty, SUM(net) / NULLIF(SUM(qty), 0) AS price, MODE() WITHIN GROUP (ORDER BY trdr) AS trdr
         FROM ${s}.f_purchase_lines WHERE trndate >= $1 AND trndate < $2 AND qty > 0 AND net > 0 GROUP BY mtrl
       ), prev AS (
         SELECT mtrl, SUM(net) / NULLIF(SUM(qty), 0) AS price
         FROM ${s}.f_purchase_lines WHERE trndate >= $3 AND trndate < $1 AND qty > 0 AND net > 0 GROUP BY mtrl
       )
       SELECT c.mtrl, i.code, i.name, sp.name AS supplier, ${brands ? "b.name" : "NULL"} AS brand,
              c.spend::float, c.qty::float, c.price::float, p.price::float AS price_prev
       FROM cur c JOIN prev p ON p.mtrl = c.mtrl
       LEFT JOIN ${s}.items i ON i.mtrl = c.mtrl
       LEFT JOIN ${s}.suppliers sp ON sp.trdr = c.trdr
       ${brands ? `LEFT JOIN ${s}.brands b ON b.mtrmark = i.mtrmark` : ""}
       WHERE p.price > 0 AND c.price > 0 ${sodtype ? "AND COALESCE(i.sodtype, 51) = 51" : ""}`,
      // Previous prices from the whole previous year (more items comparable).
      [from, toExcl, pFrom],
    );
    const priced: PriceRow[] = prices.rows
      .map((x) => ({
        code: x.code ?? null,
        name: x.name ?? `Είδος ${x.mtrl}`,
        supplier: x.supplier ?? null,
        brand: x.brand ?? null,
        spend: Number(x.spend),
        qty: Number(x.qty),
        price: Number(x.price),
        pricePrev: Number(x.price_prev),
        changePct: ((Number(x.price) - Number(x.price_prev)) / Number(x.price_prev)) * 100,
      }))
      // Unit changes / data errors (×5, ÷5) are not price changes.
      .filter((p) => p.changePct > -80 && p.changePct < 400);
    const pricedSpend = priced.reduce((a, p) => a + p.spend, 0);
    const atOldPrices = priced.reduce((a, p) => a + p.qty * p.pricePrev, 0);
    const priceIndexPct = atOldPrices > 0 ? (pricedSpend / atOldPrices - 1) * 100 : null;
    const material = priced.filter((p) => p.spend >= 200);
    const priceUp = [...material].filter((p) => p.changePct >= 3).sort((a, b) => b.spend * b.changePct - a.spend * a.changePct).slice(0, 10);
    const priceDown = [...material].filter((p) => p.changePct <= -3).sort((a, b) => a.spend * a.changePct - b.spend * b.changePct).slice(0, 5);

    // ── Suppliers: spend, growth, delivery times (24 months), price change of their items.
    const sup = await db.query(
      `SELECT p.trdr, MAX(sp.name) AS name,
              SUM(CASE WHEN p.trndate >= $1 AND p.trndate < $2 THEN p.net ELSE 0 END)::float AS spend,
              SUM(CASE WHEN p.trndate >= $3 AND p.trndate < $4 THEN p.net ELSE 0 END)::float AS spend_prev
       FROM ${s}.f_purchase_lines p LEFT JOIN ${s}.suppliers sp ON sp.trdr = p.trdr
       WHERE p.trndate >= $3 AND p.trndate < $2 GROUP BY p.trdr
       HAVING SUM(CASE WHEN p.trndate >= $1 AND p.trndate < $2 THEN p.net ELSE 0 END) > 0
       ORDER BY spend DESC`,
      [from, toExcl, pFrom, pTo],
    );
    const leadMap = new Map<number, { median: number; avg: number; n: number }>();
    let leadMedian: number | null = null;
    if (leads) {
      const l = await db.query(
        `SELECT trdr, percentile_cont(0.5) WITHIN GROUP (ORDER BY lead_days)::float AS median, AVG(lead_days)::float AS avg, COUNT(*)::int AS n
         FROM ${s}.m_lead_times WHERE ordered >= now() - interval '24 months' GROUP BY ROLLUP (trdr)`,
      );
      for (const x of l.rows) {
        if (x.trdr === null) leadMedian = Math.round(Number(x.median));
        else leadMap.set(Number(x.trdr), { median: Math.round(Number(x.median)), avg: Math.round(Number(x.avg) * 10) / 10, n: Number(x.n) });
      }
    }
    // Price change per supplier (their priced items).
    const supPrice = new Map<string, { spend: number; old: number }>();
    for (const p of priced) {
      if (!p.supplier) continue;
      const e = supPrice.get(p.supplier) ?? { spend: 0, old: 0 };
      e.spend += p.spend;
      e.old += p.qty * p.pricePrev;
      supPrice.set(p.supplier, e);
    }
    const totalSpend = sup.rows.reduce((a, x) => a + Number(x.spend), 0);
    const suppliers: SupplierRow[] = sup.rows.slice(0, 12).map((x) => {
      const lead = leadMap.get(Number(x.trdr));
      const sp = x.name ? supPrice.get(x.name) : undefined;
      return {
        name: x.name ?? `Προμηθευτής ${x.trdr}`,
        spend: Number(x.spend),
        spendPrev: Number(x.spend_prev),
        sharePct: totalSpend > 0 ? (Number(x.spend) / totalSpend) * 100 : 0,
        growthPct: Number(x.spend_prev) > 0 ? ((Number(x.spend) - Number(x.spend_prev)) / Number(x.spend_prev)) * 100 : null,
        leadMedian: lead?.median ?? null,
        leadAvg: lead?.avg ?? null,
        deliveries: lead?.n ?? 0,
        priceChangePct: sp && sp.old > 0 ? (sp.spend / sp.old - 1) * 100 : null,
      };
    });
    const top5SharePct = suppliers.slice(0, 5).reduce((a, x) => a + x.sharePct, 0);

    // ── Totals of the period (same months both years).
    const tot = await db.query(
      `SELECT
         (SELECT COALESCE(SUM(net), 0) FROM ${s}.f_purchase_lines WHERE trndate >= $1 AND trndate < $2)::float AS pur,
         (SELECT COALESCE(SUM(net), 0) FROM ${s}.f_purchase_lines WHERE trndate >= $3 AND trndate < $4)::float AS pur_prev
         ${sales ? `, (SELECT COALESCE(SUM(cost), 0) FROM ${s}.f_sales_lines WHERE trndate >= $1 AND trndate < $2)::float AS cogs,
         (SELECT COALESCE(SUM(cost), 0) FROM ${s}.f_sales_lines WHERE trndate >= $3 AND trndate < $4)::float AS cogs_prev,
         (SELECT COALESCE(SUM(net), 0) FROM ${s}.f_sales_lines WHERE trndate >= $1 AND trndate < $2)::float AS sales` : ""}`,
      [from, toExcl, pFrom, pTo],
    );
    const t = tot.rows[0] ?? {};
    const totals = {
      purchases: Number(t.pur ?? 0),
      purchasesPrev: Number(t.pur_prev ?? 0),
      cogs: Number(t.cogs ?? 0),
      cogsPrev: Number(t.cogs_prev ?? 0),
      sales: Number(t.sales ?? 0),
      stockChange: Number(t.pur ?? 0) - Number(t.cogs ?? 0),
    };

    // ── ROI: gross margin of the last 12 months ÷ stock at cost (GMROI), turns and days of stock.
    const roiBy = async (expr: string, join: string, nameExpr: string, none: string): Promise<RoiRow[]> => {
      const r = await db.query(
        `SELECT ${expr} AS g, ${nameExpr} AS name,
                SUM(m.revenue_12m)::float AS revenue, SUM(COALESCE(m.margin_12m, 0))::float AS margin,
                SUM(m.revenue_costed_12m)::float AS costed, SUM(COALESCE(m.cost_12m, 0))::float AS cogs,
                SUM(GREATEST(COALESCE(m.stock_value, 0), 0))::float AS stock
         FROM ${s}.m_item_stats m JOIN ${s}.items i ON i.mtrl = m.mtrl ${join}
         GROUP BY 1 HAVING SUM(m.revenue_12m) > 0 OR SUM(GREATEST(COALESCE(m.stock_value, 0), 0)) > 0
         ORDER BY SUM(COALESCE(m.margin_12m, 0)) DESC LIMIT 15`,
      );
      return r.rows.map((x) => {
        const stock = Number(x.stock);
        const margin = Number(x.margin);
        const cogs = Number(x.cogs);
        return {
          name: x.name ?? none,
          revenue: Number(x.revenue),
          margin,
          marginPct: Number(x.costed) > 0 ? (100 * margin) / Number(x.costed) : null,
          stockValue: stock,
          gmroi: stock > 0 ? margin / stock : null,
          turns: stock > 0 ? cogs / stock : null,
          stockDays: cogs > 0 ? Math.round((stock / cogs) * 365) : null,
        };
      });
    };
    const roi = {
      suppliers: await roiBy("m.main_supplier", `LEFT JOIN ${s}.suppliers sp ON sp.trdr = m.main_supplier`, "MAX(sp.name)", "Χωρίς προμηθευτή"),
      categories: await roiBy("i.mtrcategory", cats ? `LEFT JOIN ${s}.item_categories c ON c.mtrcategory = i.mtrcategory` : "", cats ? "MAX(c.name)" : "NULL", "Χωρίς κατηγορία"),
      brands: brands ? await roiBy("i.mtrmark", `LEFT JOIN ${s}.brands b ON b.mtrmark = i.mtrmark`, "MAX(b.name)", "Χωρίς μάρκα") : [],
    };

    // ── Findings.
    const findings: Finding[] = [];
    if (totals.cogs > 0) {
      const ratio = totals.purchases / totals.cogs;
      if (ratio >= 1.1)
        findings.push({
          level: "warning",
          title: `Αγοράσατε ${pctTxt((ratio - 1) * 100)} περισσότερα από όσα πουλήσατε (σε κόστος)`,
          detail: `Αγορές ${eur(totals.purchases)} έναντι κόστους πωλήσεων ${eur(totals.cogs)}: το απόθεμα αυξήθηκε περίπου κατά ${eur(totals.stockChange)} στην περίοδο.`,
        });
      else if (ratio <= 0.9)
        findings.push({
          level: "info",
          title: `Οι αγορές καλύπτουν το ${Math.round(ratio * 100)}% των πωλήσεων (σε κόστος)`,
          detail: `Το απόθεμα μειώθηκε περίπου κατά ${eur(-totals.stockChange)} — προσοχή στη διαθεσιμότητα των ειδών με κίνηση.`,
        });
    }
    if (priceIndexPct !== null && Math.abs(priceIndexPct) >= 2)
      findings.push({
        level: priceIndexPct > 0 ? "warning" : "opportunity",
        title: `Τιμές αγοράς ${pctTxt(priceIndexPct)} στα ίδια είδη`,
        detail: `Σε σύγκριση με τις τιμές του ${year - 1}, για είδη που αντιστοιχούν στο ${Math.round(pricedSpend > 0 && totals.purchases > 0 ? (100 * pricedSpend) / totals.purchases : 0)}% των αγορών.${priceUp[0] ? ` Μεγαλύτερη επίπτωση: ${priceUp[0].name} (${pctTxt(priceUp[0].changePct)}).` : ""}`,
      });
    for (const c of categories.slice(0, 10)) {
      const salesGrowth = c.cogsPrev > 0 ? ((c.cogs - c.cogsPrev) / c.cogsPrev) * 100 : null;
      if (c.growthPct !== null && salesGrowth !== null && c.growthPct - salesGrowth >= 25 && c.purchases >= totals.purchases * 0.03)
        findings.push({
          level: "warning",
          title: `${c.name}: αγορές ${pctTxt(c.growthPct)} ενώ οι πωλήσεις ${pctTxt(salesGrowth)}`,
          detail: `Αγορές ${eur(c.purchases)} έναντι κόστους πωλήσεων ${eur(c.cogs)} — κίνδυνος υπεραποθέματος.`,
        });
      else if (c.growthPct !== null && salesGrowth !== null && salesGrowth - c.growthPct >= 25 && c.cogs >= totals.cogs * 0.03)
        findings.push({
          level: "risk",
          title: `${c.name}: πωλήσεις ${pctTxt(salesGrowth)} αλλά αγορές ${pctTxt(c.growthPct)}`,
          detail: `Το απόθεμα της κατηγορίας τρώγεται — ελέγξτε τη διαθεσιμότητα των δυνατών ειδών.`,
        });
    }
    if (top5SharePct >= 60)
      findings.push({
        level: "info",
        title: `Οι 5 μεγαλύτεροι προμηθευτές κάνουν το ${Math.round(top5SharePct)}% των αγορών`,
        detail: `Υψηλή εξάρτηση${suppliers[0] ? ` — μόνο ο ${suppliers[0].name} ${Math.round(suppliers[0].sharePct)}%` : ""}. Εξετάστε εναλλακτικούς προμηθευτές για τις βασικές κατηγορίες.`,
      });
    const slow = suppliers.filter((x) => x.leadMedian !== null && leadMedian !== null && x.leadMedian >= leadMedian * 2 && x.leadMedian >= 14 && x.deliveries >= 3);
    if (slow[0])
      findings.push({
        level: "info",
        title: `Αργές παραδόσεις: ${slow.map((x) => `${x.name} (~${x.leadMedian} ημ.)`).slice(0, 2).join(", ")}`,
        detail: `Ο διάμεσος χρόνος όλων των προμηθευτών είναι ~${leadMedian} ημ. — για αυτούς χρειάζεται μεγαλύτερο απόθεμα ασφαλείας ή νωρίτερη παραγγελία.`,
      });

    return {
      months,
      totals,
      priceIndexPct,
      pricedSpendPct: totals.purchases > 0 ? (100 * pricedSpend) / totals.purchases : 0,
      categories,
      brands: brandRows,
      priceUp,
      priceDown,
      suppliers,
      top5SharePct,
      leadMedian,
      findings,
      roi,
    };
  });
}
