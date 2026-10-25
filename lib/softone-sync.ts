import "server-only";
import { prisma } from "@/lib/prisma";
import type { SyncJob } from "@/lib/generated/prisma/client";
import { formatS1Date, getDgsoftConnection, parseS1Date, s1GetTable, type Row } from "@/lib/softone";
import { JOB_PRESETS, resolveFilter, stripCompany } from "@/lib/softone-presets";

// SoftOne (DGsoft) → app synchronisation engine.
//  · Every sync is a SyncJob ("cron job"): CUSTOMERS (built-in → s1_customer + tenants) or TABLE (any table → s1_record).
//  · Incremental by the job's updField (e.g. UPDDATE) with a 1-hour overlap; FULL re-reads everything.
//  · A partial unique index (one RUNNING sync_run per job) guarantees one run at a time across manual + cron.

export const CUSTOMERS_JOB_NAME = "Πελάτες";
const CUSTOMER_FIELDS = ["TRDR", "CODE", "NAME", "AFM", "EMAIL", "PHONE01", "ADDRESS", "CITY", "ZIP", "ISACTIVE", "UPDDATE"];
// Incremental runs re-read this much before the last watermark. 4 hours, not 1: some SoftOne
// installations store UPDDATE in UTC while we send Athens wall time (up to 3 hours ahead), which
// silently skipped every recent change. Re-reading is harmless (upsert / replace per parent).
const OVERLAP_MS = 4 * 60 * 60 * 1000;
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
  const canIncrement = !!job.updField;
  const incremental = canIncrement && (opts.mode ?? (last?.watermarkTo ? "INCREMENTAL" : "FULL")) === "INCREMENTAL";
  const mode = incremental && last?.watermarkTo ? "INCREMENTAL" : "FULL";
  const from =
    mode === "INCREMENTAL" && job.updField ? new Date(last!.watermarkTo!.getTime() - OVERLAP_MS) : null;

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
    const conn = await prisma.softOneConnection.findUnique({ where: { id: job.connectionId }, select: { company: true } });
    const baseFilter = resolveFilter(job.filter?.trim() || undefined, conn?.company ?? "");

    // DG Complete keeps only the app destination (the BI warehouse was removed in the fork).
    if (job.destination !== "APP") throw new Error("Ο προορισμός WAREHOUSE δεν υποστηρίζεται στο DG Complete.");
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
