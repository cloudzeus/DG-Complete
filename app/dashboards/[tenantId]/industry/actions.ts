"use server";

import { revalidatePath } from "next/cache";
import { profileSegment } from "@/lib/industry";
import { can, requireUser } from "@/lib/rbac";
import { hasService } from "@/lib/tenant-services";

/** AI profile of a segment (OpenRouter, billed to the tenant); cached until segments are rebuilt. */
export async function generateSegmentProfile(tenantId: string, key: string): Promise<{ ok: boolean; message?: string }> {
  const user = await requireUser();
  if (!can(user, "tenant.dashboards.view", tenantId)) return { ok: false, message: "Δεν έχετε πρόσβαση." };
  if (!(await hasService(tenantId, "industry"))) return { ok: false, message: "Η κλαδική ανάλυση δεν περιλαμβάνεται στο πακέτο σας." };
  try {
    await profileSegment(tenantId, key, user.id);
    revalidatePath(`/dashboards/${tenantId}/industry`);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: (err as Error).message.slice(0, 300) };
  }
}
