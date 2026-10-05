import "server-only";
import type { Client } from "pg";
import { prisma } from "@/lib/prisma";
import { schemaName } from "@/lib/warehouse";
import { withWarehouse } from "@/lib/warehouse-writer";
import {
  classifySeries,
  commercialTemplate,
  EGLS_TEMPLATE,
  SECTION_ORDER,
  TEMPLATES,
  type SeriesInfo,
  type TemplateKey,
  type TemplateLine,
} from "@/lib/pnl-templates";

// Builds t_<tenant>.fin_fact (one row per source line, amount = effect on profit) and
// t_<tenant>.pnl_lines (the tenant's P&L structure) from the rules kept in the app DB.
// Source-agnostic: Cube and the dashboards only read fin_fact + pnl_lines.

/** Tables whose refresh changes the P&L. */
export const PNL_SOURCE_TABLES = new Set(["gl_lines", "gl_accounts", "sales_docs", "purchase_docs", "series"]);

const exists = async (db: Client, schema: string, table: string) =>
  !!(await db.query("SELECT to_regclass($1) AS t", [`${schema}.${table}`])).rows[0]?.t;

async function readSeries(tenantId: string): Promise<SeriesInfo[]> {
  return withWarehouse(async (db) => {
    const schema = schemaName(tenantId);
    if (!(await exists(db, schema, "series"))) return [];
    const res = await db.query(`SELECT series::int AS series, name, sosource::int AS sosource FROM "${schema}".series`);
    return res.rows as SeriesInfo[];
  });
}

/**
 * doc_series: the invoicing series of the tenant with their sign (1 invoice/receipt, -1 credit
 * note/return, 0 = not a sale/purchase: orders, offers, delivery notes). Used by the sales and
 * purchases cubes. Rebuilt with fin_fact and after every series import.
 */
async function buildDocSeries(db: Client, schema: string) {
  const s = `"${schema}"`;
  await db.query(`CREATE TABLE IF NOT EXISTS ${s}.doc_series (
    series bigint PRIMARY KEY, sosource int, name text, sign int NOT NULL)`);
  await db.query(`DELETE FROM ${s}.doc_series`);
  // The cubes read company-currency amounts; tables imported before they were added get them (NULL → NETAMNT).
  for (const t of ["sales_docs", "purchase_docs"]) {
    if (await exists(db, schema, t)) {
      await db.query(`ALTER TABLE ${s}.${t} ADD COLUMN IF NOT EXISTS lnetamnt numeric(19,6), ADD COLUMN IF NOT EXISTS sumlamnt numeric(19,6)`);
    }
  }
  if (!(await exists(db, schema, "series"))) return;
  const rows = (await db.query(`SELECT series::bigint AS series, sosource::int AS sosource, name FROM ${s}.series`)).rows as SeriesInfo[];
  const data = rows.map((r) => {
    const c = classifySeries(r.name ?? "");
    return { series: r.series, sosource: r.sosource, name: r.name, sign: c.include ? (c.negate ? -1 : 1) : 0 };
  });
  await db.query(
    `INSERT INTO ${s}.doc_series SELECT * FROM jsonb_to_recordset($1::jsonb) AS r(series bigint, sosource int, name text, sign int)
     ON CONFLICT (series) DO NOTHING`,
    [JSON.stringify(data)],
  );
}

export async function rebuildDocSeries(tenantId: string) {
  await withWarehouse(async (db) => {
    await db.query("BEGIN");
    try {
      await buildDocSeries(db, schemaName(tenantId));
      await db.query("COMMIT");
    } catch (err) {
      await db.query("ROLLBACK");
      throw err;
    }
  });
}

/** Replaces the tenant's lines + rules with a template. */
export async function applyTemplate(tenantId: string, key: TemplateKey) {
  const lines: TemplateLine[] = key === "EGLS" ? EGLS_TEMPLATE : commercialTemplate(await readSeries(tenantId));
  await prisma.$transaction(async (tx) => {
    await tx.pnlLine.deleteMany({ where: { tenantId } });
    let order = 0;
    for (const l of lines) {
      order += 10;
      await tx.pnlLine.create({
        data: {
          tenantId,
          code: l.code,
          name: l.name,
          section: l.section,
          sortOrder: order,
          rules: { create: l.rules.map((r) => ({ source: r.source, pattern: r.pattern, negate: !!r.negate })) },
        },
      });
    }
    await tx.pnlConfig.upsert({
      where: { tenantId },
      create: { tenantId, source: TEMPLATES[key].source, template: key },
      update: { source: TEMPLATES[key].source, template: key },
    });
  });
  return lines.length;
}

/** Recreates fin_fact + pnl_lines atomically. Returns the number of fact rows. */
export async function rebuildFinFact(tenantId: string): Promise<number> {
  const lines = await prisma.pnlLine.findMany({ where: { tenantId }, include: { rules: true } });
  try {
    const rows = await withWarehouse(async (db) => {
      const schema = schemaName(tenantId);
      const s = `"${schema}"`;
      const has = {
        gl: (await exists(db, schema, "gl_lines")) && (await exists(db, schema, "gl_accounts")),
        sales: await exists(db, schema, "sales_docs"),
        purchases: await exists(db, schema, "purchase_docs"),
      };
      const rules = lines.flatMap((l) =>
        l.rules.map((r) => ({ line_code: l.code, source: r.source, pattern: r.pattern.trim(), negate: r.negate })),
      );
      const sectionSort = Object.fromEntries(SECTION_ORDER.map((sec, i) => [sec, (i + 1) * 10]));

      await db.query("BEGIN");
      try {
        await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`fin_fact:${tenantId}`]);
        await buildDocSeries(db, schema);
        await db.query(`CREATE TABLE IF NOT EXISTS ${s}.pnl_lines (
          code text PRIMARY KEY, name text NOT NULL, section text NOT NULL,
          section_sort int NOT NULL, sort_order int NOT NULL)`);
        await db.query(`CREATE TABLE IF NOT EXISTS ${s}.fin_fact (
          source text NOT NULL, line_code text NOT NULL, trndate timestamp, fiscprd int, period int,
          branch bigint, account_code text, account_name text, trdr bigint, series bigint,
          amount numeric(19,2) NOT NULL)`);
        await db.query(`CREATE INDEX IF NOT EXISTS fin_fact_year ON ${s}.fin_fact (fiscprd, period)`);
        await db.query(`DELETE FROM ${s}.pnl_lines`);
        await db.query(`DELETE FROM ${s}.fin_fact`);

        await db.query(
          `INSERT INTO ${s}.pnl_lines (code, name, section, section_sort, sort_order)
           SELECT * FROM jsonb_to_recordset($1::jsonb) AS r(code text, name text, section text, section_sort int, sort_order int)`,
          [JSON.stringify(lines.map((l) => ({ code: l.code, name: l.name, section: l.section, section_sort: sectionSort[l.section], sort_order: l.sortOrder })))],
        );

        await db.query(`CREATE TEMP TABLE _rules (line_code text, source text, pattern text, negate boolean) ON COMMIT DROP`);
        await db.query(
          `INSERT INTO _rules SELECT * FROM jsonb_to_recordset($1::jsonb) AS r(line_code text, source text, pattern text, negate boolean)`,
          [JSON.stringify(rules)],
        );

        // GL: periods 1–12 only (0 = opening, 1000 = closing entries that zero the P&L accounts).
        if (has.gl && rules.some((r) => r.source === "GL")) {
          await db.query(`
            CREATE TEMP TABLE _acc ON COMMIT DROP AS
            SELECT a.acnt, a.code, a.name, m.line_code, m.negate
            FROM ${s}.gl_accounts a
            CROSS JOIN LATERAL (
              SELECT r.line_code, r.negate FROM _rules r
              WHERE r.source = 'GL' AND (
                CASE WHEN right(r.pattern, 1) = '*' THEN a.code LIKE left(r.pattern, -1) || '%'
                     ELSE a.code = r.pattern OR a.code LIKE r.pattern || '.%' END)
              ORDER BY length(r.pattern) DESC LIMIT 1) m`);
          await db.query(`
            INSERT INTO ${s}.fin_fact (source, line_code, trndate, fiscprd, period, branch, account_code, account_name, trdr, amount)
            SELECT 'GL', a.line_code, l.trndate, l.fiscprd, l.period, l.branch, a.code, a.name, l.trdr,
                   (coalesce(l.credit, 0) - coalesce(l.debit, 0)) * CASE WHEN a.negate THEN -1 ELSE 1 END
            FROM ${s}.gl_lines l JOIN _acc a ON a.acnt = l.acnt
            WHERE l.period BETWEEN 1 AND 12 AND coalesce(l.iscancel, 0) = 0`);
        }

        // Commercial documents: net amount in company currency (LNETAMNT; NETAMNT is in the
        // document's currency), cancelled documents excluded.
        const docs = [
          { table: "sales_docs", source: "SALES", sign: 1, ok: has.sales },
          { table: "purchase_docs", source: "PURCHASES", sign: -1, ok: has.purchases },
        ];
        for (const d of docs) {
          if (!d.ok || !rules.some((r) => r.source === d.source)) continue;
          await db.query(
            `INSERT INTO ${s}.fin_fact (source, line_code, trndate, fiscprd, period, branch, trdr, series, amount)
             SELECT $1, r.line_code, f.trndate, coalesce(f.fiscprd, extract(year FROM f.trndate)::int),
                    coalesce(f.period, extract(month FROM f.trndate)::int), f.branch, f.trdr, f.series,
                    coalesce(f.lnetamnt, f.netamnt, 0) * $2 * CASE WHEN r.negate THEN -1 ELSE 1 END
             FROM ${s}.${d.table} f
             JOIN _rules r ON r.source = $1 AND (r.pattern = '*' OR r.pattern = f.series::text)
             WHERE coalesce(f.iscancel, 0) = 0`,
            [d.source, d.sign],
          );
        }

        const n = (await db.query(`SELECT count(*)::int AS n FROM ${s}.fin_fact`)).rows[0].n as number;
        await db.query("COMMIT");
        return n;
      } catch (err) {
        await db.query("ROLLBACK");
        throw err;
      }
    });
    await prisma.pnlConfig.updateMany({ where: { tenantId }, data: { builtAt: new Date(), buildRows: rows, buildError: null } });
    return rows;
  } catch (err) {
    const message = (err as Error).message.slice(0, 500);
    await prisma.pnlConfig.updateMany({ where: { tenantId }, data: { buildError: message } });
    throw err;
  }
}

/** Rebuilds after a source import, if the tenant has a P&L. Never throws (logged on the config). */
export async function rebuildAfterImport(tenantId: string, table: string | null) {
  if (!table || !PNL_SOURCE_TABLES.has(table)) return;
  if (table === "series") await rebuildDocSeries(tenantId).catch(() => undefined);
  if (!(await prisma.pnlConfig.findUnique({ where: { tenantId }, select: { tenantId: true } }))) return;
  await rebuildFinFact(tenantId).catch(() => undefined);
}

export type PnlPreview = {
  years: number[];
  year: number;
  /** line code → 12 monthly amounts */
  months: Record<string, number[]>;
  /** line code → total of the previous year (comparison) */
  previous: Record<string, number>;
};

/** Monthly P&L of a fiscal year from fin_fact (+ previous-year totals). */
export async function previewPnl(tenantId: string, year?: number): Promise<PnlPreview | null> {
  return withWarehouse(async (db) => {
    const schema = schemaName(tenantId);
    if (!(await exists(db, schema, "fin_fact"))) return null;
    const s = `"${schema}"`;
    const years = (await db.query(`SELECT DISTINCT fiscprd AS y FROM ${s}.fin_fact WHERE fiscprd IS NOT NULL ORDER BY 1 DESC`)).rows.map(
      (r) => Number(r.y),
    );
    if (!years.length) return { years: [], year: year ?? new Date().getFullYear(), months: {}, previous: {} };
    const y = year && years.includes(year) ? year : years[0];
    const res = await db.query(
      `SELECT line_code, fiscprd, period, sum(amount)::float8 AS amount FROM ${s}.fin_fact
       WHERE fiscprd IN ($1, $2) GROUP BY 1, 2, 3`,
      [y, y - 1],
    );
    const months: Record<string, number[]> = {};
    const previous: Record<string, number> = {};
    for (const r of res.rows) {
      if (Number(r.fiscprd) === y) {
        const m = (months[r.line_code] ??= Array(12).fill(0));
        const p = Number(r.period);
        if (p >= 1 && p <= 12) m[p - 1] += Number(r.amount);
      } else {
        previous[r.line_code] = (previous[r.line_code] ?? 0) + Number(r.amount);
      }
    }
    return { years, year: y, months, previous };
  });
}

export type UnmappedAccount = { code: string; name: string; amount: number; lines: number };

/**
 * GL accounts with movements in the year (periods 1–12) that no rule maps, within the account
 * groups the rules already use (e.g. 6x/7x/8x for ΕΓΛΣ) — the "what am I missing" list.
 */
export async function unmappedAccounts(tenantId: string, year: number): Promise<UnmappedAccount[]> {
  const rules = await prisma.pnlRule.findMany({ where: { line: { tenantId }, source: "GL" }, select: { pattern: true } });
  if (!rules.length) return [];
  const groups = [...new Set(rules.map((r) => r.pattern.replace(/\*$/, "").split(".")[0]).filter(Boolean))];
  const patterns = rules.map((r) => r.pattern.trim());
  return withWarehouse(async (db) => {
    const schema = schemaName(tenantId);
    if (!(await exists(db, schema, "gl_lines")) || !(await exists(db, schema, "gl_accounts"))) return [];
    const s = `"${schema}"`;
    const res = await db.query(
      `SELECT a.code, a.name, sum(coalesce(l.credit,0) - coalesce(l.debit,0))::float8 AS amount, count(*)::int AS lines
       FROM ${s}.gl_lines l JOIN ${s}.gl_accounts a ON a.acnt = l.acnt
       WHERE l.fiscprd = $1 AND l.period BETWEEN 1 AND 12 AND coalesce(l.iscancel, 0) = 0
         AND split_part(a.code, '.', 1) = ANY($2::text[])
         AND NOT EXISTS (
           SELECT 1 FROM unnest($3::text[]) p
           WHERE CASE WHEN right(p, 1) = '*' THEN a.code LIKE left(p, -1) || '%'
                      ELSE a.code = p OR a.code LIKE p || '.%' END)
       GROUP BY 1, 2 HAVING sum(coalesce(l.credit,0) - coalesce(l.debit,0)) <> 0
       ORDER BY abs(sum(coalesce(l.credit,0) - coalesce(l.debit,0))) DESC LIMIT 500`,
      [year, groups, patterns],
    );
    return res.rows as UnmappedAccount[];
  });
}

/** Series of the tenant (for the commercial rule editor). */
export async function tenantSeries(tenantId: string) {
  try {
    return await readSeries(tenantId);
  } catch {
    return [];
  }
}
