"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { checkCubeForTenant, type CubeMetaCheck } from "@/lib/cube";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  provisionTenantWarehouse,
  setTenantWarehouseLogin,
  verifyTenantWarehouse,
  type WarehouseCheck,
} from "@/lib/warehouse";

type Result = { ok: boolean; message: string };

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 500);

function refresh(tenantId: string) {
  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath("/admin/tenants");
}

export async function provisionWarehouse(tenantId: string): Promise<Result> {
  const user = await requirePermission("tenants.manage");
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, status: true, isDemo: true } });
  if (!tenant) return { ok: false, message: "Ο πελάτης δεν βρέθηκε." };
  try {
    await provisionTenantWarehouse(tenant.id);
    // A suspended/canceled tenant gets the structure but no login.
    const loginEnabled = tenant.isDemo || tenant.status === "ACTIVE" || tenant.status === "PENDING";
    if (!loginEnabled) await setTenantWarehouseLogin(tenant.id, false);
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        warehouseStatus: loginEnabled ? "READY" : "DISABLED",
        warehouseProvisionedAt: new Date(),
        warehouseError: null,
      },
    });
    await audit({ actorId: user.id, action: "tenant.warehouse.provision", entity: "Tenant", entityId: tenant.id, tenantId: tenant.id });
    refresh(tenant.id);
    return { ok: true, message: "Το schema και ο ρόλος του πελάτη δημιουργήθηκαν." };
  } catch (err) {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { warehouseStatus: "ERROR", warehouseError: errorMessage(err) },
    });
    refresh(tenant.id);
    return { ok: false, message: errorMessage(err) };
  }
}

export async function verifyWarehouse(tenantId: string): Promise<WarehouseCheck | { ok: false; steps: []; error: string }> {
  await requirePermission("tenants.read");
  try {
    return await verifyTenantWarehouse(tenantId);
  } catch (err) {
    return { ok: false, steps: [], error: errorMessage(err) };
  }
}

export async function checkCube(tenantId: string): Promise<CubeMetaCheck> {
  await requirePermission("tenants.read");
  return checkCubeForTenant(tenantId);
}

const statusSchema = z.enum(["PENDING", "ACTIVE", "SUSPENDED", "CANCELED"]);

/** Manual status change (until billing drives it). Keeps the warehouse login in sync. */
export async function setTenantStatus(tenantId: string, status: string): Promise<Result> {
  const user = await requirePermission("tenants.manage");
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, message: "Μη έγκυρη κατάσταση." };
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return { ok: false, message: "Ο πελάτης δεν βρέθηκε." };

  const loginEnabled = tenant.isDemo || parsed.data === "ACTIVE" || parsed.data === "PENDING";
  if (tenant.warehouseStatus === "READY" || tenant.warehouseStatus === "DISABLED") {
    try {
      await setTenantWarehouseLogin(tenant.id, loginEnabled);
    } catch (err) {
      return { ok: false, message: `Η βάση δεν ενημερώθηκε: ${errorMessage(err)}` };
    }
  }
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      status: parsed.data,
      ...(tenant.warehouseStatus === "READY" || tenant.warehouseStatus === "DISABLED"
        ? { warehouseStatus: loginEnabled ? "READY" : "DISABLED" }
        : {}),
    },
  });
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
  // Keep the warehouse login in line: a demo tenant can always log in.
  if (tenant.warehouseStatus === "READY" || tenant.warehouseStatus === "DISABLED") {
    const loginEnabled = isDemo || tenant.status === "ACTIVE" || tenant.status === "PENDING";
    try {
      await setTenantWarehouseLogin(tenant.id, loginEnabled);
    } catch (err) {
      return { ok: false, message: `Η βάση δεν ενημερώθηκε: ${errorMessage(err)}` };
    }
    await prisma.tenant.update({ where: { id: tenant.id }, data: { warehouseStatus: loginEnabled ? "READY" : "DISABLED" } });
  }
  await prisma.tenant.update({ where: { id: tenant.id }, data: { isDemo } });
  await audit({ actorId: user.id, action: "tenant.demo", entity: "Tenant", entityId: tenant.id, tenantId: tenant.id, meta: { isDemo } });
  refresh(tenant.id);
  return { ok: true, message: isDemo ? "Ο tenant είναι πλέον demo — πρόσβαση χωρίς συνδρομή." : "Ο tenant δεν είναι πλέον demo." };
}
