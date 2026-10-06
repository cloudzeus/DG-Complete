import "server-only";
import type { Client } from "pg";
import { prisma } from "@/lib/prisma";
import { hasService } from "@/lib/tenant-services";
import { schemaName } from "@/lib/warehouse";
import { withWarehouse } from "@/lib/warehouse-writer";

// Activity codes (ΚΑΔ) of customers by AFM from the registry service (afm2info), stored per
// tenant in <schema>.afm_registry (one row per AFM; refreshed after 180 days).

export async function getAfmSettings() {
  return (
    (await prisma.afmLookupSettings.findUnique({ where: { id: "default" } })) ?? (await prisma.afmLookupSettings.create({ data: { id: "default" } }))
  );
}

export type KadItem = { code: string; descr: string; main: boolean };
export type AfmInfo = {
  afm: string;
  name: string | null;
  title: string | null;
  legal: string | null;
  active: boolean;
  registered: string | null;
  mainKad: string | null;
  mainKadDescr: string | null;
  kads: KadItem[];
};

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function lookupAfm(url: string, afm: string): Promise<AfmInfo | null> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ afm }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`afm2info HTTP ${res.status}`);
  const body = (await res.json().catch(() => null)) as {
    basic_rec?: Record<string, unknown>;
    firm_act_tab?: { item?: Record<string, unknown>[] | Record<string, unknown> };
    error?: unknown;
  } | null;
  const b = body?.basic_rec;
  if (!b || !text(b.afm)) return null;
  const raw = body?.firm_act_tab?.item;
  const items = (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .map((i) => ({ code: String(i.firm_act_code ?? "").trim(), descr: String(i.firm_act_descr ?? "").trim(), main: String(i.firm_act_kind) === "1" }))
    .filter((i) => i.code);
  const main = items.find((i) => i.main) ?? items[0] ?? null;
  return {
    afm,
    name: text(b.onomasia),
    title: text(b.commer_title),
    legal: text(b.legal_status_descr),
    active: String(b.deactivation_flag ?? "1") === "1",
    registered: text(b.regist_date),
    mainKad: main?.code ?? null,
    mainKadDescr: main?.descr ?? null,
    kads: items,
  };
}

const qi = (s: string) => `"${s.replaceAll('"', '""')}"`;

/** An AFM used by this many customers is the ERP's shared «retail» AFM, not a business. */
export const SHARED_AFM = 5;
const FRESH_FOUND = 180 * 24 * 3600_000;
const FRESH_MISSING = 30 * 24 * 3600_000;

/**
 * Shared cache (app DB, all tenants): public registry data per AFM only — never which tenant has
 * that AFM as a customer. undefined = not cached / stale, null = cached «not found».
 */
async function cachedAfm(afm: string): Promise<AfmInfo | null | undefined> {
  const row = await prisma.afmRegistry.findUnique({ where: { afm } });
  if (!row || Date.now() - row.fetchedAt.getTime() > (row.found ? FRESH_FOUND : FRESH_MISSING)) return undefined;
  if (!row.found) return null;
  return {
    afm,
    name: row.name,
    title: row.title,
    legal: row.legal,
    active: row.active ?? true,
    registered: row.registered,
    mainKad: row.mainKad,
    mainKadDescr: row.mainKadDescr,
    kads: (row.kads ?? []) as KadItem[],
  };
}

async function saveCachedAfm(afm: string, info: AfmInfo | null) {
  const data = {
    name: info?.name ?? null,
    title: info?.title ?? null,
    legal: info?.legal ?? null,
    active: info?.active ?? null,
    registered: info?.registered ?? null,
    mainKad: info?.mainKad ?? null,
    mainKadDescr: info?.mainKadDescr ?? null,
    kads: info ? (info.kads as unknown as object) : undefined,
    found: !!info,
    fetchedAt: new Date(),
  };
  await prisma.afmRegistry.upsert({ where: { afm }, update: data, create: { afm, ...data } });
}

export async function ensureRegistryTable(db: Client, s: string) {
  await db.query(`CREATE TABLE IF NOT EXISTS ${s}.afm_registry (
    afm text PRIMARY KEY,
    name text, title text, legal text,
    active boolean,
    registered date,
    main_kad text,
    main_kad_descr text,
    kads jsonb,
    status text NOT NULL,
    error text,
    fetched_at timestamptz NOT NULL DEFAULT now()
  )`);
}

export type KadRun = { tenantId: string; fetched: number; notFound: number; errors: number; pending: number; error?: string };

/** Looks up the AFMs of active customers (24 months) that are new or older than 180 days. */
export async function fetchTenantKads(tenantId: string, limit: number): Promise<KadRun> {
  const settings = await getAfmSettings();
  const s = qi(schemaName(tenantId));
  return withWarehouse(async (db) => {
    await ensureRegistryTable(db, s);
    // Greek customers only, and not the AFM that many retail customers share in the ERP.
    const { rows } = await db.query(
      `WITH act AS (SELECT DISTINCT trdr FROM ${s}.f_sales_lines WHERE trndate >= now() - interval '24 months'),
            shared AS (SELECT afm FROM ${s}.customers WHERE afm ~ '^[0-9]{9}$' GROUP BY afm HAVING COUNT(*) >= ${SHARED_AFM})
       SELECT DISTINCT c.afm FROM act JOIN ${s}.customers c USING (trdr)
       LEFT JOIN ${s}.afm_registry r ON r.afm = c.afm
       WHERE c.afm ~ '^[0-9]{9}$' AND COALESCE(c.country, 1000) = 1000 AND c.afm NOT IN (SELECT afm FROM shared)
         AND (r.afm IS NULL OR r.status = 'error' OR r.fetched_at < now() - interval '180 days')`,
    );
    const todo = rows.map((r) => String(r.afm));
    const batch = todo.slice(0, limit);
    const out: KadRun = { tenantId, fetched: 0, notFound: 0, errors: 0, pending: todo.length - batch.length };
    for (let i = 0; i < batch.length; i += 3) {
      // Lookups in parallel, writes one at a time (one pg client = one query at a time).
      const results = await Promise.all(
        batch.slice(i, i + 3).map(async (afm) => {
          const hit = await cachedAfm(afm);
          if (hit !== undefined) return { afm, info: hit, error: null as string | null };
          try {
            const info = await lookupAfm(settings.url, afm);
            await saveCachedAfm(afm, info);
            return { afm, info, error: null as string | null };
          } catch (err) {
            return { afm, info: null, error: (err as Error).message.slice(0, 300) };
          }
        }),
      );
      for (const { afm, info, error } of results) {
        const status = error ? "error" : info ? "ok" : "not_found";
        if (status === "ok") out.fetched++;
        else if (status === "not_found") out.notFound++;
        else out.errors++;
        await db.query(
          `INSERT INTO ${s}.afm_registry (afm, name, title, legal, active, registered, main_kad, main_kad_descr, kads, status, error, fetched_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
           ON CONFLICT (afm) DO UPDATE SET name=EXCLUDED.name, title=EXCLUDED.title, legal=EXCLUDED.legal, active=EXCLUDED.active,
             registered=EXCLUDED.registered, main_kad=EXCLUDED.main_kad, main_kad_descr=EXCLUDED.main_kad_descr, kads=EXCLUDED.kads,
             status=EXCLUDED.status, error=EXCLUDED.error, fetched_at=now()`,
          [afm, info?.name ?? null, info?.title ?? null, info?.legal ?? null, info?.active ?? null, info?.registered ?? null, info?.mainKad ?? null, info?.mainKadDescr ?? null, info ? JSON.stringify(info.kads) : null, status, error],
        );
      }
      if (out.errors >= 15 && out.fetched === 0) {
        out.error = "Η υπηρεσία μητρώου δεν απαντά — η εκτέλεση σταμάτησε.";
        break;
      }
    }
    return out;
  });
}

export type KadStatus = { customers: number; withAfm: number; found: number; notFound: number; errors: number; pending: number };

export async function kadStatus(tenantId: string): Promise<KadStatus | null> {
  const s = qi(schemaName(tenantId));
  return withWarehouse(async (db) => {
    if (!(await db.query(`SELECT to_regclass($1) AS t`, [`${schemaName(tenantId)}.afm_registry`])).rows[0].t) return null;
    const r = (
      await db.query(
        `WITH act AS (SELECT DISTINCT trdr FROM ${s}.f_sales_lines WHERE trndate >= now() - interval '24 months')
         SELECT COUNT(*)::int customers,
                COUNT(*) FILTER (WHERE c.afm ~ '^[0-9]{9}$')::int with_afm,
                COUNT(*) FILTER (WHERE r.status = 'ok')::int found,
                COUNT(*) FILTER (WHERE r.status = 'not_found')::int not_found,
                COUNT(*) FILTER (WHERE r.status = 'error')::int errors,
                COUNT(*) FILTER (WHERE c.afm ~ '^[0-9]{9}$' AND r.afm IS NULL)::int pending
         FROM act JOIN ${s}.customers c USING (trdr) LEFT JOIN ${s}.afm_registry r ON r.afm = c.afm`,
      )
    ).rows[0];
    return { customers: r.customers, withAfm: r.with_afm, found: r.found, notFound: r.not_found, errors: r.errors, pending: r.pending };
  });
}

/** Scheduler: every tenant with the industry service, a batch each. */
export async function runKadLookups() {
  const settings = await getAfmSettings();
  if (!settings.enabled) return { skipped: "disabled" };
  const tenants = await prisma.tenant.findMany({ where: { warehouseStatus: "READY" }, select: { id: true } });
  const out: KadRun[] = [];
  for (const t of tenants) {
    if (!(await hasService(t.id, "industry"))) continue;
    try {
      const r = await fetchTenantKads(t.id, settings.batchSize);
      out.push(r);
      // New codes join their segment right away (codes the AI has not seen yet go to «Λοιποί» until
      // the segmentation is rebuilt).
      if (r.fetched > 0 && (await prisma.industrySegmentation.findUnique({ where: { tenantId: t.id }, select: { tenantId: true } }))) {
        const { rebuildCustomerSegments } = await import("@/lib/industry");
        await rebuildCustomerSegments(t.id);
      }
    } catch (err) {
      out.push({ tenantId: t.id, fetched: 0, notFound: 0, errors: 0, pending: 0, error: (err as Error).message.slice(0, 200) });
    }
  }
  return { runs: out };
}

/** Registry data + segment of one customer (by code) for the customer profile. */
export async function customerActivity(tenantId: string, customerCode: string) {
  const s = qi(schemaName(tenantId));
  return withWarehouse(async (db) => {
    if (!(await db.query(`SELECT to_regclass($1) AS t`, [`${schemaName(tenantId)}.afm_registry`])).rows[0].t) return null;
    const hasSeg = !!(await db.query(`SELECT to_regclass($1) AS t`, [`${schemaName(tenantId)}.customer_segment`])).rows[0].t;
    const r = await db.query(
      `SELECT c.afm, r.name, r.title, r.legal, r.active, r.main_kad, r.main_kad_descr, r.kads${hasSeg ? ", g.segment_name" : ", NULL AS segment_name"}
       FROM ${s}.customers c JOIN ${s}.afm_registry r ON r.afm = c.afm AND r.status = 'ok'
       ${hasSeg ? `LEFT JOIN ${s}.customer_segment g ON g.trdr = c.trdr` : ""}
       WHERE c.code = $1 LIMIT 1`,
      [customerCode],
    );
    const x = r.rows[0];
    if (!x) return null;
    return {
      afm: String(x.afm),
      title: (x.title as string | null) ?? null,
      legal: (x.legal as string | null) ?? null,
      active: x.active as boolean | null,
      mainKad: (x.main_kad as string | null) ?? null,
      mainKadDescr: (x.main_kad_descr as string | null) ?? null,
      kads: ((x.kads ?? []) as KadItem[]).filter((k) => !k.main),
      segment: (x.segment_name as string | null) ?? null,
    };
  });
}
