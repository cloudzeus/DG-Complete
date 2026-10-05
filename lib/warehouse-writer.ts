import "server-only";
import { Client } from "pg";
import { openCredentials } from "@/lib/connections";
import { getCubeDeployment } from "@/lib/cube";
import { schemaName } from "@/lib/warehouse";

// Writes mirrored SoftOne rows into typed tables of a tenant schema (t_<tenantId>) in the Cube
// warehouse, as the warehouse owner. The tenant's read-only role r_<tenantId> gets SELECT through
// the schema's default privileges (set up by provisioning).

export type ColumnType = "int" | "numeric" | "text" | "timestamp";
export type Columns = Record<string, ColumnType>; // SoftOne FIELD → type

const PG_TYPE: Record<ColumnType, string> = {
  int: "bigint",
  numeric: "numeric(19,6)",
  text: "text",
  timestamp: "timestamp",
};

const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
const col = (field: string) => field.toLowerCase();
const q = (ident: string) => {
  if (!IDENT.test(ident)) throw new Error(`Invalid identifier: ${ident}`);
  return `"${ident}"`;
};

export type WriteTarget = {
  tenantId: string;
  table: string; // e.g. gl_lines
  columns: Columns;
  keyFields: string[];
};

export async function withWarehouse<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const deployment = await getCubeDeployment();
  const conn = deployment?.warehouseConnection;
  if (!conn) throw new Error("Ο Cube server δεν έχει ρυθμιστεί (Ρυθμίσεις → Cube server).");
  const creds = openCredentials(conn.id, conn.credentialsEnc);
  const db = new Client({
    host: conn.host,
    port: conn.port,
    database: conn.database,
    user: creds.username,
    password: creds.password,
    ssl: conn.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10_000,
  });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

/** Creates the table (and any new columns) with a primary key on the job's key fields. */
async function ensureTable(db: Client, t: WriteTarget) {
  const schema = q(schemaName(t.tenantId));
  const table = q(t.table);
  const defs = Object.entries(t.columns).map(([f, type]) => `${q(col(f))} ${PG_TYPE[type]}`);
  const pk = t.keyFields.map((k) => q(col(k))).join(", ");
  await db.query(
    `CREATE TABLE IF NOT EXISTS ${schema}.${table} (${defs.join(", ")}, "_synced_at" timestamp NOT NULL DEFAULT now(), PRIMARY KEY (${pk}))`,
  );
  for (const [f, type] of Object.entries(t.columns)) {
    await db.query(`ALTER TABLE ${schema}.${table} ADD COLUMN IF NOT EXISTS ${q(col(f))} ${PG_TYPE[type]}`);
  }
}

/** Keeps the last row per primary key (a table read without the COMPANY filter may repeat ids). */
function dedupe(rows: Record<string, unknown>[], keyFields: string[]) {
  const keys = keyFields.map(col);
  const map = new Map<string, Record<string, unknown>>();
  for (const r of rows) map.set(keys.map((k) => String(r[k])).join("|"), r);
  return [...map.values()];
}

/** Normalises S1 values for PostgreSQL ("" → null, numbers from strings, dates as-is). */
function clean(rows: Record<string, unknown>[], columns: Columns) {
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [f, type] of Object.entries(columns)) {
      let v = r[f] ?? r[f.toUpperCase()];
      if (v === "" || v === undefined) v = null;
      if (v !== null && (type === "int" || type === "numeric")) {
        const n = Number(typeof v === "string" ? v.replace(",", ".") : v);
        v = Number.isFinite(n) ? (type === "int" ? Math.trunc(n) : n) : null;
      }
      out[col(f)] = v;
    }
    return out;
  });
}

const BATCH = 1000;

async function insertBatches(db: Client, t: WriteTarget, rows: Record<string, unknown>[], upsert: boolean) {
  const schema = q(schemaName(t.tenantId));
  const table = q(t.table);
  const cols = Object.keys(t.columns).map(col);
  const recordDef = Object.entries(t.columns)
    .map(([f, type]) => `${q(col(f))} ${PG_TYPE[type]}`)
    .join(", ");
  const keyCols = t.keyFields.map(col);
  const updates = cols.filter((c) => !keyCols.includes(c)).map((c) => `${q(c)} = EXCLUDED.${q(c)}`);
  const conflict = upsert
    ? `ON CONFLICT (${keyCols.map(q).join(", ")}) DO UPDATE SET ${[...updates, `"_synced_at" = now()`].join(", ")}`
    : `ON CONFLICT (${keyCols.map(q).join(", ")}) DO NOTHING`;
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const res = await db.query(
      `INSERT INTO ${schema}.${table} (${cols.map(q).join(", ")})
       SELECT ${cols.map(q).join(", ")} FROM jsonb_to_recordset($1::jsonb) AS r(${recordDef})
       ${conflict}`,
      [JSON.stringify(batch)],
    );
    written += res.rowCount ?? 0;
  }
  return written;
}

/** Upsert by primary key (incremental by an update timestamp). */
export async function upsertRows(t: WriteTarget, rows: Record<string, unknown>[]) {
  return withWarehouse(async (db) => {
    await ensureTable(db, t);
    await db.query("BEGIN");
    try {
      const n = await insertBatches(db, t, dedupe(clean(rows, t.columns), t.keyFields), true);
      await db.query("COMMIT");
      return n;
    } catch (err) {
      await db.query("ROLLBACK");
      throw err;
    }
  });
}

/**
 * Replaces every row with dateField >= from (or the whole table when from is null) by `rows`,
 * atomically — so edits, cancellations and deletions in SoftOne are reflected.
 */
export async function replaceRows(t: WriteTarget, rows: Record<string, unknown>[], window: { dateField: string; from: Date } | null) {
  return withWarehouse(async (db) => {
    await ensureTable(db, t);
    const schema = q(schemaName(t.tenantId));
    const table = q(t.table);
    await db.query("BEGIN");
    try {
      if (window) await db.query(`DELETE FROM ${schema}.${table} WHERE ${q(col(window.dateField))} >= $1`, [window.from]);
      else await db.query(`DELETE FROM ${schema}.${table}`);
      const n = await insertBatches(db, t, dedupe(clean(rows, t.columns), t.keyFields), true);
      await db.query("COMMIT");
      return n;
    } catch (err) {
      await db.query("ROLLBACK");
      throw err;
    }
  });
}

/** Reads rows of a tenant table for the admin data viewer. */
export async function readRows(tenantId: string, table: string, limit = 5000) {
  return withWarehouse(async (db) => {
    const schema = q(schemaName(tenantId));
    const exists = await db.query("SELECT to_regclass($1) AS t", [`${schemaName(tenantId)}.${table}`]);
    if (!exists.rows[0]?.t) return { rows: [] as Record<string, unknown>[], total: 0 };
    const total = await db.query(`SELECT count(*)::int AS n FROM ${schema}.${q(table)}`);
    const res = await db.query(`SELECT * FROM ${schema}.${q(table)} LIMIT ${Math.min(limit, 20000)}`);
    return { rows: res.rows as Record<string, unknown>[], total: total.rows[0].n as number };
  });
}

/** Row counts of several tables of a tenant schema (missing tables → 0). Never throws. */
export async function countRows(tenantId: string, tables: string[]): Promise<Record<string, number>> {
  if (!tables.length) return {};
  try {
    return await withWarehouse(async (db) => {
      const out: Record<string, number> = {};
      for (const t of tables) {
        const exists = await db.query("SELECT to_regclass($1) AS t", [`${schemaName(tenantId)}.${t}`]);
        out[t] = exists.rows[0]?.t
          ? ((await db.query(`SELECT count(*)::int AS n FROM ${q(schemaName(tenantId))}.${q(t)}`)).rows[0].n as number)
          : 0;
      }
      return out;
    });
  } catch {
    return {};
  }
}
