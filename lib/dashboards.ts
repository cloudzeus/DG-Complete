import "server-only";
import { cache } from "react";
import { forbidden, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { can, isPlatformStaff, requireUser, type CurrentUser } from "@/lib/rbac";

// Who can open which tenant's dashboards: platform staff (super admin, admin) see every tenant
// with a warehouse; tenant users only their own tenants (tenant.dashboards.view).

export type DashboardTenant = { id: string; name: string; isDemo: boolean };

export const dashboardTenants = cache(async (user: CurrentUser): Promise<DashboardTenant[]> => {
  const where = isPlatformStaff(user)
    ? { warehouseStatus: { in: ["READY" as const, "DISABLED" as const] } }
    : { id: { in: user.memberships.filter((m) => can(user, "tenant.dashboards.view", m.tenantId)).map((m) => m.tenantId) } };
  return prisma.tenant.findMany({
    where,
    select: { id: true, name: true, isDemo: true },
    orderBy: [{ isDemo: "desc" }, { name: "asc" }],
  });
});

/** Guards a dashboard page: the user may view this tenant's dashboards. */
export const requireDashboardTenant = cache(async (tenantId: string) => {
  const user = await requireUser();
  if (!can(user, "tenant.dashboards.view", tenantId)) forbidden();
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, isDemo: true, warehouseStatus: true },
  });
  if (!tenant) notFound();
  return { user, tenant };
});

/** Year from ?year=…, else the newest one with data. */
export function pickYear(param: string | string[] | undefined, years: number[]) {
  const y = Number(Array.isArray(param) ? param[0] : param);
  if (Number.isInteger(y) && years.includes(y)) return y;
  return years[0] ?? new Date().getFullYear();
}
