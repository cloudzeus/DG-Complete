"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { can, requireUser } from "@/lib/rbac";
import type { ReportDefinition } from "@/lib/report-types";
import { dimensionValues, runReport, type ReportResult } from "@/lib/reports";
import { hasService } from "@/lib/tenant-services";

async function reportUser(tenantId: string) {
  const user = await requireUser();
  if (!can(user, "tenant.dashboards.view", tenantId)) throw new Error("Δεν έχετε πρόσβαση.");
  if (!(await hasService(tenantId, "reports"))) throw new Error("Οι αναφορές δεν περιλαμβάνονται στο πακέτο σας.");
  return user;
}

const defSchema = z.object({
  cube: z.string().max(80),
  rows: z.array(z.string().max(120)).max(4),
  columns: z.array(z.string().max(120)).max(3),
  values: z.array(z.string().max(120)).max(8),
  filters: z
    .array(z.object({ member: z.string().max(120), operator: z.enum(["equals", "notEquals", "contains", "gt", "lt", "set", "notSet"]), values: z.array(z.string().max(200)).max(50) }))
    .max(10),
  period: z.object({ preset: z.string(), from: z.string().optional(), to: z.string().optional() }).optional(),
  view: z.enum(["pivot", "table", "bar", "line", "area", "pie"]),
  sort: z.object({ by: z.string().max(120), desc: z.boolean() }).optional(),
  limit: z.number().int().min(1).max(5000).optional(),
});

export async function runReportAction(tenantId: string, def: ReportDefinition): Promise<{ ok: true; result: ReportResult } | { ok: false; error: string }> {
  try {
    await reportUser(tenantId);
    const parsed = defSchema.safeParse(def);
    if (!parsed.success) return { ok: false, error: "Μη έγκυρη αναφορά." };
    return { ok: true, result: await runReport(tenantId, parsed.data as ReportDefinition) };
  } catch (err) {
    return { ok: false, error: (err as Error).message.slice(0, 300) };
  }
}

export async function filterValues(tenantId: string, cube: string, member: string, search: string): Promise<string[]> {
  await reportUser(tenantId);
  return dimensionValues(tenantId, cube, member, String(search).slice(0, 60)).catch(() => []);
}

export async function saveReport(
  tenantId: string,
  input: { id?: string; name: string; description?: string; shared: boolean; definition: ReportDefinition },
): Promise<{ ok: boolean; message: string; id?: string }> {
  try {
    const user = await reportUser(tenantId);
    const name = input.name.trim().slice(0, 120);
    if (name.length < 2) return { ok: false, message: "Δώστε όνομα στην αναφορά." };
    const parsed = defSchema.safeParse(input.definition);
    if (!parsed.success) return { ok: false, message: "Μη έγκυρη αναφορά." };
    const data = { name, description: input.description?.trim().slice(0, 500) || null, shared: input.shared, definition: parsed.data };
    let id = input.id;
    if (id) {
      const own = await prisma.savedReport.findFirst({ where: { id, tenantId }, select: { userId: true } });
      if (!own) return { ok: false, message: "Η αναφορά δεν βρέθηκε." };
      if (own.userId !== user.id && !can(user, "tenant.dashboards.edit", tenantId)) return { ok: false, message: "Μόνο ο δημιουργός αλλάζει την αναφορά — αποθηκεύστε ως νέα." };
      await prisma.savedReport.update({ where: { id }, data });
    } else {
      id = (await prisma.savedReport.create({ data: { ...data, tenantId, userId: user.id } })).id;
    }
    await audit({ actorId: user.id, action: "report.save", entity: "SavedReport", entityId: id, tenantId, meta: { name } });
    revalidatePath(`/dashboards/${tenantId}/reports`);
    return { ok: true, message: "Η αναφορά αποθηκεύτηκε.", id };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function deleteReport(tenantId: string, id: string): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await reportUser(tenantId);
    const r = await prisma.savedReport.findFirst({ where: { id, tenantId }, select: { userId: true } });
    if (!r) return { ok: false, message: "Η αναφορά δεν βρέθηκε." };
    if (r.userId !== user.id && !can(user, "tenant.dashboards.edit", tenantId)) return { ok: false, message: "Δεν έχετε δικαίωμα." };
    await prisma.savedReport.delete({ where: { id } });
    revalidatePath(`/dashboards/${tenantId}/reports`);
    return { ok: true, message: "Η αναφορά διαγράφηκε." };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
