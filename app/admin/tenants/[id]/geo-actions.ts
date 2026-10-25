"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { geocodeTenant, geoStatus, type GeoStatus } from "@/lib/geo";
import { getGeoSettings } from "@/lib/mapbox";
import { requirePermission } from "@/lib/rbac";

export async function loadGeoStatus(tenantId: string): Promise<GeoStatus | null> {
  await requirePermission("connections.tenant.manage", tenantId);
  return geoStatus(tenantId);
}

/** Runs one geocoding batch now (instead of waiting for the hourly run). */
export async function geocodeNow(tenantId: string): Promise<{ ok: boolean; message: string }> {
  const user = await requirePermission("connections.tenant.manage", tenantId);
  const settings = await getGeoSettings();
  if (!settings.enabled || !settings.tokenEnc) return { ok: false, message: "Ενεργοποιήστε πρώτα το Mapbox (Ρυθμίσεις → Χάρτες)." };
  try {
    const r = await geocodeTenant(tenantId, settings.batchSize);
    await audit({ actorId: user.id, action: "geo.geocode", entity: "Tenant", entityId: tenantId, tenantId, meta: r });
    revalidatePath(`/admin/tenants/${tenantId}`);
    if (r.error) return { ok: false, message: r.error };
    return {
      ok: true,
      message: `Βρέθηκαν ${r.geocoded} διευθύνσεις${r.notFound ? `, ${r.notFound} δεν βρέθηκαν` : ""}${r.errors ? `, ${r.errors} σφάλματα` : ""}${r.pending ? ` · απομένουν ${r.pending} (συνεχίζει αυτόματα κάθε ώρα)` : ""}.`,
    };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
