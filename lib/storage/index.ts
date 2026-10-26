import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { bunnyDelete, bunnyGet, bunnyPut, bunnySignedUrl } from "./bunny";
import { storageConfig } from "./settings";

// Artifacts and files (docs/08 §2, docs/21). Only `put` / `signedUrl` / `get` / `delete` from here —
// never a public URL. Driver and Bunny settings come from the database (ADR-024).

export interface Storage {
  put(path: string, body: Buffer, contentType: string): Promise<{ sizeBytes: number; sha256: string }>;
  get(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  signedUrl(path: string, ttlSec?: number): Promise<string>;
}

const LOCAL_ROOT = path.resolve(process.cwd(), ".storage");
const safe = (p: string) => {
  const full = path.resolve(LOCAL_ROOT, p.replace(/^\/+/, ""));
  if (!full.startsWith(LOCAL_ROOT + path.sep)) throw new Error("Μη έγκυρη διαδρομή αρχείου.");
  return full;
};

const localSig = (p: string, exp: number) => createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? "dev").update(`${p}:${exp}`).digest("base64url");

/** Checks a URL signed by the local driver (route /api/artifacts/local). */
export function verifyLocalSignature(p: string, exp: number, sig: string) {
  if (!p || !Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  const want = Buffer.from(localSig(p, exp));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

export async function getStorage(): Promise<Storage> {
  const cfg = await storageConfig();
  if (cfg.driver === "bunny") {
    return {
      put: (p, body, type) => bunnyPut(cfg, p, body, type),
      get: (p) => bunnyGet(cfg, p),
      delete: (p) => bunnyDelete(cfg, p),
      signedUrl: async (p, ttl) => bunnySignedUrl(cfg, p, ttl ?? cfg.ttlSec),
    };
  }
  // Local driver (dev/tests): files under ./.storage, URLs signed with HMAC for /api/artifacts/local.
  return {
    async put(p, body) {
      const full = safe(p);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, body);
      return { sizeBytes: body.length, sha256: createHash("sha256").update(body).digest("hex") };
    },
    get: (p) => readFile(safe(p)),
    delete: (p) => rm(safe(p), { force: true }),
    async signedUrl(p, ttl) {
      const exp = Math.floor(Date.now() / 1000) + (ttl ?? cfg.ttlSec);
      const sig = localSig(p, exp);
      return `/api/artifacts/local?${new URLSearchParams({ path: p, exp: String(exp), sig })}`;
    },
  };
}
