"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

type Result = { ok: boolean; message: string };

function refresh(tenantId: string) {
  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath("/admin/tenants");
}

const statusSchema = z.enum(["PENDING", "ACTIVE", "SUSPENDED", "CANCELED"]);

/** Manual status change (until billing drives it). */
export async function setTenantStatus(tenantId: string, status: string): Promise<Result> {
  const user = await requirePermission("tenants.manage");
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, message: "Μη έγκυρη κατάσταση." };
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return { ok: false, message: "Ο πελάτης δεν βρέθηκε." };

  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: parsed.data } });
  await audit({
    actorId: user.id,
    action: "tenant.status",
    entity: "Tenant",
    entityId: tenant.id,
    tenantId: tenant.id,
    meta: { from: tenant.status, to: parsed.data },
  });
  refresh(tenant.id);
  return { ok: true, message: "Η κατάσταση ενημερώθηκε." };
}

/** Demo tenants always have access and never need a subscription. */
export async function setTenantDemo(tenantId: string, isDemo: boolean): Promise<Result> {
  const user = await requirePermission("tenants.manage");
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return { ok: false, message: "Ο πελάτης δεν βρέθηκε." };
  await prisma.tenant.update({ where: { id: tenant.id }, data: { isDemo } });
  await audit({ actorId: user.id, action: "tenant.demo", entity: "Tenant", entityId: tenant.id, tenantId: tenant.id, meta: { isDemo } });
  refresh(tenant.id);
  return { ok: true, message: isDemo ? "Ο tenant είναι πλέον demo — πρόσβαση χωρίς συνδρομή." : "Ο tenant δεν είναι πλέον demo." };
}
