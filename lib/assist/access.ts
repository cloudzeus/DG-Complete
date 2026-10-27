import "server-only";
import { prisma } from "@/lib/prisma";
import { can, isPlatformStaff, requirePermission } from "@/lib/rbac";

/** Who may operate a waiting run (docs/22 §5): `tenant.runs.assist` as a member of the tenant.
 *  DGsoft staff only inside the platform library tenant (their own flows). */
export async function requireAssist(tenantId: string) {
  const user = await requirePermission("tenant.runs.assist", tenantId);
  const member = user.memberships.some((m) => m.tenantId === tenantId);
  if (!member && isPlatformStaff(user)) {
    const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { isLibrary: true } });
    if (!t?.isLibrary) return { user, allowed: false as const, full: false };
  }
  return { user, allowed: true as const, full: can(user, "tenant.runs.assist.full", tenantId) };
}
