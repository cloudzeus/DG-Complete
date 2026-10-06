"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { buildSegmentation, type Segment } from "@/lib/industry";
import { fetchTenantKads, getAfmSettings, kadStatus, type KadStatus } from "@/lib/kad";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export type IndustryState = { status: KadStatus | null; segments: Segment[]; builtAt: string | null; error: string | null };

export async function loadIndustryState(tenantId: string): Promise<IndustryState> {
  await requirePermission("connections.tenant.manage", tenantId);
  const [status, seg] = await Promise.all([kadStatus(tenantId).catch(() => null), prisma.industrySegmentation.findUnique({ where: { tenantId } })]);
  return { status, segments: (seg?.segments ?? []) as Segment[], builtAt: seg?.builtAt?.toISOString() ?? null, error: seg?.error ?? null };
}

export async function fetchKadsNow(tenantId: string): Promise<{ ok: boolean; message: string }> {
  const user = await requirePermission("connections.tenant.manage", tenantId);
  const settings = await getAfmSettings();
  try {
    const r = await fetchTenantKads(tenantId, settings.batchSize);
    await audit({ actorId: user.id, action: "industry.kad_fetch", entity: "Tenant", entityId: tenantId, tenantId, meta: r });
    if (r.error) return { ok: false, message: r.error };
    return {
      ok: true,
      message: `Βρέθηκαν ${r.fetched} ΑΦΜ${r.notFound ? `, ${r.notFound} δεν βρέθηκαν` : ""}${r.errors ? `, ${r.errors} σφάλματα` : ""}${r.pending ? ` · απομένουν ${r.pending}` : ""}.`,
    };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/** AI: segments for this business + every ΚΑΔ → segment (OpenRouter, billed to the tenant). */
export async function buildSegmentsNow(tenantId: string): Promise<{ ok: boolean; message: string }> {
  const user = await requirePermission("connections.tenant.manage", tenantId);
  try {
    const r = await buildSegmentation(tenantId, user.id);
    await audit({ actorId: user.id, action: "industry.segments", entity: "Tenant", entityId: tenantId, tenantId, meta: r });
    revalidatePath(`/admin/tenants/${tenantId}`);
    return { ok: true, message: `Δημιουργήθηκαν ${r.segments} κλάδοι από ${r.kads} διαφορετικούς κύριους ΚΑΔ.` };
  } catch (err) {
    const message = (err as Error).message.slice(0, 300);
    await prisma.industrySegmentation.updateMany({ where: { tenantId }, data: { error: message } });
    return { ok: false, message };
  }
}
