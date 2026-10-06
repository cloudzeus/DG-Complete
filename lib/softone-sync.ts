import "server-only";
import { rebuildAfterImport } from "@/lib/pnl";
import { prisma } from "@/lib/prisma";
import type { SyncJob } from "@/lib/generated/prisma/client";
import { formatS1Date, getDgsoftConnection, parseS1Date, s1GetTable, type Row } from "@/lib/softone";
import { JOB_PRESETS, resolveFilter, stripCompany } from "@/lib/softone-presets";
import { TENANT_PRESETS, type JobOptions } from "@/lib/tenant-presets";
import { replaceRows, replaceWhere, upsertRows, type Columns } from "@/lib/warehouse-writer";

// SoftOne (DGsoft) → app synchronisation engine.
//  · Every sync is a SyncJob ("cron job"): CUSTOMERS (built-in → s1_customer + tenants) or TABLE (any table → s1_record).
//  · Incremental by the job's updField (e.g. UPDDATE) with a 1-hour overlap; FULL re-reads everything.
//  · A partial unique index (one RUNNING sync_run per job) guarantees one run at a time across manual + cron.

export const CUSTOMERS_JOB_NAME = "Πελάτες";
const CUSTOMER_FIELDS = ["TRDR", "CODE", "NAME", "AFM", "EMAIL", "PHONE01", "ADDRESS", "CITY", "ZIP", "ISACTIVE", "UPDDATE"];
const OVERLAP_MS = 60 * 60 * 1000;
const STALE_MS = 30 * 60 * 1000;
const BATCH = 500;
export const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

export type SyncResult =
  | { ok: true; runId: string; rowsRead: number; rowsUpserted: number; tenantsUpdated: number }
  | { ok: false; runId?: string; error: string; busy?: boolean };

const str = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s || null;
};

/** The built-in customers job of the DGsoft connection (created on first use). */
export async function ensureCustomersJob(connectionId: string, company: string) {
  return prisma.syncJob.upsert({
    where: { connectionId_name: { connectionId, name: CUSTOMERS_JOB_NAME } },
    update: {},
    create: {
      connectionId,
      name: CUSTOMERS_JOB_NAME,
      type: "CUSTOMERS",
      table: "TRDR",
      fields: CUSTOMER_FIELDS.join(","),
      keyField: "TRDR",
      updField: "UPDDATE",
      filter: ["SODTYPE=13", /^\d+$/.test(company) ? `COMPANY=${company}` : null].filter(Boolean).join(" AND "),
      intervalMinutes: 15,
    },
  });
}

/** Back-compat entry point used by the Πελάτες SoftOne page. */
export async function syncDgsoftCustomers(opts: { mode?: "FULL" | "INCREMENTAL"; trigger: "manual" | "cron"; userId?: string }) {
  const conn = await getDgsoftConnection();
  if (!conn) return { ok: false, error: "Δεν έχει ρυθμιστεί σύνδεση με το SoftOne της DGsoft." } satisfies SyncResult;
  const job = await ensureCustomersJob(conn.id, conn.company);
  return runSyncJob(job.id, opts);
}

export async function runSyncJob(
  jobId: string,
  opts: { mode?: "FULL" | "INCREMENTAL"; trigger: "manual" | "cron"; userId?: string },
): Promise<SyncResult> {
  const job = await prisma.syncJob.findUnique({ where: { id: jobId } });
  if (!job) return { ok: false, error: "Το job δεν βρέθηκε." };

  // Crashed runs (process killed mid-sync) release the lock after STALE_MS.
  await prisma.syncRun.updateMany({
    where: { jobId: job.id, status: "RUNNING", startedAt: { lt: new Date(Date.now() - STALE_MS) } },
    data: { status: "FAILED", error: "Διακόπηκε (timeout)", finishedAt: new Date() },
  });

  const last = await prisma.syncRun.findFirst({
    where: { jobId: job.id, status: "SUCCESS" },
    orderBy: { startedAt: "desc" },
    select: { watermarkTo: true },
  });
  const options = (job.options ?? {}) as JobOptions;
  const canIncrement =
    !!job.updField ||
    (job.destination === "WAREHOUSE" && ((!!job.dateField && !!job.windowDays) || !!options.parent || !!options.yearField));
  const incremental = canIncrement && (opts.mode ?? (last?.watermarkTo ? "INCREMENTAL" : "FULL")) === "INCREMENTAL";
  const mode = incremental && last?.watermarkTo ? "INCREMENTAL" : "FULL";
  const from =
    mode === "INCREMENTAL" && (job.updField || options.parent) ? new Date(last!.watermarkTo!.getTime() - OVERLAP_MS) : null;

  let run;
  try {
    run = await prisma.syncRun.create({
      data: {
        connectionId: job.connectionId,
        jobId: job.id,
        kind: job.type === "CUSTOMERS" ? "DGSOFT_CUSTOMERS" : "TABLE",
        mode,
        trigger: opts.trigger,
        triggeredById: opts.userId,
        watermarkFrom: from,
      },
    });
  } catch {
    return { ok: false, busy: true, error: "Το job εκτελείται ήδη." };
  }

  try {
    const fields = job.fields.split(",").map((f) => f.trim()).filter(Boolean);
    const conn = await prisma.softOneConnection.findUnique({ where: { id: job.connectionId }, select: { company: true, tenantId: true } });
    const baseFilter = resolveFilter(job.filter?.trim() || undefined, conn?.company ?? "");

    if (job.destination === "WAREHOUSE") {
      const result = await runWarehouseJob(job, conn?.tenantId ?? null, baseFilter, mode, from);
      await prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCESS",
          rowsRead: result.read,
          rowsUpserted: result.written,
          watermarkTo: result.maxUpdated ?? last?.watermarkTo ?? new Date(),
          finishedAt: new Date(),
        },
      });
      await finishJob(job, "SUCCESS");
      if (conn?.tenantId) await rebuildAfterImport(conn.tenantId, job.targetTable);
      return { ok: true, runId: run.id, rowsRead: result.read, rowsUpserted: result.written, tenantsUpdated: 0 };
    }
    const filter = [baseFilter || null, from && job.updField ? `${job.updField}>='${formatS1Date(from)}'` : null]
      .filter(Boolean)
      .map((f) => `(${f})`)
      .join(" AND ");
    const rows = await s1GetTable(job.connectionId, job.table, fields, filter);

    const result =
      job.type === "CUSTOMERS" ? await applyCustomers(job, rows) : await applyTableRows(job, rows);
    const watermark = result.maxUpdated ?? last?.watermarkTo ?? new Date();

    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        rowsRead: rows.length,
        rowsUpserted: result.upserted,
        tenantsUpdated: result.tenantsUpdated,
        watermarkTo: watermark,
        finishedAt: new Date(),
      },
    });
    await finishJob(job, "SUCCESS");
    return { ok: true, runId: run.id, rowsRead: rows.length, rowsUpserted: result.upserted, tenantsUpdated: result.tenantsUpdated };
  } catch (err) {
    const error = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
    await prisma.syncRun.update({ where: { id: run.id }, data: { status: "FAILED", error, finishedAt: new Date() } });
    await finishJob(job, "FAILED");
    return { ok: false, runId: run.id, error };
  }
}

// ───────────── Tenant warehouse imports ─────────────

const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);

async function runWarehouseJob(
  job: SyncJob,
  tenantId: string | null,
  baseFilter: string,
  mode: "FULL" | "INCREMENTAL",
  updFrom: Date | null,
): Promise<{ read: number; written: number; maxUpdated: Date | null }> {
  if (!tenantId) throw new Error("Η σύνδεση δεν ανήκει σε tenant.");
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { warehouseStatus: true } });
  if (tenant?.warehouseStatus !== "READY" && tenant?.warehouseStatus !== "DISABLED") {
    throw new Error("Ο tenant δεν έχει αποθήκη δεδομένων — κάντε πρώτα Provisioning.");
  }
  if (!job.targetTable || !job.columns) throw new Error("Λείπει ο πίνακας προορισμού.");

  const columns = job.columns as Columns;
  const fields = Object.keys(columns);
  const target = { tenantId, table: job.targetTable, columns, keyFields: job.keyField.split(",") };
  const updField = job.updField?.toUpperCase();
  const and = (...parts: (string | null | undefined)[]) =>
    parts.filter(Boolean).map((p) => `(${p})`).join(" AND ");
  let maxUpdated: Date | null = null;
  const track = (rows: Row[]) => {
    if (!updField) return;
    for (const r of rows) maxUpdated = maxDate(maxUpdated, parseS1Date(r[updField]));
  };
  const range = (f: string, a: Date, b?: Date) =>
    `${f}>='${formatS1Date(a)}'${b ? ` AND ${f}<'${formatS1Date(b)}'` : ""}`;
  const options = (job.options ?? {}) as JobOptions;

  // Child rows of documents (e.g. MTRLINES of FINDOC): follow the parents' dates / updates and
  // replace all lines of every touched parent, so edited and removed lines are reflected.
  if (options.parent) {
    const p = options.parent;
    const conn = await prisma.softOneConnection.findUnique({ where: { id: job.connectionId }, select: { company: true } });
    const parentBase = resolveFilter(p.filter, conn?.company ?? "");
    const started = new Date();
    const keyCol = p.key;
    if (mode === "INCREMENTAL" && updFrom) {
      const parents = await s1GetTable(job.connectionId, p.table, [p.key, p.updField], and(parentBase, range(p.updField, updFrom)));
      const ids = [...new Set(parents.map((r) => String(r[p.key.toUpperCase()] ?? "")).filter((x) => /^\d+$/.test(x)))];
      let read = 0;
      let written = 0;
      for (let i = 0; i < ids.length; i += 400) {
        const chunk = ids.slice(i, i + 400);
        const rows = await s1GetTable(job.connectionId, job.table, fields, and(baseFilter, `${keyCol} IN (${chunk.join(",")})`));
        read += rows.length;
        written += await replaceWhere(target, rows, { column: keyCol, values: chunk });
      }
      return { read, written, maxUpdated: started };
    }
    if (!job.historyFrom) throw new Error("Λείπει η αρχή του ιστορικού.");
    await replaceRows(target, [], null);
    let read = 0;
    let written = 0;
    for (let m = monthStart(job.historyFrom); m <= new Date(); m = addMonths(m, 1)) {
      const sub = `${keyCol} IN (SELECT ${p.key} FROM ${p.table} WHERE ${and(parentBase, range(p.dateField, m, addMonths(m, 1)))})`;
      const rows = await s1GetTable(job.connectionId, job.table, fields, and(baseFilter, sub));
      read += rows.length;
      written += await upsertRows(target, rows);
    }
    return { read, written, maxUpdated: started };
  }

  // Per fiscal year (e.g. MTRBALSHEET): FULL = every year since the history start, INCREMENTAL =
  // the current year (and the previous one in Jan–Feb, for late postings), chunked by period.
  if (options.yearField) {
    const yf = options.yearField;
    const now = new Date();
    let firstYear = job.historyFrom ? job.historyFrom.getFullYear() : now.getFullYear() - 2;
    if (options.allYears && mode === "FULL") {
      // Walk back year by year until two consecutive years have no rows (company start).
      let empty = 0;
      for (let y = now.getFullYear() - 1; y > 1990 && empty < 2; y--) {
        const probe = await s1GetTable(job.connectionId, job.table, [yf], and(baseFilter, `${yf}=${y}`, options.chunkField ? `${options.chunkField}=12` : null));
        if (probe.length) {
          firstYear = Math.min(firstYear, y);
          empty = 0;
        } else empty++;
      }
    }
    const years =
      mode === "INCREMENTAL"
        ? now.getMonth() < 2
          ? [now.getFullYear() - 1, now.getFullYear()]
          : [now.getFullYear()]
        : Array.from({ length: now.getFullYear() - firstYear + 1 }, (_, i) => firstYear + i);
    if (mode === "FULL") await replaceRows(target, [], null);
    let read = 0;
    let written = 0;
    for (const y of years) {
      const rows: Row[] = [];
      const chunks = options.chunkField && options.chunkValues?.length ? options.chunkValues : [null];
      for (const c of chunks) {
        const chunkFilter = c === null ? null : `${options.chunkField}=${Number(c)}`;
        rows.push(...(await s1GetTable(job.connectionId, job.table, fields, and(baseFilter, `${yf}=${y}`, chunkFilter))));
      }
      read += rows.length;
      written += await replaceWhere(target, rows, { column: yf, values: [y] });
    }
    return { read, written, maxUpdated: now };
  }

  // INCREMENTAL by update timestamp → upsert the changed rows.
  if (mode === "INCREMENTAL" && updField && updFrom) {
    const rows = await s1GetTable(job.connectionId, job.table, fields, and(baseFilter, range(updField, updFrom)));
    track(rows);
    return { read: rows.length, written: await upsertRows(target, rows), maxUpdated };
  }

  // INCREMENTAL by rolling window → re-import the window atomically (edits + deletions).
  if (mode === "INCREMENTAL" && job.dateField && job.windowDays) {
    const from = new Date(Date.now() - job.windowDays * 86_400_000);
    from.setHours(0, 0, 0, 0);
    const rows: Row[] = [];
    for (let m = monthStart(from); m <= new Date(); m = addMonths(m, 1)) {
      const a = m < from ? from : m;
      rows.push(...(await s1GetTable(job.connectionId, job.table, fields, and(baseFilter, range(job.dateField, a, addMonths(m, 1))))));
    }
    track(rows);
    return { read: rows.length, written: await replaceRows(target, rows, { dateField: job.dateField, from }), maxUpdated };
  }

  // FULL: history by month (keeps each SoftOne request small), or the whole table for master data.
  if (job.dateField && job.historyFrom) {
    await replaceRows(target, [], null);
    let read = 0;
    let written = 0;
    for (let m = monthStart(job.historyFrom); m <= new Date(); m = addMonths(m, 1)) {
      const rows = await s1GetTable(job.connectionId, job.table, fields, and(baseFilter, range(job.dateField, m, addMonths(m, 1))));
      track(rows);
      read += rows.length;
      written += await upsertRows(target, rows);
    }
    return { read, written, maxUpdated };
  }
  const rows = await s1GetTable(job.connectionId, job.table, fields, baseFilter);
  track(rows);
  return { read: rows.length, written: await replaceRows(target, rows, null), maxUpdated };
}

async function finishJob(job: SyncJob, status: "SUCCESS" | "FAILED") {
  const now = new Date();
  await prisma.syncJob.update({
    where: { id: job.id },
    data: { lastRunAt: now, lastStatus: status, nextRunAt: new Date(now.getTime() + job.intervalMinutes * 60_000) },
  });
}

type Applied = { upserted: number; tenantsUpdated: number; maxUpdated: Date | null };

const maxDate = (a: Date | null, b: Date | null) => (!a ? b : !b ? a : a > b ? a : b);

async function applyCustomers(job: SyncJob, rows: Row[]): Promise<Applied> {
  const customers = rows
    .map((row) => {
      const trdr = Number(row.TRDR);
      if (!Number.isInteger(trdr) || trdr <= 0) return null;
      return {
        trdr,
        code: str(row.CODE) ?? String(trdr),
        name: str(row.NAME) ?? "(χωρίς επωνυμία)",
        afm: str(row.AFM),
        email: str(row.EMAIL),
        phone: str(row.PHONE01),
        address: str(row.ADDRESS),
        city: str(row.CITY),
        zip: str(row.ZIP),
        isActive: String(row.ISACTIVE ?? "1") === "1",
        s1UpdatedAt: parseS1Date(row.UPDDATE),
      };
    })
    .filter((c) => c !== null);

  let maxUpdated: Date | null = null;
  for (const c of customers) {
    await prisma.s1Customer.upsert({
      where: { connectionId_trdr: { connectionId: job.connectionId, trdr: c.trdr } },
      update: { ...c, syncedAt: new Date() },
      create: { ...c, connectionId: job.connectionId },
    });
    maxUpdated = maxDate(maxUpdated, c.s1UpdatedAt);
  }

  // SoftOne is the source of truth for the master data of linked tenants.
  let tenantsUpdated = 0;
  const tenants = customers.length
    ? await prisma.tenant.findMany({ where: { s1Trdr: { in: customers.map((c) => c.trdr) } } })
    : [];
  for (const t of tenants) {
    const c = customers.find((x) => x.trdr === t.s1Trdr)!;
    const patch = { name: c.name, afm: c.afm, email: c.email ?? t.email, s1Code: c.code };
    if (patch.name !== t.name || patch.afm !== t.afm || patch.email !== t.email || patch.s1Code !== t.s1Code) {
      await prisma.tenant.update({ where: { id: t.id }, data: patch });
      tenantsUpdated++;
    }
  }
  return { upserted: customers.length, tenantsUpdated, maxUpdated };
}

async function applyTableRows(job: SyncJob, rows: Row[]): Promise<Applied> {
  const keyFields = job.keyField.split(",").map((k) => k.trim().toUpperCase()).filter(Boolean);
  const updField = job.updField?.toUpperCase();
  let maxUpdated: Date | null = null;
  let upserted = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows
      .slice(i, i + BATCH)
      .map((r) => {
        const parts = keyFields.map((k) => str(r[k]));
        if (parts.some((p) => !p)) return null;
        const key = parts.join("|");
        const upd = updField ? parseS1Date(r[updField]) : null;
        maxUpdated = maxDate(maxUpdated, upd);
        return { key, data: r, upd: upd?.toISOString() ?? null };
      })
      .filter((r) => r !== null);
    if (!batch.length) continue;
    upserted += await prisma.$executeRaw`
      INSERT INTO "s1_record" ("id", "jobId", "key", "data", "s1UpdatedAt", "syncedAt")
      SELECT gen_random_uuid()::text, ${job.id}, x.key, x.data, x.upd, now()
      FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(key text, data jsonb, upd timestamptz)
      ON CONFLICT ("jobId", "key") DO UPDATE
        SET "data" = EXCLUDED."data", "s1UpdatedAt" = EXCLUDED."s1UpdatedAt", "syncedAt" = now()`;
  }
  return { upserted, tenantsUpdated: 0, maxUpdated };
}

/**
 * Creates the default reference/master-data jobs (lib/softone-presets) that don't exist yet.
 * Each one is verified against this SoftOne installation first (GetTable … AND 1=0):
 * full fields → without the COMPANY clause → minimal fields. Unverifiable presets are skipped.
 */
export async function seedDefaultJobs(connectionId?: string) {
  const conn = connectionId
    ? await prisma.softOneConnection.findUnique({ where: { id: connectionId } })
    : await getDgsoftConnection();
  if (!conn) throw new Error("Δεν έχει ρυθμιστεί σύνδεση με το SoftOne της DGsoft.");
  if (conn.scope === "DGSOFT") await ensureCustomersJob(conn.id, conn.company);
  const existing = new Set((await prisma.syncJob.findMany({ where: { connectionId: conn.id }, select: { name: true } })).map((j) => j.name));
  const report: { name: string; status: "created" | "exists" | "failed"; note?: string }[] = [];

  for (const p of JOB_PRESETS) {
    if (existing.has(p.name)) {
      report.push({ name: p.name, status: "exists" });
      continue;
    }
    const withCompany = resolveFilter(p.filter, conn.company);
    const attempts = [
      { fields: p.fields, filter: withCompany, note: undefined },
      { fields: p.fields, filter: stripCompany(withCompany), note: "χωρίς φίλτρο εταιρείας" },
      { fields: p.minimal, filter: stripCompany(withCompany), note: "βασικά πεδία" },
    ].filter((a, i, all) => i === 0 || a.fields !== all[i - 1].fields || a.filter !== all[i - 1].filter);

    let chosen: (typeof attempts)[number] | null = null;
    let lastError = "";
    for (const a of attempts) {
      try {
        const probe = [a.filter ? `(${a.filter})` : null, "1=0"].filter(Boolean).join(" AND ");
        await s1GetTable(conn.id, p.table, a.fields.split(","), probe);
        chosen = a;
        break;
      } catch (err) {
        lastError = (err as Error).message.slice(0, 200);
      }
    }
    if (!chosen) {
      report.push({ name: p.name, status: "failed", note: lastError });
      continue;
    }
    const fieldList = chosen.fields.split(",");
    await prisma.syncJob.create({
      data: {
        connectionId: conn.id,
        name: p.name,
        type: "TABLE",
        table: p.table,
        fields: chosen.fields,
        keyField: p.keyField,
        updField: p.updField && fieldList.includes(p.updField) ? p.updField : null,
        filter: chosen.filter || null,
        intervalMinutes: p.intervalMinutes,
        enabled: p.enabled ?? true,
      },
    });
    report.push({ name: p.name, status: "created", note: chosen.note });
  }
  return report;
}

/** Runs every enabled job whose nextRunAt has passed, within a time budget (called by cron). */
export async function runDueJobs(budgetMs = 50_000) {
  const started = Date.now();
  const conn = await getDgsoftConnection();
  if (conn) await ensureCustomersJob(conn.id, conn.company);
  const due = await prisma.syncJob.findMany({
    where: { enabled: true, OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }] },
    orderBy: [{ nextRunAt: { sort: "asc", nulls: "first" } }],
  });
  const results: { job: string; ok: boolean; rows?: number; error?: string }[] = [];
  for (const job of due) {
    if (Date.now() - started > budgetMs) break;
    const r = await runSyncJob(job.id, { trigger: "cron" });
    results.push(r.ok ? { job: job.name, ok: true, rows: r.rowsUpserted } : { job: job.name, ok: false, error: r.error });
  }
  return { ran: results.length, due: due.length, results };
}

/**
 * Creates the default warehouse imports of a tenant's SoftOne (lib/tenant-presets), according to
 * what detection found (GL and/or commercial). Each is verified live first: full fields with the
 * COMPANY clause → without it → without the optional fields.
 */
export async function seedTenantJobs(connectionId: string, opts: { enabled?: boolean } = {}) {
  const conn = await prisma.softOneConnection.findUnique({ where: { id: connectionId } });
  if (!conn || conn.scope !== "TENANT" || !conn.tenantId) throw new Error("Η σύνδεση SoftOne πελάτη δεν βρέθηκε.");
  const caps = (conn.capabilities ?? null) as { gl?: { available: boolean }; sales?: { available: boolean }; purchases?: { available: boolean }; fiscalYears?: { year: number; from: string | null }[] } | null;
  const hasGL = !!caps?.gl?.available;
  const hasSales = !!caps?.sales?.available;
  const hasPurchases = !!caps?.purchases?.available;

  // History: start of the 3rd most recent fiscal year that has started (or Jan 1 two years ago).
  const now = new Date();
  const started = (caps?.fiscalYears ?? []).filter((y) => y.from && new Date(y.from) <= now).sort((a, b) => b.year - a.year);
  const historyFrom = started[2]?.from ? new Date(started[2].from) : new Date(now.getFullYear() - 2, 0, 1);

  const existing = new Set((await prisma.syncJob.findMany({ where: { connectionId }, select: { name: true } })).map((j) => j.name));
  const report: { name: string; status: "created" | "exists" | "failed" | "skipped"; note?: string }[] = [];

  for (const p of TENANT_PRESETS) {
    if (p.requires === "GL" && !hasGL) {
      report.push({ name: p.name, status: "skipped", note: "δεν υπάρχει Γενική Λογιστική" });
      continue;
    }
    if ((p.requires === "SALES" && !hasSales) || (p.requires === "PURCHASES" && !hasPurchases)) {
      report.push({ name: p.name, status: "skipped", note: "δεν βρέθηκαν τέτοια παραστατικά" });
      continue;
    }
    if (existing.has(p.name)) {
      report.push({ name: p.name, status: "exists", note: await upgradeTenantJob(conn.id, conn.company, p) });
      continue;
    }
    const all = Object.keys(p.columns);
    const required = all.filter((f) => !p.optional?.includes(f));
    const withCompany = resolveFilter(p.filter, conn.company);
    const attempts = [
      { fields: all, filter: withCompany, note: undefined as string | undefined },
      { fields: all, filter: stripCompany(withCompany), note: "χωρίς φίλτρο εταιρείας" },
      { fields: required, filter: stripCompany(withCompany), note: "χωρίς προαιρετικά πεδία" },
    ];
    let chosen: (typeof attempts)[number] | null = null;
    let lastError = "";
    for (const a of attempts) {
      try {
        await s1GetTable(conn.id, p.table, a.fields, [a.filter ? `(${a.filter})` : null, "1=0"].filter(Boolean).join(" AND "));
        chosen = a;
        break;
      } catch (err) {
        lastError = (err as Error).message.slice(0, 200);
      }
    }
    if (!chosen) {
      report.push({ name: p.name, status: "failed", note: lastError });
      continue;
    }
    const columns = Object.fromEntries(chosen.fields.map((f) => [f, p.columns[f]]));
    await prisma.syncJob.create({
      data: {
        connectionId: conn.id,
        name: p.name,
        type: "TABLE",
        destination: "WAREHOUSE",
        table: p.table,
        targetTable: p.targetTable,
        fields: chosen.fields.join(","),
        columns,
        keyField: p.keyField,
        updField: p.updField && chosen.fields.includes(p.updField) ? p.updField : null,
        dateField: p.dateField && chosen.fields.includes(p.dateField) ? p.dateField : null,
        windowDays: p.windowDays ?? null,
        historyFrom: p.dateField || p.options ? historyFrom : null,
        options: p.options ?? undefined,
        enabled: opts.enabled ?? true,
        filter: chosen.filter || null,
        intervalMinutes: p.intervalMinutes,
      },
    });
    report.push({ name: p.name, status: "created", note: chosen.note });
  }
  return report;
}

/**
 * Brings an existing tenant import up to its preset: adds new (verified) columns and the
 * interval / options. New columns fill on the next FULL run. Returns a note, or undefined.
 */
async function upgradeTenantJob(connectionId: string, company: string | null, p: (typeof TENANT_PRESETS)[number]) {
  const job = await prisma.syncJob.findUnique({ where: { connectionId_name: { connectionId, name: p.name } } });
  if (!job || job.destination !== "WAREHOUSE") return undefined;
  const columns = { ...((job.columns ?? {}) as Columns) };
  const missing = Object.keys(p.columns).filter((f) => !(f in columns));
  const added: string[] = [];
  for (const f of missing) {
    try {
      await s1GetTable(connectionId, job.table, [...Object.keys(columns), f], [job.filter ? `(${resolveFilter(job.filter, company ?? "")})` : null, "1=0"].filter(Boolean).join(" AND "));
      columns[f] = p.columns[f];
      added.push(f);
    } catch {
      // field not available in this installation
    }
  }
  const canon = (v: unknown): string =>
    v && typeof v === "object" && !Array.isArray(v)
      ? `{${Object.keys(v).sort().map((k) => `${k}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}`
      : JSON.stringify(v);
  const optionsChanged = !!p.options && canon(job.options ?? null) !== canon(p.options);
  if (!added.length && !optionsChanged && job.intervalMinutes === p.intervalMinutes) return undefined;
  await prisma.syncJob.update({
    where: { id: job.id },
    data: {
      columns,
      fields: Object.keys(columns).join(","),
      intervalMinutes: p.intervalMinutes,
      ...(p.options ? { options: p.options } : {}),
    },
  });
  return added.length ? `νέα πεδία: ${added.join(", ")} (συμπληρώνονται στην επόμενη πλήρη εκτέλεση)` : "ενημερώθηκαν οι ρυθμίσεις";
}
