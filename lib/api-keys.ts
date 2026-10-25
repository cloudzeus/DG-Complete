import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hasService } from "@/lib/tenant-services";

// Web-services keys: "dgbi_" + 32 random bytes (base64url). Only the SHA-256 is stored; the key
// is shown once when created. A request is accepted when the key is active, the tenant is active
// (or demo) and its plan includes the API service.

export const API_KEY_PREFIX = "dgbi_";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createApiKey(tenantId: string, name: string, createdById: string | null) {
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  const row = await prisma.apiKey.create({
    data: { tenantId, name, prefix: key.slice(0, 12), hash: sha256(key), createdById },
  });
  return { id: row.id, key };
}

export class ApiAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// Fixed window rate limit per key (in-process): enough to stop runaway loops.
const LIMIT = 120;
const WINDOW = 60_000;
const hits = new Map<string, { start: number; count: number }>();
const lastSeen = new Map<string, number>();

export async function authenticateApiKey(authorization: string | null) {
  const key = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
  if (!key.startsWith(API_KEY_PREFIX)) throw new ApiAuthError("Λείπει ή δεν είναι έγκυρο το API key (Authorization: Bearer dgbi_…).", 401);
  const row = await prisma.apiKey.findUnique({
    where: { hash: sha256(key) },
    select: { id: true, tenantId: true, revokedAt: true, tenant: { select: { status: true, isDemo: true } } },
  });
  if (!row || row.revokedAt) throw new ApiAuthError("Το API key δεν είναι έγκυρο ή έχει ανακληθεί.", 401);
  if (!row.tenant.isDemo && row.tenant.status !== "ACTIVE") throw new ApiAuthError("Ο λογαριασμός της εταιρείας δεν είναι ενεργός.", 403);
  if (!(await hasService(row.tenantId, "api"))) throw new ApiAuthError("Τα web services δεν περιλαμβάνονται στο πακέτο σας.", 403);

  const now = Date.now();
  const h = hits.get(row.id);
  if (!h || now - h.start > WINDOW) hits.set(row.id, { start: now, count: 1 });
  else if (++h.count > LIMIT) throw new ApiAuthError(`Πάρα πολλά αιτήματα — έως ${LIMIT} ανά λεπτό.`, 429);

  // lastUsedAt at most once a minute per key.
  if (now - (lastSeen.get(row.id) ?? 0) > 60_000) {
    lastSeen.set(row.id, now);
    await prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  }
  return { tenantId: row.tenantId, keyId: row.id };
}
