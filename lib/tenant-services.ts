import "server-only";
import { prisma } from "@/lib/prisma";
import { NO_PLAN_SERVICES, pagesOf, SERVICE_KEYS, withRequirements, type ServiceKey } from "@/lib/services";

// What a tenant may use: the services of its plan (demo tenants: everything; no plan: nothing).
// Cached for a minute — plan changes apply within that.

export type TenantAccess = {
  services: Set<ServiceKey>;
  pages: Set<string>;
  planName: string | null;
};

const cache = new Map<string, { at: number; access: TenantAccess }>();
const TTL = 60_000;

export function forgetTenantAccess(tenantId?: string) {
  if (tenantId) cache.delete(tenantId);
  else cache.clear();
}

export async function tenantAccess(tenantId: string): Promise<TenantAccess> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL) return hit.access;
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { isDemo: true, plan: { select: { name: true, services: true } } } });
  const services: ServiceKey[] = t?.isDemo ? [...SERVICE_KEYS] : t?.plan ? withRequirements(t.plan.services) : NO_PLAN_SERVICES;
  const access: TenantAccess = {
    services: new Set(services),
    pages: pagesOf(services),
    planName: t?.plan?.name ?? null,
  };
  cache.set(tenantId, { at: Date.now(), access });
  return access;
}

export async function hasService(tenantId: string, service: ServiceKey) {
  return (await tenantAccess(tenantId)).services.has(service);
}
