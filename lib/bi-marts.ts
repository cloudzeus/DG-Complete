import "server-only";
import type { Client } from "pg";
import { prisma } from "@/lib/prisma";
import { schemaName } from "@/lib/warehouse";
import { buildDocSeries } from "@/lib/doc-series";
import { GR_REGIONS } from "@/lib/gr-regions";
import { withWarehouse } from "@/lib/warehouse-writer";
import { buildLedgerMarts } from "@/lib/bi-ledger";

// Analytic marts in the tenant schema t_<tenant>, rebuilt hourly from the imported SoftOne tables.
// They turn raw documents into business answers (profit per item, ABC, dead stock, reorder
// suggestions, customer segments, supplier lead times …) and are what Cube and the AI agent read.
// Every mart is built into <name>__new and swapped in one transaction (readers never see a gap).

export type BiSettings = {
  /** Warehouses that count for stock (others, e.g. warranty/service, are ignored). Empty = all. */
  mainWarehouses: number[];
  /** GL account prefixes of customers (receivables) and suppliers (payables), and cash/banks. */
  receivablePrefixes: string[];
  payablePrefixes: string[];
  cashPrefixes: string[];
  /** Cover target for order suggestions, on top of the supplier lead time. */
  coverDays: number;
  /** No sale for this many days → dead stock. */
  deadStockDays: number;
  /** SoftOne series (PURDOC) allowed for purchase orders from the order suggestions; empty = disabled. */
  purchaseOrderSeries?: { id: number; label: string }[];
  /** Warehouse of those orders; default the first main warehouse. */
  orderWarehouse?: number | null;
};

export const DEFAULT_BI_SETTINGS: BiSettings = {
  mainWarehouses: [],
  receivablePrefixes: ["30"],
  payablePrefixes: ["50"],
  cashPrefixes: ["38"],
  coverDays: 30,
  deadStockDays: 180,
};

export async function getBiSettings(tenantId: string): Promise<BiSettings> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { biSettings: true } });
  return { ...DEFAULT_BI_SETTINGS, ...((t?.biSettings ?? {}) as Partial<BiSettings>) };
}

export const qi = (s: string) => {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(s)) throw new Error(`Invalid identifier: ${s}`);
  return `"${s}"`;
};

export async function tableExists(db: Client, schema: string, table: string) {
  return !!(await db.query("SELECT to_regclass($1) AS t", [`${schema}.${table}`])).rows[0]?.t;
}

/** Builds `name` from a SELECT, atomically replacing the previous version. */
export async function swapTable(db: Client, schema: string, name: string, select: string, params: unknown[] = [], indexes: string[] = []) {
  const s = qi(schema);
  const fresh = qi(`${name}__new`);
  await db.query("BEGIN");
  try {
    await db.query(`DROP TABLE IF EXISTS ${s}.${fresh}`);
    await db.query(`CREATE TABLE ${s}.${fresh} AS ${select}`, params);
    for (const cols of indexes) await db.query(`CREATE INDEX ON ${s}.${fresh} (${cols})`);
    await db.query(`DROP TABLE IF EXISTS ${s}.${qi(name)}`);
    await db.query(`ALTER TABLE ${s}.${fresh} RENAME TO ${qi(name)}`);
    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
}

/** Adds optional source columns that the marts read (older imports may lack them; NULL is handled). */
async function ensureColumns(db: Client, schema: string, table: string, cols: Record<string, string>) {
  if (!(await tableExists(db, schema, table))) return false;
  const existing = new Set(
    (await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2", [schema, table])).rows.map(
      (r) => r.column_name as string,
    ),
  );
  for (const [c, type] of Object.entries(cols)) {
    if (!existing.has(c)) await db.query(`ALTER TABLE ${qi(schema)}.${qi(table)} ADD COLUMN ${qi(c)} ${type}`);
  }
  return true;
}

// Unit cost of an item in a fiscal year: standard cost → rolling average → last purchase price,
// else the latest year that has one, else the average purchase price from purchase invoices.
const UNIT_COST_CTE = (s: string, hasPurchases: boolean) => `
  cost_year AS (
    SELECT mtrl, fiscprd, COALESCE(NULLIF(standcost, 0), NULLIF(purprice1, 0), NULLIF(purlprice, 0)) AS unit_cost
    FROM ${s}.item_costs
  ),
  cost_latest AS (
    SELECT DISTINCT ON (mtrl) mtrl, unit_cost FROM cost_year WHERE unit_cost IS NOT NULL ORDER BY mtrl, fiscprd DESC
  ),
  cost_purchase AS (
    ${
      hasPurchases
        ? `SELECT l.mtrl, SUM(COALESCE(l.lnetlineval, l.netlineval)) / NULLIF(SUM(l.qty1), 0) AS unit_cost
           FROM ${s}.purchase_lines l
           JOIN ${s}.purchase_docs d ON d.findoc = l.findoc AND COALESCE(d.iscancel, 0) = 0
           JOIN ${s}.doc_series ds ON ds.series = d.series AND ds.sign = 1
           WHERE l.qty1 > 0
           GROUP BY l.mtrl`
        : `SELECT NULL::bigint AS mtrl, NULL::numeric AS unit_cost WHERE false`
    }
  )`;

async function buildSalesFacts(db: Client, schema: string, hasPurchases: boolean) {
  const s = qi(schema);
  // The SoftOne user who entered the document (FINDOC.INSUSER) — synced since the per-user analysis.
  const insuser = (await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'sales_docs' AND column_name = 'insuser'", [schema])).rowCount
    ? "d.insuser"
    : "NULL::int";
  await swapTable(
    db,
    schema,
    "f_sales_lines",
    `WITH ${UNIT_COST_CTE(s, hasPurchases)}
     SELECT l.findoc, l.mtrlines, d.trndate, d.insdate, d.fiscprd, d.branch, d.trdr, d.series,
            COALESCE(NULLIF(l.salesman, 0), NULLIF(d.salesman, 0)) AS salesman, ${insuser} AS insuser,
            l.mtrl, l.whouse, ds.sign,
            (l.qty1 * ds.sign)::numeric(19,4) AS qty,
            (COALESCE(l.lnetlineval, l.netlineval, 0) * ds.sign)::numeric(19,2) AS net,
            uc.unit_cost::numeric(19,4) AS unit_cost,
            (l.qty1 * ds.sign * uc.unit_cost)::numeric(19,2) AS cost
     FROM ${s}.sales_lines l
     JOIN ${s}.sales_docs d ON d.findoc = l.findoc AND COALESCE(d.iscancel, 0) = 0
     JOIN ${s}.doc_series ds ON ds.series = d.series AND ds.sign <> 0
     LEFT JOIN cost_year cy ON cy.mtrl = l.mtrl AND cy.fiscprd = d.fiscprd
     LEFT JOIN cost_latest cl ON cl.mtrl = l.mtrl
     LEFT JOIN cost_purchase cp ON cp.mtrl = l.mtrl
     CROSS JOIN LATERAL (SELECT COALESCE(cy.unit_cost, cl.unit_cost, cp.unit_cost) AS unit_cost) uc`,
    [],
    ["trndate", "mtrl", "trdr"],
  );
}

async function buildPurchaseFacts(db: Client, schema: string) {
  const s = qi(schema);
  // Invoicing lines (sign ≠ 0) + the order → receipt link (FINDOCS) for lead times.
  await swapTable(
    db,
    schema,
    "f_purchase_lines",
    `SELECT l.findoc, l.mtrlines, d.trndate, d.fiscprd, d.trdr, d.series, l.mtrl, l.whouse, ds.sign,
            (l.qty1 * ds.sign)::numeric(19,4) AS qty,
            (COALESCE(l.lnetlineval, l.netlineval, 0) * ds.sign)::numeric(19,2) AS net
     FROM ${s}.purchase_lines l
     JOIN ${s}.purchase_docs d ON d.findoc = l.findoc AND COALESCE(d.iscancel, 0) = 0
     JOIN ${s}.doc_series ds ON ds.series = d.series AND ds.sign <> 0`,
    [],
    ["trndate", "mtrl", "trdr"],
  );

  // Lead time: days from the supplier order to the first goods receipt that executes it
  // (receipt line → FINDOCS = order, directly or through an intermediate receipt note).
  await swapTable(
    db,
    schema,
    "m_lead_times",
    `WITH orders AS (
       SELECT d.findoc, d.trndate, d.trdr
       FROM ${s}.purchase_docs d JOIN ${s}.doc_series ds ON ds.series = d.series
       WHERE COALESCE(d.iscancel, 0) = 0 AND ds.sign = 0 AND upper(ds.name) LIKE '%ΠΑΡΑΓΓΕΛ%'
     ),
     links AS (
       SELECT DISTINCT l.findocs AS source, l.findoc AS target FROM ${s}.purchase_lines l WHERE l.findocs IS NOT NULL AND l.findocs <> l.findoc
     ),
     reach AS (
       SELECT o.findoc AS order_doc, k.target FROM orders o JOIN links k ON k.source = o.findoc
       UNION
       SELECT o.findoc, k2.target FROM orders o JOIN links k ON k.source = o.findoc JOIN links k2 ON k2.source = k.target
     ),
     first_receipt AS (
       SELECT r.order_doc, MIN(d.trndate) AS received
       FROM reach r JOIN ${s}.purchase_docs d ON d.findoc = r.target AND COALESCE(d.iscancel, 0) = 0
       GROUP BY r.order_doc
     )
     SELECT o.findoc AS order_doc, o.trdr, o.trndate AS ordered, f.received,
            GREATEST(0, (f.received::date - o.trndate::date))::int AS lead_days
     FROM orders o JOIN first_receipt f ON f.order_doc = o.findoc`,
  );
}

async function buildItemStats(db: Client, schema: string, settings: BiSettings, has: { purchases: boolean; stock: boolean }) {
  const s = qi(schema);
  // CREATE TABLE AS takes no bind parameters: inline validated integers only.
  const wh = `ARRAY[${settings.mainWarehouses.map((w) => Math.trunc(Number(w))).filter(Number.isFinite).join(",")}]::int[]`;
  const deadDays = Math.trunc(Number(settings.deadStockDays)) || 180;
  const coverDays = Math.trunc(Number(settings.coverDays)) || 30;
  await swapTable(
    db,
    schema,
    "m_item_stats",
    `WITH ${UNIT_COST_CTE(s, has.purchases)},
     s12 AS (
       SELECT mtrl, SUM(net) AS revenue, SUM(qty) AS qty, SUM(cost) AS cost,
              SUM(net) FILTER (WHERE cost IS NOT NULL) AS revenue_costed,
              COUNT(DISTINCT trdr) AS customers, COUNT(DISTINCT findoc) AS documents
       FROM ${s}.f_sales_lines WHERE trndate >= now() - interval '365 days' GROUP BY mtrl
     ),
     p12 AS (
       SELECT mtrl, SUM(net) AS revenue, SUM(qty) AS qty
       FROM ${s}.f_sales_lines WHERE trndate >= now() - interval '730 days' AND trndate < now() - interval '365 days' GROUP BY mtrl
     ),
     q90 AS (SELECT mtrl, SUM(qty) AS qty FROM ${s}.f_sales_lines WHERE trndate >= now() - interval '90 days' GROUP BY mtrl),
     last_sale AS (SELECT mtrl, MAX(trndate) AS last_sale FROM ${s}.f_sales_lines WHERE sign = 1 GROUP BY mtrl),
     stock AS (
       ${
         has.stock
           ? `SELECT mtrl, SUM(impqty1 - expqty1) AS qty FROM ${s}.stock_balances
              WHERE fiscprd = (SELECT MAX(fiscprd) FROM ${s}.stock_balances)
                AND (cardinality(${wh}) = 0 OR whouse = ANY(${wh}))
              GROUP BY mtrl`
           : `SELECT NULL::bigint AS mtrl, NULL::numeric AS qty WHERE false`
       }
     ),
     main_supplier AS (
       ${
         has.purchases
           ? // The item's own supplier: the one it was first bought from (oldest purchase date; ties →
             // the larger quantity), else the supplier of its brand (the one most of the brand's items
             // are bought from).
             `SELECT i.mtrl, COALESCE(fb.trdr, bs.trdr) AS trdr,
                     CASE WHEN fb.trdr IS NOT NULL THEN 'item' WHEN bs.trdr IS NOT NULL THEN 'brand' END AS source
              FROM ${s}.items i
              LEFT JOIN (SELECT DISTINCT ON (mtrl) mtrl, trdr FROM (
                SELECT mtrl, trdr, MIN(trndate) AS first_buy, SUM(qty) AS q FROM ${s}.f_purchase_lines WHERE qty > 0 GROUP BY 1, 2
              ) x ORDER BY mtrl, first_buy ASC, q DESC) fb ON fb.mtrl = i.mtrl
              LEFT JOIN (SELECT DISTINCT ON (mtrmark) mtrmark, trdr FROM (
                SELECT it.mtrmark, p.trdr, COUNT(DISTINCT p.mtrl) AS n, MAX(p.trndate) AS last
                FROM ${s}.f_purchase_lines p JOIN ${s}.items it ON it.mtrl = p.mtrl
                WHERE p.qty > 0 AND it.mtrmark IS NOT NULL GROUP BY 1, 2
              ) x ORDER BY mtrmark, n DESC, last DESC) bs ON bs.mtrmark = i.mtrmark`
           : `SELECT NULL::bigint AS mtrl, NULL::bigint AS trdr, NULL::text AS source WHERE false`
       }
     ),
     supplier_lead AS (
       ${
         has.purchases
           ? `SELECT trdr, percentile_cont(0.5) WITHIN GROUP (ORDER BY lead_days) AS lead_days FROM ${s}.m_lead_times GROUP BY trdr`
           : `SELECT NULL::bigint AS trdr, NULL::float8 AS lead_days WHERE false`
       }
     ),
     base AS (
       SELECT i.mtrl,
              COALESCE(s12.revenue, 0) AS revenue_12m, COALESCE(s12.qty, 0) AS qty_12m,
              s12.cost AS cost_12m, s12.revenue_costed,
              COALESCE(p12.revenue, 0) AS revenue_prev_12m, COALESCE(p12.qty, 0) AS qty_prev_12m,
              COALESCE(q90.qty, 0) AS qty_90d,
              COALESCE(s12.customers, 0) AS customers_12m, COALESCE(s12.documents, 0) AS documents_12m,
              ls.last_sale,
              COALESCE(st.qty, 0) AS stock_qty,
              COALESCE(cl.unit_cost, cp.unit_cost) AS unit_cost,
              ms.trdr AS main_supplier, ms.source AS supplier_source,
              COALESCE(sl.lead_days, 30) AS lead_days
       FROM ${s}.items i
       LEFT JOIN s12 ON s12.mtrl = i.mtrl
       LEFT JOIN p12 ON p12.mtrl = i.mtrl
       LEFT JOIN q90 ON q90.mtrl = i.mtrl
       LEFT JOIN last_sale ls ON ls.mtrl = i.mtrl
       LEFT JOIN stock st ON st.mtrl = i.mtrl
       LEFT JOIN cost_latest cl ON cl.mtrl = i.mtrl
       LEFT JOIN cost_purchase cp ON cp.mtrl = i.mtrl
       LEFT JOIN main_supplier ms ON ms.mtrl = i.mtrl
       LEFT JOIN supplier_lead sl ON sl.trdr = ms.trdr
       WHERE s12.mtrl IS NOT NULL OR p12.mtrl IS NOT NULL OR COALESCE(st.qty, 0) <> 0
     ),
     ranked AS (
       SELECT b.*,
              SUM(GREATEST(revenue_12m, 0)) OVER (ORDER BY revenue_12m DESC, mtrl) /
                NULLIF(SUM(GREATEST(revenue_12m, 0)) OVER (), 0) AS cum_share
       FROM base b
     )
     SELECT r.mtrl,
            r.revenue_12m::numeric(19,2), r.qty_12m::numeric(19,4), r.cost_12m::numeric(19,2),
            r.revenue_costed::numeric(19,2) AS revenue_costed_12m,
            (r.revenue_costed - r.cost_12m)::numeric(19,2) AS margin_12m,
            CASE WHEN r.revenue_costed > 0 THEN (100 * (r.revenue_costed - r.cost_12m) / r.revenue_costed)::numeric(16,2) END AS margin_pct,
            r.revenue_prev_12m::numeric(19,2), r.qty_prev_12m::numeric(19,4), r.qty_90d::numeric(19,4),
            CASE WHEN r.revenue_prev_12m > 0 THEN (100 * (r.revenue_12m - r.revenue_prev_12m) / r.revenue_prev_12m)::numeric(16,2) END AS growth_pct,
            r.customers_12m, r.documents_12m, r.last_sale,
            (CURRENT_DATE - r.last_sale::date) AS days_since_sale,
            CASE WHEN r.revenue_12m <= 0 THEN 'N' WHEN r.cum_share <= 0.8 THEN 'A' WHEN r.cum_share <= 0.95 THEN 'B' ELSE 'C' END AS abc,
            r.stock_qty::numeric(19,4),
            r.unit_cost::numeric(19,4),
            (GREATEST(r.stock_qty, 0) * r.unit_cost)::numeric(19,2) AS stock_value,
            (GREATEST(r.qty_12m, 0) / 365.0)::numeric(19,6) AS daily_demand,
            CASE WHEN r.qty_12m > 0 THEN (r.stock_qty / (r.qty_12m / 365.0))::numeric(16,1) END AS days_of_cover,
            (r.stock_qty > 0 AND (r.last_sale IS NULL OR r.last_sale < now() - make_interval(days => ${deadDays}))) AS dead_stock,
            r.main_supplier, r.supplier_source, r.lead_days::int,
            CEIL(GREATEST(r.qty_12m, 0) / 365.0 * (r.lead_days + 7))::numeric(19,2) AS reorder_point,
            CASE
              -- Demand on the 12-month pace: sold in the last quarter, or regularly during the year
              -- (≥ 2 invoices in 12 months) even if not in the last 3 months.
              WHEN r.qty_12m > 0 AND (r.qty_90d > 0 OR r.documents_12m >= 2)
                   AND r.stock_qty <= GREATEST(r.qty_12m, 0) / 365.0 * (r.lead_days + 7)
              THEN GREATEST(0, CEIL(GREATEST(r.qty_12m, 0) / 365.0 * (r.lead_days + ${coverDays}) - r.stock_qty))
              ELSE 0
            END::numeric(19,2) AS suggested_order_qty
     FROM ranked r`,
    [],
    ["mtrl", "abc"],
  );
}

async function buildCustomerStats(db: Client, schema: string) {
  const s = qi(schema);
  // RFM on invoices of the last 24 months + 12-month KPIs; segments follow the classic RFM grid.
  await swapTable(
    db,
    schema,
    "m_customer_stats",
    `WITH docs AS (
       SELECT d.trdr, d.findoc, d.trndate, COALESCE(d.lnetamnt, d.netamnt, 0) * ds.sign AS net, ds.sign
       FROM ${s}.sales_docs d JOIN ${s}.doc_series ds ON ds.series = d.series AND ds.sign <> 0
       WHERE COALESCE(d.iscancel, 0) = 0 AND d.trdr IS NOT NULL AND d.trndate >= now() - interval '730 days'
     ),
     agg AS (
       SELECT trdr,
              MIN(trndate) FILTER (WHERE sign = 1) AS first_purchase,
              MAX(trndate) FILTER (WHERE sign = 1) AS last_purchase,
              COUNT(*) FILTER (WHERE sign = 1 AND trndate >= now() - interval '365 days') AS invoices_12m,
              COUNT(*) FILTER (WHERE sign = 1) AS invoices_24m,
              SUM(net) FILTER (WHERE trndate >= now() - interval '365 days') AS revenue_12m,
              SUM(net) FILTER (WHERE trndate < now() - interval '365 days') AS revenue_prev_12m,
              SUM(net) FILTER (WHERE trndate >= now() - interval '90 days') AS revenue_90d
       FROM docs GROUP BY trdr
     ),
     intervals AS (
       SELECT trdr, AVG(gap) AS avg_gap FROM (
         SELECT trdr, (trndate::date - LAG(trndate::date) OVER (PARTITION BY trdr ORDER BY trndate)) AS gap
         FROM (SELECT DISTINCT trdr, trndate FROM docs WHERE sign = 1) x
       ) g WHERE gap > 0 GROUP BY trdr
     ),
     margin AS (
       SELECT trdr, SUM(net) FILTER (WHERE cost IS NOT NULL) - SUM(cost) AS margin_12m,
              SUM(net) FILTER (WHERE cost IS NOT NULL) AS revenue_costed
       FROM ${s}.f_sales_lines WHERE trndate >= now() - interval '365 days' GROUP BY trdr
     ),
     scored AS (
       SELECT a.*, i.avg_gap, m.margin_12m, m.revenue_costed,
              (CURRENT_DATE - a.last_purchase::date) AS recency_days,
              NTILE(5) OVER (ORDER BY a.last_purchase) AS r,
              NTILE(5) OVER (ORDER BY a.invoices_24m) AS f,
              NTILE(5) OVER (ORDER BY COALESCE(a.revenue_12m, 0) + COALESCE(a.revenue_prev_12m, 0)) AS m
       FROM agg a LEFT JOIN intervals i ON i.trdr = a.trdr LEFT JOIN margin m ON m.trdr = a.trdr
       WHERE a.last_purchase IS NOT NULL
     )
     SELECT trdr, first_purchase, last_purchase, recency_days, invoices_12m, invoices_24m,
            COALESCE(revenue_12m, 0)::numeric(19,2) AS revenue_12m,
            COALESCE(revenue_prev_12m, 0)::numeric(19,2) AS revenue_prev_12m,
            COALESCE(revenue_90d, 0)::numeric(19,2) AS revenue_90d,
            CASE WHEN revenue_prev_12m > 0 THEN (100 * (COALESCE(revenue_12m, 0) - revenue_prev_12m) / revenue_prev_12m)::numeric(16,2) END AS growth_pct,
            (COALESCE(revenue_12m, 0) / NULLIF(invoices_12m, 0))::numeric(19,2) AS avg_invoice_12m,
            margin_12m::numeric(19,2),
            CASE WHEN revenue_costed > 0 THEN (100 * margin_12m / revenue_costed)::numeric(16,2) END AS margin_pct,
            avg_gap::numeric(16,1) AS avg_days_between_purchases,
            (last_purchase::date + COALESCE(ROUND(avg_gap), 30)::int) AS expected_next_purchase,
            r AS r_score, f AS f_score, m AS m_score,
            CASE
              WHEN r >= 4 AND f >= 4 AND m >= 4 THEN 'Champions'
              WHEN f >= 4 AND r >= 3 THEN 'Πιστοί'
              WHEN r >= 4 AND first_purchase >= now() - interval '120 days' THEN 'Νέοι'
              WHEN r >= 4 AND f BETWEEN 2 AND 3 THEN 'Δυνητικά πιστοί'
              WHEN r <= 2 AND f >= 3 AND m >= 3 THEN 'Σε κίνδυνο'
              WHEN r = 3 THEN 'Χρειάζονται προσοχή'
              WHEN r <= 2 AND f <= 2 AND r = 1 THEN 'Χαμένοι'
              ELSE 'Αδρανείς'
            END AS segment,
            CASE
              WHEN invoices_24m >= 3 AND avg_gap IS NOT NULL AND recency_days > GREATEST(2.5 * avg_gap, 45) THEN 'Υψηλός'
              WHEN invoices_24m >= 3 AND avg_gap IS NOT NULL AND recency_days > GREATEST(1.5 * avg_gap, 30) THEN 'Μέτριος'
              ELSE 'Χαμηλός'
            END AS churn_risk
     FROM scored`,
    [],
    ["trdr", "segment"],
  );
}

async function buildSupplierStats(db: Client, schema: string) {
  const s = qi(schema);
  await swapTable(
    db,
    schema,
    "m_supplier_stats",
    `WITH spend AS (
       SELECT trdr,
              SUM(net) FILTER (WHERE trndate >= now() - interval '365 days') AS spend_12m,
              SUM(net) FILTER (WHERE trndate < now() - interval '365 days' AND trndate >= now() - interval '730 days') AS spend_prev_12m,
              COUNT(DISTINCT findoc) FILTER (WHERE trndate >= now() - interval '365 days') AS invoices_12m,
              COUNT(DISTINCT mtrl) FILTER (WHERE trndate >= now() - interval '365 days') AS items_12m,
              MAX(trndate) AS last_purchase
       FROM ${s}.f_purchase_lines GROUP BY trdr
     ),
     lead AS (
       SELECT trdr, COUNT(*) AS orders_received,
              AVG(lead_days)::numeric(16,1) AS lead_days_avg,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY lead_days)::numeric(16,1) AS lead_days_median,
              percentile_cont(0.9) WITHIN GROUP (ORDER BY lead_days)::numeric(16,1) AS lead_days_p90,
              STDDEV_SAMP(lead_days)::numeric(16,1) AS lead_days_stddev
       FROM ${s}.m_lead_times WHERE ordered >= now() - interval '730 days' GROUP BY trdr
     ),
     price AS (
       -- weighted unit-price change of the same items, last 12 months vs the 12 before
       SELECT trdr, (100 * SUM(now_price * now_qty) / NULLIF(SUM(prev_price * now_qty), 0) - 100)::numeric(16,2) AS price_change_pct
       FROM (
         SELECT trdr, mtrl,
                SUM(net) FILTER (WHERE trndate >= now() - interval '365 days') / NULLIF(SUM(qty) FILTER (WHERE trndate >= now() - interval '365 days'), 0) AS now_price,
                SUM(qty) FILTER (WHERE trndate >= now() - interval '365 days') AS now_qty,
                SUM(net) FILTER (WHERE trndate < now() - interval '365 days') / NULLIF(SUM(qty) FILTER (WHERE trndate < now() - interval '365 days'), 0) AS prev_price
         FROM ${s}.f_purchase_lines WHERE trndate >= now() - interval '730 days' AND sign = 1 AND qty > 0
         GROUP BY trdr, mtrl
       ) x WHERE now_price IS NOT NULL AND prev_price IS NOT NULL AND now_qty > 0
       GROUP BY trdr
     ),
     total AS (SELECT SUM(spend_12m) AS t FROM spend)
     SELECT sp.trdr,
            COALESCE(sp.spend_12m, 0)::numeric(19,2) AS spend_12m,
            COALESCE(sp.spend_prev_12m, 0)::numeric(19,2) AS spend_prev_12m,
            CASE WHEN sp.spend_prev_12m > 0 THEN (100 * (COALESCE(sp.spend_12m, 0) - sp.spend_prev_12m) / sp.spend_prev_12m)::numeric(16,2) END AS spend_growth_pct,
            (100 * COALESCE(sp.spend_12m, 0) / NULLIF((SELECT t FROM total), 0))::numeric(16,2) AS spend_share_pct,
            COALESCE(sp.invoices_12m, 0) AS invoices_12m, COALESCE(sp.items_12m, 0) AS items_12m, sp.last_purchase,
            COALESCE(l.orders_received, 0) AS orders_received,
            l.lead_days_avg, l.lead_days_median, l.lead_days_p90, l.lead_days_stddev,
            p.price_change_pct
     FROM spend sp LEFT JOIN lead l ON l.trdr = sp.trdr LEFT JOIN price p ON p.trdr = sp.trdr`,
    [],
    ["trdr"],
  );
}

export type MartsReport = { built: string[]; skipped: string[]; ms: number };

/** Rebuilds every mart whose inputs exist. Records the result on the tenant. */
export async function buildBiMarts(tenantId: string): Promise<MartsReport> {
  const started = Date.now();
  const settings = await getBiSettings(tenantId);
  const schema = schemaName(tenantId);
  const built: string[] = [];
  const skipped: string[] = [];
  try {
    await withWarehouse(async (db) => {
      await db.query("SET statement_timeout = '300s'");
      // Series used in new documents count from the first rebuild (see lib/doc-series).
      await db.query("BEGIN");
      try {
        await buildDocSeries(db, tenantId);
        await db.query("COMMIT");
      } catch (err) {
        await db.query("ROLLBACK");
        throw err;
      }
      const docCols = { lnetamnt: "numeric(19,6)", sumlamnt: "numeric(19,6)", insdate: "timestamp", salesman: "bigint", payment: "bigint" };
      const lineCols = { lnetlineval: "numeric(19,6)", netlineval: "numeric(19,6)", salesman: "bigint", findocs: "bigint", whouse: "bigint" };
      const has = {
        sales: (await ensureColumns(db, schema, "sales_docs", docCols)) && (await ensureColumns(db, schema, "sales_lines", lineCols)),
        purchases: (await ensureColumns(db, schema, "purchase_docs", docCols)) && (await ensureColumns(db, schema, "purchase_lines", lineCols)),
        series: await tableExists(db, schema, "doc_series"),
        items: await ensureColumns(db, schema, "items", { mtrmark: "bigint" }),
        costs: await ensureColumns(db, schema, "item_costs", { purprice1: "numeric(19,6)" }),
        stock: await tableExists(db, schema, "stock_balances"),
        customers: await tableExists(db, schema, "customers"),
      };
      // Place of each customer by postal code (cubes: region / periphery). customers.zip may be
      // missing on imports from before it was added.
      if (has.customers) await ensureColumns(db, schema, "customers", { zip: "text", city: "text" });
      await db.query("BEGIN");
      try {
        await db.query(`CREATE TABLE IF NOT EXISTS ${qi(schema)}.gr_regions (prefix text PRIMARY KEY, region text NOT NULL, periphery text NOT NULL)`);
        await db.query(`DELETE FROM ${qi(schema)}.gr_regions`);
        await db.query(
          `INSERT INTO ${qi(schema)}.gr_regions SELECT * FROM jsonb_to_recordset($1::jsonb) AS r(prefix text, region text, periphery text)`,
          [JSON.stringify(GR_REGIONS)],
        );
        await db.query("COMMIT");
      } catch (err) {
        await db.query("ROLLBACK");
        throw err;
      }
      if (!has.costs) {
        await db.query(`CREATE TABLE IF NOT EXISTS ${qi(schema)}.item_costs (mtrl bigint, fiscprd int, standcost numeric(19,6), purlprice numeric(19,6), purprice1 numeric(19,6), "_synced_at" timestamp NOT NULL DEFAULT now(), PRIMARY KEY (mtrl, fiscprd))`);
      }
      if (has.purchases && has.series) {
        await buildPurchaseFacts(db, schema);
        built.push("f_purchase_lines", "m_lead_times");
      } else skipped.push("f_purchase_lines", "m_lead_times");
      if (has.sales && has.series) {
        await buildSalesFacts(db, schema, has.purchases && has.series);
        await buildCustomerStats(db, schema);
        built.push("f_sales_lines", "m_customer_stats");
        if (has.items) {
          await buildItemStats(db, schema, settings, { purchases: has.purchases && has.series, stock: has.stock });
          built.push("m_item_stats");
        } else skipped.push("m_item_stats");
      } else skipped.push("f_sales_lines", "m_customer_stats", "m_item_stats");
      if (has.purchases && has.series) {
        await buildSupplierStats(db, schema);
        built.push("m_supplier_stats");
      }
      built.push(...(await buildLedgerMarts(db, schema, settings)));
    });
    await prisma.tenant.update({ where: { id: tenantId }, data: { biBuiltAt: new Date(), biBuildError: null } });
  } catch (err) {
    await prisma.tenant.update({ where: { id: tenantId }, data: { biBuildError: (err as Error).message.slice(0, 500) } });
    throw err;
  }
  return { built, skipped, ms: Date.now() - started };
}
