import "server-only";
import { Client } from "pg";
import { openCredentials } from "@/lib/connections";
import { getCubeDeployment, openCubeSecrets, tenantRolePassword } from "@/lib/cube";

// Tenant isolation in the Cube warehouse (e.g. cubebiproduction):
//   schema t_<tenantId>   — the tenant's data (written by the ingestion worker as the warehouse owner)
//   role   r_<tenantId>   — LOGIN, SELECT-only on its schema, search_path pinned to it in this database
// Cube connects as r_<tenantId> with password HMAC(WH_ROLE_SECRET, tenantId).

const TENANT_ID = /^[a-z0-9]{1,40}$/;

export const schemaName = (tenantId: string) => `t_${tenantId}`;
/** NOLOGIN group of every tenant role — lets pg_hba.conf confine them all to the warehouse database. */
export const TENANT_GROUP = "cube_tenants";
export const roleName = (tenantId: string) => `r_${tenantId}`;

function assertTenantId(tenantId: string) {
  // Identifiers are interpolated into DDL, so they must be strictly validated.
  if (!TENANT_ID.test(tenantId)) throw new Error(`Invalid tenant id for warehouse: ${tenantId}`);
}

async function warehouseContext() {
  const deployment = await getCubeDeployment();
  const conn = deployment?.warehouseConnection;
  if (!deployment || !conn) throw new Error("Ο Cube server δεν έχει ρυθμιστεί (Admin → Cube server).");
  const creds = openCredentials(conn.id, conn.credentialsEnc);
  const secrets = openCubeSecrets(deployment.secretsEnc);
  const target = {
    host: conn.host,
    port: conn.port,
    database: conn.database,
    ssl: conn.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 8000,
  } as const;
  return { deployment, conn, creds, secrets, target };
}

async function withAdmin<T>(fn: (client: Client, database: string) => Promise<T>): Promise<T> {
  const { target, creds } = await warehouseContext();
  const client = new Client({ ...target, user: creds.username, password: creds.password });
  await client.connect();
  try {
    return await fn(client, target.database);
  } finally {
    await client.end();
  }
}

const q = (ident: string) => `"${ident.replaceAll('"', '""')}"`;

/** Creates or repairs schema + role for a tenant. Idempotent. */
export async function provisionTenantWarehouse(tenantId: string) {
  assertTenantId(tenantId);
  const { secrets } = await warehouseContext();
  const schema = schemaName(tenantId);
  const role = roleName(tenantId);
  // Hex digest → safe inside a SQL string literal.
  const password = tenantRolePassword(secrets.roleSecret, tenantId);

  await withAdmin(async (db, database) => {
    await db.query("BEGIN");
    try {
      // Database-wide hardening (idempotent): nobody connects or uses public by default.
      await db.query(`GRANT CONNECT ON DATABASE ${q(database)} TO CURRENT_USER`);
      await db.query(`REVOKE CONNECT ON DATABASE ${q(database)} FROM PUBLIC`);
      await db.query("REVOKE ALL ON SCHEMA public FROM PUBLIC");

      const exists = await db.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
      if (exists.rowCount) {
        await db.query(`ALTER ROLE ${q(role)} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT 10 PASSWORD '${password}'`);
      } else {
        await db.query(`CREATE ROLE ${q(role)} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT 10 PASSWORD '${password}'`);
      }
      const group = await db.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [TENANT_GROUP]);
      if (!group.rowCount) await db.query(`CREATE ROLE ${q(TENANT_GROUP)} NOLOGIN`);
      await db.query(`GRANT ${q(TENANT_GROUP)} TO ${q(role)}`);
      await db.query(`CREATE SCHEMA IF NOT EXISTS ${q(schema)}`);
      await db.query(`ALTER ROLE ${q(role)} IN DATABASE ${q(database)} SET search_path = ${q(schema)}`);
      await db.query(`ALTER ROLE ${q(role)} IN DATABASE ${q(database)} SET statement_timeout = '60s'`);
      await db.query(`ALTER ROLE ${q(role)} IN DATABASE ${q(database)} SET default_transaction_read_only = on`);
      await db.query(`GRANT CONNECT ON DATABASE ${q(database)} TO ${q(role)}`);
      await db.query(`GRANT USAGE ON SCHEMA ${q(schema)} TO ${q(role)}`);
      await db.query(`GRANT SELECT ON ALL TABLES IN SCHEMA ${q(schema)} TO ${q(role)}`);
      // Tables the warehouse owner creates later (ingestion) become readable automatically.
      await db.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${q(schema)} GRANT SELECT ON TABLES TO ${q(role)}`);
      await db.query("COMMIT");
    } catch (err) {
      await db.query("ROLLBACK");
      throw err;
    }
  });
}

/** Suspends (NOLOGIN) or re-enables (LOGIN) the tenant's Cube access at the database level. */
export async function setTenantWarehouseLogin(tenantId: string, enabled: boolean) {
  assertTenantId(tenantId);
  await withAdmin((db) => db.query(`ALTER ROLE ${q(roleName(tenantId))} WITH ${enabled ? "LOGIN" : "NOLOGIN"}`));
}

export type WarehouseCheck = {
  ok: boolean;
  steps: { label: string; ok: boolean; detail?: string }[];
};

/** Logs in as r_<tenantId> exactly like Cube does, then checks isolation. */
export async function verifyTenantWarehouse(tenantId: string): Promise<WarehouseCheck> {
  assertTenantId(tenantId);
  const { target, secrets } = await warehouseContext();
  const steps: WarehouseCheck["steps"] = [];
  const client = new Client({
    ...target,
    user: roleName(tenantId),
    password: tenantRolePassword(secrets.roleSecret, tenantId),
  });
  try {
    await client.connect();
    steps.push({ label: `Σύνδεση ως ${roleName(tenantId)}`, ok: true });
  } catch (err) {
    steps.push({ label: `Σύνδεση ως ${roleName(tenantId)}`, ok: false, detail: (err as Error).message });
    return { ok: false, steps };
  }
  try {
    const sp = await client.query<{ s: string }>("SHOW search_path");
    const pathOk = sp.rows[0]?.s.replaceAll('"', "") === schemaName(tenantId);
    steps.push({ label: "search_path = " + schemaName(tenantId), ok: pathOk, detail: sp.rows[0]?.s });

    const ro = await client.query<{ s: string }>("SHOW default_transaction_read_only");
    steps.push({ label: "Μόνο ανάγνωση", ok: ro.rows[0]?.s === "on" });

    const others = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_namespace
       WHERE nspname LIKE 't\\_%' AND nspname <> $1 AND has_schema_privilege(nspname, 'USAGE')`,
      [schemaName(tenantId)],
    );
    const leaked = Number(others.rows[0]?.n ?? 0);
    steps.push({
      label: "Χωρίς πρόσβαση σε schemas άλλων πελατών",
      ok: leaked === 0,
      detail: leaked ? `${leaked} schema(s) προσβάσιμα` : undefined,
    });
  } finally {
    await client.end();
  }
  return { ok: steps.every((s) => s.ok), steps };
}
