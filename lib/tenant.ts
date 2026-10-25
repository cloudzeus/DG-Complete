import "server-only";
import { cache } from "react";
import { forbidden, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { can, isPlatformStaff, requireUser, type CurrentUser } from "@/lib/rbac";
import { tenantAccess } from "@/lib/tenant-services";

// Who can open which tenant area (/t/[tenantId]): platform staff (super admin, admin) every
// tenant; tenant users only their own tenants (tenant.dashboards.view).

export type UserTenant = { id: string; name: string; isDemo: boolean };

export const userTenants = cache(async (user: CurrentUser): Promise<UserTenant[]> => {
  const where = isPlatformStaff(user)
    ? {}
    : { id: { in: user.memberships.filter((m) => can(user, "tenant.dashboards.view", m.tenantId)).map((m) => m.tenantId) } };
  return prisma.tenant.findMany({
    where,
    select: { id: true, name: true, isDemo: true },
    orderBy: [{ isDemo: "desc" }, { name: "asc" }],
  });
});

/** Guards a tenant page: the user may open this tenant's area. */
export const requireTenant = cache(async (tenantId: string) => {
  const user = await requireUser();
  if (!can(user, "tenant.dashboards.view", tenantId)) forbidden();
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, isDemo: true, status: true },
  });
  if (!tenant) notFound();
  const access = await tenantAccess(tenantId);
  const role = user.memberships.find((m) => m.tenantId === tenantId)?.role ?? null;
  return { user, tenant, access, role, staff: isPlatformStaff(user) };
});

/** Tenants for the switcher in the topbar. */
export const tenantsOf = userTenants;

/** Guards an admin-only tenant page (members, API keys, approvals, settings). */
export async function requireTenantAdmin(tenantId: string) {
  const t = await requireTenant(tenantId);
  if (!t.staff && t.role !== "TENANT_ADMIN") forbidden();
  return t;
}
