"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { decrypt } from "@/lib/crypto";
import { geocode, getGeoSettings, sealMapboxToken } from "@/lib/mapbox";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export type GeoFormState = { ok?: boolean; message?: string; errors?: Partial<Record<"token" | "batchSize", string>> };

const schema = z.object({
  token: z.string().trim().max(300).optional(),
  enabled: z.boolean(),
  batchSize: z.coerce.number().int().min(10, "≥ 10").max(5000, "≤ 5000"),
});

export async function saveGeoSettings(_prev: GeoFormState, fd: FormData): Promise<GeoFormState> {
  const user = await requirePermission("platform.settings.manage");
  const parsed = schema.safeParse({ token: fd.get("token") || undefined, enabled: fd.get("enabled") === "on", batchSize: fd.get("batchSize") });
  if (!parsed.success) {
    const errors: GeoFormState["errors"] = {};
    for (const i of parsed.error.issues) errors[i.path[0] as "token" | "batchSize"] ??= i.message;
    return { errors };
  }
  const v = parsed.data;
  const current = await getGeoSettings();
  const token = v.token || (current.tokenEnc ? decrypt(current.tokenEnc, "geo_settings:default") : "");
  if (!token) return { errors: { token: "Δώστε Mapbox access token" } };
  if (!token.startsWith("pk.")) return { errors: { token: "Χρειάζεται δημόσιο token (pk.…) — χρησιμοποιείται και για τον χάρτη στον browser." } };

  // A test lookup (not permanent, nothing stored) proves the token works.
  let label = "";
  try {
    label = (await geocode("Σταδίου 10, Αθήνα", token, { permanent: false }))?.label ?? "χωρίς αποτέλεσμα";
  } catch (err) {
    await prisma.geoSettings.update({ where: { id: "default" }, data: { lastTestAt: new Date(), lastTestOk: false, lastTestError: (err as Error).message.slice(0, 300) } });
    return { errors: { token: (err as Error).message.slice(0, 200) } };
  }
  await prisma.geoSettings.update({
    where: { id: "default" },
    data: {
      ...(v.token ? { tokenEnc: sealMapboxToken(v.token), keyHint: `${v.token.slice(0, 6)}…${v.token.slice(-4)}` } : {}),
      enabled: v.enabled,
      batchSize: v.batchSize,
      lastTestAt: new Date(),
      lastTestOk: true,
      lastTestError: null,
    },
  });
  await audit({ actorId: user.id, action: "geo.settings", entity: "GeoSettings", entityId: "default", meta: { enabled: v.enabled, batchSize: v.batchSize, tokenChanged: !!v.token } });
  revalidatePath("/admin/settings/geo");
  return { ok: true, message: `Αποθηκεύτηκε. Δοκιμή: «Σταδίου 10, Αθήνα» → ${label}.` };
}
