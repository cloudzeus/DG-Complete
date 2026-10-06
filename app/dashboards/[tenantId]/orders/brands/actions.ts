"use server";

import { brandPlan } from "@/lib/brand-orders";
import { can, requireUser } from "@/lib/rbac";

/** Has AI judge the brand's alternative items (stored; the page then refreshes). */
export async function judgeBrandAlternatives(tenantId: string, mtrmark: number): Promise<{ ok: boolean; pending: number }> {
  const user = await requireUser();
  if (!can(user, "tenant.dashboards.view", tenantId)) return { ok: false, pending: 0 };
  const plan = await brandPlan(tenantId, mtrmark, { useAi: true });
  return { ok: true, pending: plan.pendingAi };
}
