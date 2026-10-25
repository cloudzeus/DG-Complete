"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { can, requireUser } from "@/lib/rbac";
import { hasService } from "@/lib/tenant-services";
import { sendWeeklyReport } from "@/lib/weekly-report";

type Result = { ok: boolean; message: string };

/** Turn Κίμων's weekly report on/off for a user of the tenant (oneself, or anyone for tenant admins). */
export async function setWeeklyReport(tenantId: string, userId: string, on: boolean): Promise<Result> {
  const user = await requireUser();
  if (!can(user, "tenant.dashboards.view", tenantId)) return { ok: false, message: "Δεν έχετε πρόσβαση." };
  if (userId !== user.id && !can(user, "tenant.users.manage", tenantId)) return { ok: false, message: "Μόνο ο διαχειριστής της εταιρείας αλλάζει τις ρυθμίσεις άλλων." };
  const r = await prisma.membership.updateMany({ where: { tenantId, userId }, data: { weeklyReport: on } });
  if (!r.count) return { ok: false, message: "Ο χρήστης δεν ανήκει στην εταιρεία." };
  await audit({ actorId: user.id, action: "notifications.weekly", entity: "Membership", entityId: userId, tenantId, meta: { on } });
  revalidatePath(`/dashboards/${tenantId}/notifications`);
  return { ok: true, message: on ? "Η εβδομαδιαία αναφορά ενεργοποιήθηκε." : "Η εβδομαδιαία αναφορά απενεργοποιήθηκε." };
}

/** Sends this week's report now, to oneself (consumes AI tokens). */
export async function sendWeeklyReportNow(tenantId: string): Promise<Result> {
  const user = await requireUser();
  if (!can(user, "tenant.dashboards.view", tenantId)) return { ok: false, message: "Δεν έχετε πρόσβαση." };
  if (!(await hasService(tenantId, "kimon"))) return { ok: false, message: "Η αναφορά απαιτεί τον Κίμωνα στο πακέτο σας." };
  try {
    const r = await sendWeeklyReport(tenantId, { to: [{ email: user.email, name: user.name ?? "" }], force: true });
    return r.sent ? { ok: true, message: `Στάλθηκε στο ${user.email}.` } : { ok: false, message: r.error ?? "Η αποστολή απέτυχε — ελέγξτε τις ρυθμίσεις email." };
  } catch (err) {
    return { ok: false, message: (err as Error).message.slice(0, 200) };
  }
}
