"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { validate, type FormState } from "@/lib/forms";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { bunnyTest } from "@/lib/storage/bunny";
import { forgetStorageSettings, getStorageSettings, sealAccessKey, sealTokenKey } from "@/lib/storage/settings";
import { decrypt } from "@/lib/crypto";

// Files storage settings (ADR-024). SUPER_ADMIN only — it is platform infrastructure.

async function superAdmin() {
  const user = await requirePermission("platform.settings.manage");
  if (user.platformRole !== "SUPER_ADMIN") throw new Error("Μόνο ο SUPER_ADMIN αλλάζει τις ρυθμίσεις αρχείων.");
  return user;
}

const hint = (k: string) => (k.length > 8 ? `${k.slice(0, 4)}…${k.slice(-4)}` : "••••");

const schema = z
  .object({
    driver: z.enum(["bunny", "local"], { message: "Επιλέξτε αποθήκευση" }),
    storageZone: z.string().trim().regex(/^[a-z0-9-]{3,64}$/, "Λατινικά πεζά, αριθμοί, παύλα").optional().or(z.literal("")),
    region: z.enum(["", "de", "uk", "se", "ny", "la", "sg", "syd", "br", "jh"]).optional(),
    accessKey: z.string().trim().max(200).optional(),
    pullZoneHost: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "π.χ. dg-complete-artifacts.b-cdn.net").optional().or(z.literal("")),
    tokenKey: z.string().trim().max(200).optional(),
    signedUrlTtlSec: z.coerce.number().int().min(60, "Από 60″").max(86_400, "Έως 24 ώρες"),
  });

export async function saveStorageSettings(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await superAdmin();
  const v = validate(schema, fd);
  if ("state" in v) return v.state;
  const current = await getStorageSettings();
  const d = v.data;
  if (d.driver === "bunny") {
    const errors: Record<string, string> = {};
    if (!d.storageZone) errors.storageZone = "Απαιτείται για το Bunny";
    if (!d.pullZoneHost) errors.pullZoneHost = "Απαιτείται για το Bunny";
    if (!d.accessKey && !current.accessKeyEnc) errors.accessKey = "Απαιτείται για το Bunny";
    if (!d.tokenKey && !current.tokenKeyEnc) errors.tokenKey = "Απαιτείται για το Bunny";
    if (Object.keys(errors).length) return { ok: false, errors, message: "Συμπληρώστε τα στοιχεία του Bunny." };
  }
  await prisma.storageSettings.update({
    where: { id: "default" },
    data: {
      driver: d.driver,
      storageZone: d.storageZone || null,
      region: d.region || null,
      pullZoneHost: d.pullZoneHost || null,
      signedUrlTtlSec: d.signedUrlTtlSec,
      updatedById: user.id,
      // Keys: only replaced when typed again (never shown back).
      ...(d.accessKey ? { accessKeyEnc: sealAccessKey(d.accessKey), accessKeyHint: hint(d.accessKey) } : {}),
      ...(d.tokenKey ? { tokenKeyEnc: sealTokenKey(d.tokenKey), tokenKeyHint: hint(d.tokenKey) } : {}),
    },
  });
  forgetStorageSettings();
  await audit({
    actorId: user.id,
    action: "storage.settings",
    entity: "StorageSettings",
    entityId: "default",
    meta: { driver: d.driver, zone: d.storageZone, region: d.region, pullZoneHost: d.pullZoneHost, accessKeyChanged: !!d.accessKey, tokenKeyChanged: !!d.tokenKey },
  });
  revalidatePath("/admin/settings/storage");
  return { ok: true, message: "Οι ρυθμίσεις αρχείων αποθηκεύτηκαν." };
}

export async function testStorageSettings(): Promise<FormState> {
  const user = await superAdmin();
  const s = await getStorageSettings();
  if (s.driver !== "bunny") return { ok: true, message: "Τοπική αποθήκευση (dev) — δεν χρειάζεται δοκιμή." };
  if (!s.storageZone || !s.accessKeyEnc) return { ok: false, message: "Συμπληρώστε πρώτα storage zone και access key." };
  const r = await bunnyTest({ zone: s.storageZone, region: s.region, accessKey: decrypt(s.accessKeyEnc, "storage:access") });
  await prisma.storageSettings.update({ where: { id: "default" }, data: { lastTestAt: new Date(), lastTestOk: r.ok, lastTestError: r.ok ? null : r.error } });
  await audit({ actorId: user.id, action: "storage.test", entity: "StorageSettings", entityId: "default", meta: { ok: r.ok } });
  revalidatePath("/admin/settings/storage");
  return r.ok ? { ok: true, message: "Η σύνδεση με το Bunny Storage πέτυχε." } : { ok: false, message: r.error };
}
