"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { syncDgsoftCustomers, type SyncResult } from "@/lib/softone-sync";

export async function runCustomerSync(mode: "FULL" | "INCREMENTAL"): Promise<SyncResult> {
  const user = await requirePermission("tenants.manage");
  const result = await syncDgsoftCustomers({ mode, trigger: "manual", userId: user.id });
  await audit({
    actorId: user.id,
    action: "softone.customers.sync",
    entity: "SyncRun",
    entityId: result.runId,
    meta: { mode, ok: result.ok },
  });
  revalidatePath("/admin/customers");
  revalidatePath("/admin/tenants");
  return result;
}

type Result = { ok: true; tenantId: string } | { ok: false; message: string };

/** Creates a tenant from a synced SoftOne customer (1 customer ↔ 1 tenant). */
export async function createTenantFromCustomer(customerId: string): Promise<Result> {
  const user = await requirePermission("tenants.manage");
  const customer = await prisma.s1Customer.findUnique({ where: { id: customerId } });
  if (!customer) return { ok: false, message: "Ο πελάτης δεν βρέθηκε." };
  const existing = await prisma.tenant.findUnique({ where: { s1Trdr: customer.trdr }, select: { id: true } });
  if (existing) return { ok: false, message: "Υπάρχει ήδη tenant για αυτόν τον πελάτη." };

  const tenant = await prisma.tenant.create({
    data: {
      name: customer.name,
      afm: customer.afm,
      email: customer.email,
      s1Trdr: customer.trdr,
      s1Code: customer.code,
    },
  });
  await audit({
    actorId: user.id,
    action: "tenant.create",
    entity: "Tenant",
    entityId: tenant.id,
    tenantId: tenant.id,
    meta: { source: "softone", trdr: customer.trdr, code: customer.code },
  });
  revalidatePath("/admin/customers");
  revalidatePath("/admin/tenants");
  return { ok: true, tenantId: tenant.id };
}

/** Links an existing tenant to a SoftOne customer, or unlinks it (trdr = null). */
export async function linkTenantToCustomer(tenantId: string, customerId: string | null): Promise<{ ok: boolean; message: string }> {
  const user = await requirePermission("tenants.manage");
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return { ok: false, message: "Ο tenant δεν βρέθηκε." };

  if (!customerId) {
    await prisma.tenant.update({ where: { id: tenantId }, data: { s1Trdr: null, s1Code: null } });
    await audit({ actorId: user.id, action: "tenant.s1.unlink", entity: "Tenant", entityId: tenantId, tenantId, meta: { trdr: tenant.s1Trdr } });
  } else {
    const customer = await prisma.s1Customer.findUnique({ where: { id: customerId } });
    if (!customer) return { ok: false, message: "Ο πελάτης SoftOne δεν βρέθηκε." };
    const taken = await prisma.tenant.findUnique({ where: { s1Trdr: customer.trdr }, select: { id: true, name: true } });
    if (taken && taken.id !== tenantId) return { ok: false, message: `Ο πελάτης είναι ήδη συνδεδεμένος με «${taken.name}».` };
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { s1Trdr: customer.trdr, s1Code: customer.code, name: customer.name, afm: customer.afm, email: customer.email ?? tenant.email },
    });
    await audit({ actorId: user.id, action: "tenant.s1.link", entity: "Tenant", entityId: tenantId, tenantId, meta: { trdr: customer.trdr } });
  }
  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath("/admin/customers");
  revalidatePath("/admin/tenants");
  return { ok: true, message: customerId ? "Ο tenant συνδέθηκε με τον πελάτη SoftOne." : "Η αντιστοίχιση αφαιρέθηκε." };
}

/** Server-side search for the link picker. */
export async function searchCustomers(query: string) {
  await requirePermission("tenants.read");
  const q = query.trim();
  const customers = await prisma.s1Customer.findMany({
    where: q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q } }, { afm: { contains: q } }] }
      : undefined,
    orderBy: { name: "asc" },
    take: 20,
    select: { id: true, trdr: true, code: true, name: true, afm: true, isActive: true },
  });
  const linked = await prisma.tenant.findMany({
    where: { s1Trdr: { in: customers.map((c) => c.trdr) } },
    select: { s1Trdr: true, name: true },
  });
  return customers.map((c) => ({ ...c, linkedTenant: linked.find((t) => t.s1Trdr === c.trdr)?.name ?? null }));
}
