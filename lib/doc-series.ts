import "server-only";
import type { Client } from "pg";
import { classifySeries } from "@/lib/pnl-templates";
import { prisma } from "@/lib/prisma";
import { schemaName } from "@/lib/warehouse";
import { withWarehouse } from "@/lib/warehouse-writer";

// doc_series: every document series of the tenant with its sign in sales / purchases
// (1 invoice / receipt, -1 credit note / return, 0 = orders, offers, delivery notes …).
//
// SoftOne's SERIES table does not always return every series (user rights, missing rows): on some
// installations the main invoice series are absent, so their documents were silently dropped and
// only the credit notes counted. The series are therefore collected from three places:
//   1. SERIES (name of the series)
//   2. the series actually used in sales_docs / purchase_docs, named by their document type (FPRMS)
//   3. admin overrides (DocSeriesOverride) — always win
// seriesHealth() then flags what still looks wrong (unnamed series with turnover, negative sales).

const SALES = 1351;
const PURCHASES = 1251;

const exists = async (db: Client, schema: string, table: string) => !!(await db.query("SELECT to_regclass($1) AS t", [`"${schema}".${table}`])).rows[0]?.t;

async function hasColumn(db: Client, schema: string, table: string, column: string) {
  const r = await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3", [schema, table, column]);
  return r.rowCount! > 0;
}

type Origin = "series" | "doc_type" | "unknown";
export type DocSeriesRow = { series: number; sosource: number | null; name: string | null; fprms: number | null; origin: Origin; auto: number; sign: number };

async function collect(db: Client, tenantId: string): Promise<DocSeriesRow[]> {
  const schema = schemaName(tenantId);
  const s = `"${schema}"`;
  const named = new Map<number, { sosource: number | null; name: string | null; fprms: number | null }>();
  if (await exists(db, schema, "series")) {
    const fprms = (await hasColumn(db, schema, "series", "fprms")) ? "fprms::int" : "NULL::int";
    for (const r of (await db.query(`SELECT series::int AS series, sosource::int AS sosource, name, ${fprms} AS fprms FROM ${s}.series`)).rows) {
      named.set(r.series, { sosource: r.sosource, name: r.name, fprms: r.fprms });
    }
  }
  const types = new Map<string, string>();
  if (await exists(db, schema, "doc_types")) {
    for (const r of (await db.query(`SELECT sosource::int AS sosource, fprms::int AS fprms, name FROM ${s}.doc_types`)).rows) {
      if (r.name) types.set(`${r.sosource}:${r.fprms}`, r.name);
    }
  }
  const used = new Map<number, { sosource: number; fprms: number | null }>();
  for (const [table, sosource] of [["sales_docs", SALES], ["purchase_docs", PURCHASES]] as const) {
    if (!(await exists(db, schema, table))) continue;
    const fprms = (await hasColumn(db, schema, table, "fprms")) ? "MAX(fprms)::int" : "NULL::int";
    for (const r of (await db.query(`SELECT series::int AS series, ${fprms} AS fprms FROM ${s}.${table} WHERE series IS NOT NULL GROUP BY series`)).rows) {
      used.set(r.series, { sosource, fprms: r.fprms });
    }
  }
  const overrides = new Map((await prisma.docSeriesOverride.findMany({ where: { tenantId } })).map((o) => [o.series, o.sign]));

  const rows: DocSeriesRow[] = [];
  for (const series of new Set([...named.keys(), ...used.keys()])) {
    const n = named.get(series);
    const u = used.get(series);
    const sosource = n?.sosource ?? u?.sosource ?? null;
    const fprms = n?.fprms ?? u?.fprms ?? null;
    // The document type of the series; on most installations its code equals the series code.
    const typeName = types.get(`${sosource}:${fprms ?? series}`) ?? types.get(`${sosource}:${series}`) ?? null;
    const name = n?.name || typeName;
    const origin: Origin = n?.name ? "series" : typeName ? "doc_type" : "unknown";
    const c = name ? classifySeries(name) : { include: false, negate: false };
    const auto = c.include ? (c.negate ? -1 : 1) : 0;
    rows.push({ series, sosource, name, fprms, origin, auto, sign: overrides.get(series) ?? auto });
  }
  return rows;
}

/** Rebuilds t_<tenant>.doc_series (inside the caller's connection; no transaction of its own). */
export async function buildDocSeries(db: Client, tenantId: string) {
  const schema = schemaName(tenantId);
  const s = `"${schema}"`;
  await db.query(`CREATE TABLE IF NOT EXISTS ${s}.doc_series (series bigint PRIMARY KEY, sosource int, name text, sign int NOT NULL)`);
  await db.query(`ALTER TABLE ${s}.doc_series ADD COLUMN IF NOT EXISTS fprms int, ADD COLUMN IF NOT EXISTS origin text, ADD COLUMN IF NOT EXISTS auto_sign int`);
  // The cubes read company-currency amounts; tables imported before they were added get them (NULL → NETAMNT).
  for (const t of ["sales_docs", "purchase_docs"]) {
    if (await exists(db, schema, t)) {
      await db.query(`ALTER TABLE ${s}.${t} ADD COLUMN IF NOT EXISTS lnetamnt numeric(19,6), ADD COLUMN IF NOT EXISTS sumlamnt numeric(19,6)`);
    }
  }
  const rows = await collect(db, tenantId);
  await db.query(`DELETE FROM ${s}.doc_series`);
  if (!rows.length) return;
  await db.query(
    `INSERT INTO ${s}.doc_series (series, sosource, name, sign, fprms, origin, auto_sign)
     SELECT series, sosource, name, sign, fprms, origin, auto FROM jsonb_to_recordset($1::jsonb)
       AS r(series bigint, sosource int, name text, sign int, fprms int, origin text, auto int)
     ON CONFLICT (series) DO NOTHING`,
    [JSON.stringify(rows)],
  );
}

export async function rebuildDocSeries(tenantId: string) {
  await withWarehouse(async (db) => {
    await db.query("BEGIN");
    try {
      await buildDocSeries(db, tenantId);
      await db.query("COMMIT");
    } catch (err) {
      await db.query("ROLLBACK");
      throw err;
    }
  });
}

// ───────────── Health check & review ─────────────

export type SeriesUsage = {
  series: number;
  kind: "sales" | "purchases";
  name: string | null;
  origin: Origin | "override";
  auto: number;
  sign: number;
  docs: number;
  amount: number;
};
export type SeriesIssue = { level: "error" | "warning"; message: string };
export type SeriesReview = { rows: SeriesUsage[]; issues: SeriesIssue[]; sales: number | null; purchases: number | null };

const eur = (v: number) => `${Math.round(v).toLocaleString("el-GR")} €`;

/** Series used in the last 12 months with their volume, and what looks misclassified. */
export async function seriesReview(tenantId: string): Promise<SeriesReview> {
  const schema = schemaName(tenantId);
  const s = `"${schema}"`;
  const overrides = new Set((await prisma.docSeriesOverride.findMany({ where: { tenantId }, select: { series: true } })).map((o) => o.series));
  return withWarehouse(async (db) => {
    if (!(await exists(db, schema, "doc_series"))) return { rows: [], issues: [], sales: null, purchases: null };
    const rows: SeriesUsage[] = [];
    for (const [table, kind] of [["sales_docs", "sales"], ["purchase_docs", "purchases"]] as const) {
      if (!(await exists(db, schema, table))) continue;
      const cancel = (await hasColumn(db, schema, table, "iscancel")) ? "AND COALESCE(d.iscancel, 0) = 0" : "";
      const amount = (await hasColumn(db, schema, table, "lnetamnt")) ? "COALESCE(d.lnetamnt, d.netamnt)" : "d.netamnt";
      const res = await db.query(
        `SELECT d.series::int AS series, ds.name, COALESCE(ds.origin, 'series') AS origin,
                COALESCE(ds.auto_sign, ds.sign, 0)::int AS auto, COALESCE(ds.sign, 0)::int AS sign,
                COUNT(*)::int AS docs, COALESCE(SUM(${amount}), 0)::float AS amount
         FROM ${s}.${table} d LEFT JOIN ${s}.doc_series ds ON ds.series = d.series
         WHERE d.trndate >= now() - interval '12 months' ${cancel}
         GROUP BY 1, 2, 3, 4, 5 ORDER BY abs(COALESCE(SUM(${amount}), 0)) DESC`,
      );
      for (const r of res.rows) rows.push({ ...r, kind, origin: overrides.has(r.series) ? "override" : r.origin });
    }

    const issues: SeriesIssue[] = [];
    const total = (kind: "sales" | "purchases") => {
      const k = rows.filter((r) => r.kind === kind);
      return k.length ? k.reduce((a, r) => a + r.amount * r.sign, 0) : null;
    };
    const sales = total("sales");
    const purchases = total("purchases");
    for (const kind of ["sales", "purchases"] as const) {
      const k = rows.filter((r) => r.kind === kind);
      if (!k.length) continue;
      const label = kind === "sales" ? "πωλήσεις" : "αγορές";
      const net = kind === "sales" ? sales! : purchases!;
      const gross = k.reduce((a, r) => a + Math.abs(r.amount), 0);
      if (!k.some((r) => r.sign === 1 && r.docs > 0)) issues.push({ level: "error", message: `Καμία σειρά τιμολόγησης δεν μετρά στις ${label} — τα dashboards θα δείχνουν μόνο επιστροφές.` });
      else if (net < 0) issues.push({ level: "error", message: `Οι καθαρές ${label} 12 μηνών βγαίνουν αρνητικές (${eur(net)}): κάποιες σειρές τιμολόγησης δεν μετρούν.` });
      const unknown = k.filter((r) => r.origin === "unknown" && r.amount !== 0);
      const unknownAmount = unknown.reduce((a, r) => a + Math.abs(r.amount), 0);
      if (unknown.length) {
        issues.push({
          level: gross && unknownAmount / gross > 0.05 ? "error" : "warning",
          message: `${unknown.length} σειρές ${label} χωρίς όνομα στο SoftOne (${eur(unknownAmount)}) — ορίστε αν μετρούν.`,
        });
      }
    }
    return { rows, issues, sales, purchases };
  });
}

/** Admin override: null = back to the automatic classification. */
export async function setSeriesSign(tenantId: string, series: number, sign: number | null, userId: string) {
  if (sign === null) await prisma.docSeriesOverride.deleteMany({ where: { tenantId, series } });
  else await prisma.docSeriesOverride.upsert({ where: { tenantId_series: { tenantId, series } }, update: { sign, updatedById: userId }, create: { tenantId, series, sign, updatedById: userId } });
  await rebuildDocSeries(tenantId);
}
