"use server";

import { audit } from "@/lib/audit";
import { buildBiMarts } from "@/lib/bi-marts";
import { seriesReview, setSeriesSign, type SeriesReview } from "@/lib/doc-series";
import { requirePermission } from "@/lib/rbac";

export async function loadSeriesReview(tenantId: string): Promise<SeriesReview | null> {
  await requirePermission("connections.tenant.manage", tenantId);
  return seriesReview(tenantId).catch(() => null);
}

/** sign null = back to automatic. Rebuilds the marts so the dashboards change right away. */
export async function saveSeriesSign(tenantId: string, series: number, sign: number | null): Promise<{ ok: boolean; message: string }> {
  const user = await requirePermission("connections.tenant.manage", tenantId);
  if (sign !== null && ![1, -1, 0].includes(sign)) return { ok: false, message: "Μη έγκυρη τιμή." };
  try {
    await setSeriesSign(tenantId, series, sign, user.id);
    await audit({ actorId: user.id, action: "tenant.series_sign", entity: "Tenant", entityId: tenantId, tenantId, meta: { series, sign } });
    await buildBiMarts(tenantId);
    return { ok: true, message: `Σειρά ${series}: αποθηκεύτηκε και ενημερώθηκαν τα dashboards.` };
  } catch (err) {
    return { ok: false, message: (err as Error).message.slice(0, 300) };
  }
}
