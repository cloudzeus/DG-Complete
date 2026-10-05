"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { getDgsoftConnection, s1GetTable } from "@/lib/softone";
import { resolveFilter } from "@/lib/softone-presets";
import { IDENT, runSyncJob, seedDefaultJobs, type SyncResult } from "@/lib/softone-sync";

const ident = (label: string) => z.string().trim().toUpperCase().regex(IDENT, `${label}: μόνο γράμματα, αριθμοί, _`);

const schema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(2, "Δώστε όνομα").max(80),
    table: ident("Πίνακας"),
    fields: z
      .string()
      .trim()
      .transform((s) => [...new Set(s.split(/[\s,]+/).map((f) => f.trim().toUpperCase()).filter(Boolean))])
      .refine((list) => list.length > 0 && list.every((f) => IDENT.test(f)), "Λίστα πεδίων χωρισμένη με κόμμα"),
    keyField: z
      .string()
      .trim()
      .toUpperCase()
      .transform((s) => s.split(/[\s,]+/).filter(Boolean))
      .refine((l) => l.length > 0 && l.every((k) => IDENT.test(k)), "Κλειδί: πεδίο ή πεδία χωρισμένα με κόμμα"),
    updField: z.string().trim().toUpperCase().regex(IDENT).optional().or(z.literal("")),
    filter: z.string().trim().max(500).optional(),
    intervalMinutes: z.coerce.number().int().min(5, "Τουλάχιστον 5 λεπτά").max(10080),
    enabled: z.boolean(),
  })
  .refine((v) => v.keyField.every((k) => v.fields.includes(k)), { path: ["keyField"], message: "Το κλειδί πρέπει να υπάρχει στα πεδία" })
  .refine((v) => !v.updField || v.fields.includes(v.updField), { path: ["updField"], message: "Το πεδίο ενημέρωσης πρέπει να υπάρχει στα πεδία" });

type Field = "name" | "table" | "fields" | "keyField" | "updField" | "filter" | "intervalMinutes";
export type JobFormState = {
  ok?: boolean;
  message?: string;
  errors?: Partial<Record<Field, string>>;
  test?: { ok: boolean; message: string };
};

function parse(fd: FormData) {
  return schema.safeParse({
    id: fd.get("id") || undefined,
    name: fd.get("name"),
    table: fd.get("table"),
    fields: fd.get("fields"),
    keyField: fd.get("keyField"),
    updField: fd.get("updField") ?? "",
    filter: (fd.get("filter") as string) || undefined,
    intervalMinutes: fd.get("intervalMinutes"),
    enabled: fd.get("enabled") === "on",
  });
}

function errorsOf(error: z.ZodError): JobFormState["errors"] {
  const out: JobFormState["errors"] = {};
  for (const i of error.issues) out[i.path[0] as Field] ??= i.message;
  return out;
}

const refresh = () => {
  revalidatePath("/admin/settings/sync");
  revalidatePath("/admin/tenants", "layout");
};

/** DGsoft jobs need platform settings; a tenant's jobs need permission on that tenant's sources. */
async function requireJobPermission(jobId: string) {
  const job = await prisma.syncJob.findUnique({ where: { id: jobId }, include: { connection: { select: { scope: true, tenantId: true } } } });
  if (!job) return null;
  if (job.connection.scope === "TENANT" && job.connection.tenantId) {
    return { job, user: await requirePermission("connections.tenant.manage", job.connection.tenantId) };
  }
  return { job, user: await requirePermission("platform.settings.manage") };
}

/** Validates table + fields + filter against SoftOne without fetching rows (FILTER … AND 1=0). */
export async function testJob(fd: FormData): Promise<JobFormState> {
  const editId = (fd.get("id") as string) || null;
  const access = editId ? await requireJobPermission(editId) : null;
  if (!access) await requirePermission("platform.settings.manage");
  const conn = access ? await prisma.softOneConnection.findUnique({ where: { id: access.job.connectionId } }) : await getDgsoftConnection();
  if (!conn) return { test: { ok: false, message: "Δεν έχει ρυθμιστεί σύνδεση SoftOne." } };
  const parsed = parse(fd);
  if (!parsed.success) return { errors: errorsOf(parsed.error) };
  const v = parsed.data;
  try {
    const filter = resolveFilter(v.filter, conn.company);
    await s1GetTable(conn.id, v.table, v.fields, [filter ? `(${filter})` : null, "1=0"].filter(Boolean).join(" AND "));
    return { test: { ok: true, message: `Ο πίνακας ${v.table} και τα ${v.fields.length} πεδία είναι έγκυρα.` } };
  } catch (err) {
    return { test: { ok: false, message: (err as Error).message.slice(0, 400) } };
  }
}

export async function saveJob(_prev: JobFormState, fd: FormData): Promise<JobFormState> {
  const editId = (fd.get("id") as string) || null;
  const access = editId ? await requireJobPermission(editId) : null;
  if (editId && !access) return { message: "Το job δεν βρέθηκε." };
  const user = access ? access.user : await requirePermission("platform.settings.manage");
  const conn = access ? await prisma.softOneConnection.findUnique({ where: { id: access.job.connectionId } }) : await getDgsoftConnection();
  if (!conn) return { message: "Δεν έχει ρυθμιστεί σύνδεση SoftOne." };
  const parsed = parse(fd);
  if (!parsed.success) return { errors: errorsOf(parsed.error) };
  const v = parsed.data;
  const data = {
    name: v.name,
    table: v.table,
    fields: v.fields.join(","),
    keyField: v.keyField.join(","),
    updField: v.updField || null,
    filter: v.filter || null,
    intervalMinutes: v.intervalMinutes,
    enabled: v.enabled,
  };

  try {
    if (v.id) {
      const job = await prisma.syncJob.findUnique({ where: { id: v.id } });
      if (!job) return { message: "Το job δεν βρέθηκε." };
      // The built-in customers job keeps its structure; only schedule / filter / enabled are editable.
      const patch =
        // Built-in customers job and typed warehouse imports keep their structure.
        job.type === "CUSTOMERS" || job.destination === "WAREHOUSE"
          ? { filter: data.filter, intervalMinutes: data.intervalMinutes, enabled: data.enabled }
          : data;
      const structural = job.table !== data.table || job.keyField !== data.keyField;
      await prisma.$transaction([
        ...(structural && job.type === "TABLE" ? [prisma.s1Record.deleteMany({ where: { jobId: job.id } })] : []),
        prisma.syncJob.update({ where: { id: job.id }, data: { ...patch, nextRunAt: null } }),
      ]);
    } else {
      await prisma.syncJob.create({ data: { ...data, connectionId: conn.id, type: "TABLE" } });
    }
  } catch {
    return { errors: { name: "Υπάρχει ήδη job με αυτό το όνομα" } };
  }
  await audit({ actorId: user.id, action: v.id ? "sync.job.update" : "sync.job.create", entity: "SyncJob", entityId: v.id, meta: data });
  refresh();
  return { ok: true, message: v.id ? "Το job ενημερώθηκε." : "Το job δημιουργήθηκε· θα τρέξει στο επόμενο tick του cron." };
}

export async function runJobNow(id: string, mode: "FULL" | "INCREMENTAL"): Promise<SyncResult> {
  const access = await requireJobPermission(id);
  if (!access) return { ok: false, error: "Το job δεν βρέθηκε." };
  const { user } = access;
  const r = await runSyncJob(id, { mode, trigger: "manual", userId: user.id });
  await audit({ actorId: user.id, action: "sync.job.run", entity: "SyncJob", entityId: id, meta: { mode, ok: r.ok } });
  refresh();
  revalidatePath("/admin/customers");
  return r;
}

export async function setJobEnabled(id: string, enabled: boolean): Promise<{ ok: boolean; message: string }> {
  const access = await requireJobPermission(id);
  if (!access) return { ok: false, message: "Το job δεν βρέθηκε." };
  const { user } = access;
  await prisma.syncJob.update({ where: { id }, data: { enabled, nextRunAt: null } });
  await audit({ actorId: user.id, action: enabled ? "sync.job.enable" : "sync.job.disable", entity: "SyncJob", entityId: id });
  refresh();
  return { ok: true, message: enabled ? "Το job ενεργοποιήθηκε." : "Το job απενεργοποιήθηκε." };
}

export async function deleteJob(id: string): Promise<{ ok: boolean; message: string }> {
  const access = await requireJobPermission(id);
  if (!access) return { ok: false, message: "Το job δεν βρέθηκε." };
  const { user } = access;
  const job = await prisma.syncJob.findUnique({ where: { id }, select: { type: true, name: true } });
  if (!job) return { ok: false, message: "Το job δεν βρέθηκε." };
  if (job.type === "CUSTOMERS") return { ok: false, message: "Το ενσωματωμένο job πελατών δεν διαγράφεται· απενεργοποιήστε το." };
  await prisma.syncJob.delete({ where: { id } });
  await audit({ actorId: user.id, action: "sync.job.delete", entity: "SyncJob", entityId: id, meta: { name: job.name } });
  refresh();
  return { ok: true, message: "Το job και τα δεδομένα του διαγράφηκαν." };
}

export async function createDefaultJobs(): Promise<
  { ok: true; report: Awaited<ReturnType<typeof seedDefaultJobs>> } | { ok: false; message: string }
> {
  const user = await requirePermission("platform.settings.manage");
  try {
    const report = await seedDefaultJobs();
    await audit({
      actorId: user.id,
      action: "sync.job.seed",
      entity: "SyncJob",
      meta: { created: report.filter((r) => r.status === "created").map((r) => r.name) },
    });
    refresh();
    return { ok: true, report };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
