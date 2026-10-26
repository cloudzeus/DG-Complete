import "server-only";
import { decrypt, encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

// Storage settings (ADR-024): stored in the database by the SUPER_ADMIN, keys encrypted. Read by web
// and worker with a 60-second cache; `forgetStorageSettings()` after a change.

const AAD = { access: "storage:access", token: "storage:token" } as const;
export const sealAccessKey = (k: string) => encrypt(k, AAD.access);
export const sealTokenKey = (k: string) => encrypt(k, AAD.token);

export type StorageConfig =
  | { driver: "local"; ttlSec: number }
  | { driver: "bunny"; ttlSec: number; zone: string; region: string | null; accessKey: string; pullZoneHost: string; tokenKey: string };

export async function getStorageSettings() {
  return (await prisma.storageSettings.findUnique({ where: { id: "default" } })) ?? (await prisma.storageSettings.create({ data: { id: "default" } }));
}

const g = globalThis as unknown as { __dgStorageCfg?: { at: number; cfg: StorageConfig } };

export function forgetStorageSettings() {
  g.__dgStorageCfg = undefined;
}

export async function storageConfig(): Promise<StorageConfig> {
  if (g.__dgStorageCfg && Date.now() - g.__dgStorageCfg.at < 60_000) return g.__dgStorageCfg.cfg;
  const s = await getStorageSettings();
  let cfg: StorageConfig = { driver: "local", ttlSec: s.signedUrlTtlSec };
  if (s.driver === "bunny") {
    if (!s.storageZone || !s.accessKeyEnc || !s.pullZoneHost || !s.tokenKeyEnc) {
      throw new Error("Το Bunny δεν έχει ρυθμιστεί πλήρως (Ρυθμίσεις → Αρχεία · Bunny).");
    }
    cfg = {
      driver: "bunny",
      ttlSec: s.signedUrlTtlSec,
      zone: s.storageZone,
      region: s.region,
      accessKey: decrypt(s.accessKeyEnc, AAD.access),
      pullZoneHost: s.pullZoneHost,
      tokenKey: decrypt(s.tokenKeyEnc, AAD.token),
    };
  }
  g.__dgStorageCfg = { at: Date.now(), cfg };
  return cfg;
}
