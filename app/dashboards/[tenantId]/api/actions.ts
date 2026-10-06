"use server";

import { revalidatePath } from "next/cache";
import { createApiKey } from "@/lib/api-keys";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { can, requireUser } from "@/lib/rbac";
import { hasService } from "@/lib/tenant-services";

async function manager(tenantId: string) {
  const user = await requireUser();
  if (!can(user, "tenant.apikeys.manage", tenantId)) throw new Error("Δεν έχετε δικαίωμα διαχείρισης API keys.");
  if (!(await hasService(tenantId, "api"))) throw new Error("Τα web services δεν περιλαμβάνονται στο πακέτο σας.");
  return user;
}

/** Creates a key and returns it once — only its hash is kept. */
export async function createKey(tenantId: string, name: string): Promise<{ ok: true; key: string } | { ok: false; message: string }> {
  try {
    const user = await manager(tenantId);
    const n = name.trim().slice(0, 60);
    if (n.length < 2) return { ok: false, message: "Δώστε όνομα (π.χ. «ERP intranet»)." };
    const active = await prisma.apiKey.count({ where: { tenantId, revokedAt: null } });
    if (active >= 10) return { ok: false, message: "Έως 10 ενεργά κλειδιά — ανακαλέστε όσα δεν χρησιμοποιούνται." };
    const { id, key } = await createApiKey(tenantId, n, user.id);
    await audit({ actorId: user.id, action: "apikey.create", entity: "ApiKey", entityId: id, tenantId, meta: { name: n } });
    revalidatePath(`/dashboards/${tenantId}/api`);
    return { ok: true, key };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function revokeKey(tenantId: string, id: string): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await manager(tenantId);
    await prisma.apiKey.updateMany({ where: { id, tenantId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit({ actorId: user.id, action: "apikey.revoke", entity: "ApiKey", entityId: id, tenantId });
    revalidatePath(`/dashboards/${tenantId}/api`);
    return { ok: true, message: "Το κλειδί ανακλήθηκε — δεν γίνεται πλέον δεκτό." };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
