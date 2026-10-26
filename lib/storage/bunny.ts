import { createHash } from "node:crypto";

// Bunny Storage API + Pull zone Token Authentication (docs/08 §2). Pure functions over a config —
// the config comes from lib/storage/settings (database, ADR-024), never from env.

export type BunnyConfig = { zone: string; region: string | null; accessKey: string; pullZoneHost: string; tokenKey: string };

const storageHost = (region: string | null) => (region ? `${region}.storage.bunnycdn.com` : "storage.bunnycdn.com");
const clean = (path: string) => path.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");

export function storageUrl(cfg: Pick<BunnyConfig, "zone" | "region">, path: string) {
  return `https://${storageHost(cfg.region)}/${encodeURIComponent(cfg.zone)}/${clean(path)}`;
}

export async function bunnyPut(cfg: BunnyConfig, path: string, body: Buffer, contentType: string) {
  const sha256 = createHash("sha256").update(body).digest("hex");
  const res = await fetch(storageUrl(cfg, path), {
    method: "PUT",
    headers: { AccessKey: cfg.accessKey, "Content-Type": contentType, Checksum: sha256.toUpperCase() },
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Bunny PUT ${res.status}`);
  return { sizeBytes: body.length, sha256 };
}

export async function bunnyGet(cfg: BunnyConfig, path: string) {
  const res = await fetch(storageUrl(cfg, path), { headers: { AccessKey: cfg.accessKey }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Bunny GET ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function bunnyDelete(cfg: BunnyConfig, path: string) {
  const res = await fetch(storageUrl(cfg, path), { method: "DELETE", headers: { AccessKey: cfg.accessKey }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok && res.status !== 404) throw new Error(`Bunny DELETE ${res.status}`);
}

/**
 * Signed CDN URL — Bunny Token Authentication (SHA-256): token = base64url(sha256(securityKey + path
 * + expires)), passed as ?token=…&expires=…. Verified against a staging pull zone in P08.
 */
export function bunnySignedUrl(cfg: Pick<BunnyConfig, "pullZoneHost" | "tokenKey">, path: string, ttlSec: number, now = Date.now()) {
  const signedPath = `/${clean(path)}`;
  const expires = Math.floor(now / 1000) + ttlSec;
  const token = createHash("sha256").update(`${cfg.tokenKey}${decodeURIComponent(signedPath)}${expires}`).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `https://${cfg.pullZoneHost}${signedPath}?token=${token}&expires=${expires}`;
}

/** Connection test for the settings page: list the zone root (needs a valid AccessKey). */
export async function bunnyTest(cfg: Pick<BunnyConfig, "zone" | "region" | "accessKey">): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${storageUrl(cfg, "")}`, { headers: { AccessKey: cfg.accessKey, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (res.status === 401) return { ok: false, error: "Λάθος access key του storage zone (401)." };
    if (res.status === 404) return { ok: false, error: "Το storage zone δεν βρέθηκε στην περιοχή που ορίσατε (404)." };
    if (!res.ok) return { ok: false, error: `Το Bunny απάντησε ${res.status}.` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Χωρίς σύνδεση με το Bunny: ${(err as Error).message}` };
  }
}
