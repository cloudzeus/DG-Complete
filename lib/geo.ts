import "server-only";
import { createHash } from "node:crypto";
import type { Client } from "pg";
import { geocode, getGeoSettings, mapboxToken } from "@/lib/mapbox";
import { prisma } from "@/lib/prisma";
import { hasService } from "@/lib/tenant-services";
import { schemaName } from "@/lib/warehouse";
import { withWarehouse } from "@/lib/warehouse-writer";

// Geocoding of customer addresses into <tenant schema>.customer_geo (one row per customer).
// Only customers with sales in the last 24 months, Greek addresses, and only when the address is
// new or changed (address_key) — each address is paid for once.

const qi = (s: string) => `"${s.replaceAll('"', '""')}"`;
const GREECE = 1000; // SoftOne COUNTRY of Greece

async function ensureTable(db: Client, s: string) {
  await db.query(`CREATE TABLE IF NOT EXISTS ${s}.customer_geo (
    trdr bigint PRIMARY KEY,
    address_key text NOT NULL,
    query text,
    lat double precision,
    lng double precision,
    precision text,
    confidence text,
    label text,
    status text NOT NULL,
    error text,
    geocoded_at timestamptz NOT NULL DEFAULT now()
  )`);
}

/** The text sent to Mapbox: «ΚΛΕΙΣΟΒΗΣ 62, 18539 ΠΕΙΡΑΙΑΣ». */
function addressQuery(c: { address: string | null; zip: string | null; city: string | null; district: string | null }) {
  const street = (c.address ?? "").replace(/\s+/g, " ").trim();
  const place = [c.zip?.trim(), (c.city ?? c.district ?? "").trim()].filter(Boolean).join(" ");
  return [street, place].filter(Boolean).join(", ");
}

const keyOf = (q: string) => createHash("sha1").update(q.toUpperCase()).digest("hex").slice(0, 16);

export type GeoRun = { tenantId: string; geocoded: number; notFound: number; errors: number; pending: number; error?: string };

export async function geocodeTenant(tenantId: string, limit: number): Promise<GeoRun> {
  const s = qi(schemaName(tenantId));
  const token = await mapboxToken();
  return withWarehouse(async (db) => {
    await ensureTable(db, s);
    const { rows } = await db.query(
      `WITH act AS (SELECT DISTINCT trdr FROM ${s}.f_sales_lines WHERE trndate >= now() - interval '24 months')
       SELECT c.trdr, c.address, c.zip, c.city, c.district, g.address_key
       FROM act JOIN ${s}.customers c USING (trdr) LEFT JOIN ${s}.customer_geo g ON g.trdr = c.trdr
       WHERE COALESCE(c.country, ${GREECE}) = ${GREECE}
         AND (NULLIF(TRIM(c.address), '') IS NOT NULL OR NULLIF(TRIM(c.zip), '') IS NOT NULL OR NULLIF(TRIM(c.city), '') IS NOT NULL)`,
    );
    const todo = rows
      .map((r) => ({ trdr: Number(r.trdr), query: addressQuery(r), old: r.address_key as string | null }))
      // Placeholders like «., . .» are not addresses — not worth a paid lookup.
      .filter((r) => /[\p{L}\p{N}]{2,}/u.test(r.query) && keyOf(r.query) !== r.old);
    const batch = todo.slice(0, limit);
    const result: GeoRun = { tenantId, geocoded: 0, notFound: 0, errors: 0, pending: todo.length - batch.length };

    // A few at a time — well under Mapbox's rate limit.
    for (let i = 0; i < batch.length; i += 5) {
      // Lookups in parallel, writes one at a time (one pg client = one query at a time).
      const results = await Promise.all(
        batch.slice(i, i + 5).map(async (c) => {
          try {
            return { c, g: await geocode(`${c.query}, Ελλάδα`, token), error: null as string | null };
          } catch (err) {
            return { c, g: null, error: (err as Error).message.slice(0, 300) };
          }
        }),
      );
      for (const { c, g, error } of results) {
        // A country / region level match would put the customer in the middle of nowhere.
        const vague = g && ["country", "region"].includes(g.precision);
        const status = error ? "error" : g && !vague ? "ok" : "not_found";
        if (status === "ok") result.geocoded++;
        else if (status === "not_found") result.notFound++;
        else result.errors++;
        // Errors are retried next run (no address_key stored for them).
        await db.query(
          `INSERT INTO ${s}.customer_geo (trdr, address_key, query, lat, lng, precision, confidence, label, status, error, geocoded_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
           ON CONFLICT (trdr) DO UPDATE SET address_key = EXCLUDED.address_key, query = EXCLUDED.query, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
             precision = EXCLUDED.precision, confidence = EXCLUDED.confidence, label = EXCLUDED.label, status = EXCLUDED.status,
             error = EXCLUDED.error, geocoded_at = now()`,
          [c.trdr, status === "error" ? "" : keyOf(c.query), c.query, g?.lat ?? null, g?.lng ?? null, g?.precision ?? null, g?.confidence ?? null, g?.label ?? null, status, error],
        );
      }
      if (result.errors >= 10 && result.geocoded === 0) {
        result.error = "Πολλά σφάλματα από το Mapbox — η εκτέλεση σταμάτησε.";
        break;
      }
    }
    return result;
  });
}

export type GeoStatus = { total: number; ok: number; notFound: number; errors: number; pending: number };

export async function geoStatus(tenantId: string): Promise<GeoStatus | null> {
  const s = qi(schemaName(tenantId));
  return withWarehouse(async (db) => {
    const exists = (await db.query(`SELECT to_regclass($1) AS t`, [`${schemaName(tenantId)}.customer_geo`])).rows[0].t;
    if (!exists) return null;
    const r = (
      await db.query(
        `WITH act AS (SELECT DISTINCT trdr FROM ${s}.f_sales_lines WHERE trndate >= now() - interval '24 months')
         SELECT COUNT(*)::int total,
                COUNT(*) FILTER (WHERE g.status = 'ok')::int ok,
                COUNT(*) FILTER (WHERE g.status = 'not_found')::int not_found,
                COUNT(*) FILTER (WHERE g.status = 'error')::int errors,
                COUNT(*) FILTER (WHERE g.trdr IS NULL)::int pending
         FROM act LEFT JOIN ${s}.customer_geo g USING (trdr)`,
      )
    ).rows[0];
    return { total: r.total, ok: r.ok, notFound: r.not_found, errors: r.errors, pending: r.pending };
  });
}

/** Scheduler: every tenant with the geo service, a batch each. */
export async function runGeocoding() {
  const settings = await getGeoSettings();
  if (!settings.enabled || !settings.tokenEnc) return { skipped: "disabled" };
  const tenants = await prisma.tenant.findMany({ where: { warehouseStatus: "READY" }, select: { id: true } });
  const out: GeoRun[] = [];
  for (const t of tenants) {
    if (!(await hasService(t.id, "geo"))) continue;
    try {
      out.push(await geocodeTenant(t.id, settings.batchSize));
    } catch (err) {
      out.push({ tenantId: t.id, geocoded: 0, notFound: 0, errors: 0, pending: 0, error: (err as Error).message.slice(0, 200) });
    }
  }
  return { runs: out };
}
