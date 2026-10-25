import "server-only";
import { Client as PgClient } from "pg";
import mysql from "mysql2/promise";
import mssql from "mssql";
import { decryptJson, encryptJson } from "@/lib/crypto";
import type { ConnectionEngine } from "@/lib/generated/prisma/enums";

export type ConnectionCredentials = { username: string; password: string };

export const DEFAULT_PORTS: Record<ConnectionEngine, number> = {
  POSTGRES: 5432,
  MYSQL: 3306,
  MSSQL: 1433,
};

// AAD binds a ciphertext to its row: a blob copied onto another connection fails to decrypt.
const aad = (connectionId: string) => `data_connection:${connectionId}`;

export function sealCredentials(connectionId: string, creds: ConnectionCredentials): string {
  return encryptJson(creds, aad(connectionId));
}

export function openCredentials(connectionId: string, envelope: string): ConnectionCredentials {
  return decryptJson<ConnectionCredentials>(envelope, aad(connectionId));
}

export type ConnectionTarget = {
  engine: ConnectionEngine;
  host: string;
  port: number;
  database: string;
  ssl: boolean;
} & ConnectionCredentials;

export type TestResult = { ok: true; serverVersion: string; latencyMs: number } | { ok: false; error: string };

const TIMEOUT_MS = 8000;

/** Opens a connection, runs a trivial query and closes it. Never throws. */
export async function testConnection(t: ConnectionTarget): Promise<TestResult> {
  const started = Date.now();
  try {
    let serverVersion = "";
    if (t.engine === "POSTGRES") {
      const client = new PgClient({
        host: t.host,
        port: t.port,
        database: t.database,
        user: t.username,
        password: t.password,
        ssl: t.ssl ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: TIMEOUT_MS,
        statement_timeout: TIMEOUT_MS,
      });
      await client.connect();
      try {
        const res = await client.query<{ v: string }>("select version() as v");
        serverVersion = res.rows[0]?.v ?? "";
      } finally {
        await client.end();
      }
    } else if (t.engine === "MYSQL") {
      const conn = await mysql.createConnection({
        host: t.host,
        port: t.port,
        database: t.database,
        user: t.username,
        password: t.password,
        ssl: t.ssl ? { rejectUnauthorized: false } : undefined,
        connectTimeout: TIMEOUT_MS,
      });
      try {
        const [rows] = await conn.query("select version() as v");
        serverVersion = (rows as { v: string }[])[0]?.v ?? "";
      } finally {
        await conn.end();
      }
    } else {
      const pool = await new mssql.ConnectionPool({
        server: t.host,
        port: t.port,
        database: t.database,
        user: t.username,
        password: t.password,
        connectionTimeout: TIMEOUT_MS,
        requestTimeout: TIMEOUT_MS,
        options: { encrypt: t.ssl, trustServerCertificate: true },
      }).connect();
      try {
        const res = await pool.request().query<{ v: string }>("select @@version as v");
        serverVersion = res.recordset[0]?.v ?? "";
      } finally {
        await pool.close();
      }
    }
    return { ok: true, serverVersion: serverVersion.split("\n")[0].slice(0, 200), latencyMs: Date.now() - started };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 500) : String(err) };
  }
}
