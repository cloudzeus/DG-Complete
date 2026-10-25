"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { lookupAfm } from "@/lib/kad";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export type RegistryFormState = { ok?: boolean; message?: string; errors?: Partial<Record<"url" | "batchSize" | "testAfm", string>> };

const schema = z.object({
  url: z.url("Μη έγκυρη διεύθυνση").refine((u) => u.startsWith("https://"), "Απαιτείται https://"),
  enabled: z.boolean(),
  batchSize: z.coerce.number().int().min(10, "≥ 10").max(5000, "≤ 5000"),
  testAfm: z.string().trim().regex(/^[0-9]{9}$/, "9 ψηφία"),
});

export async function saveRegistrySettings(_prev: RegistryFormState, fd: FormData): Promise<RegistryFormState> {
  const user = await requirePermission("platform.settings.manage");
  const parsed = schema.safeParse({ url: fd.get("url"), enabled: fd.get("enabled") === "on", batchSize: fd.get("batchSize"), testAfm: fd.get("testAfm") });
  if (!parsed.success) {
    const errors: RegistryFormState["errors"] = {};
    for (const i of parsed.error.issues) errors[i.path[0] as "url" | "batchSize" | "testAfm"] ??= i.message;
    return { errors };
  }
  const v = parsed.data;
  let found = "";
  try {
    const info = await lookupAfm(v.url, v.testAfm);
    if (!info) return { errors: { testAfm: "Η υπηρεσία δεν επέστρεψε στοιχεία για αυτό το ΑΦΜ." } };
    found = `${info.name ?? info.afm} — κύριος ΚΑΔ ${info.mainKad ?? "—"} ${info.mainKadDescr ?? ""} (${info.kads.length} ΚΑΔ)`;
  } catch (err) {
    await prisma.afmLookupSettings.update({ where: { id: "default" }, data: { lastTestAt: new Date(), lastTestOk: false, lastTestError: (err as Error).message.slice(0, 300) } });
    return { errors: { url: (err as Error).message.slice(0, 200) } };
  }
  await prisma.afmLookupSettings.update({
    where: { id: "default" },
    data: { url: v.url, enabled: v.enabled, batchSize: v.batchSize, lastTestAt: new Date(), lastTestOk: true, lastTestError: null },
  });
  await audit({ actorId: user.id, action: "registry.settings", entity: "AfmLookupSettings", entityId: "default", meta: { url: v.url, enabled: v.enabled, batchSize: v.batchSize } });
  revalidatePath("/admin/settings/registry");
  return { ok: true, message: `Αποθηκεύτηκε. Δοκιμή: ${found}.` };
}
