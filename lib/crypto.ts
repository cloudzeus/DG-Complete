import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM envelope:  <keyId>.<iv>.<tag>.<ciphertext>  (base64url parts)
// Keys: DATA_ENCRYPTION_KEYS="k1:<base64 32 bytes>,k2:<base64 32 bytes>" — the first key encrypts,
// every listed key can decrypt (rotation: prepend a new key, re-encrypt, then drop the old one).

type Keyring = { activeId: string; keys: Map<string, Buffer> };

let keyring: Keyring | null = null;

function loadKeyring(): Keyring {
  if (keyring) return keyring;
  // Tolerate values pasted with surrounding quotes/whitespace (e.g. copied from a .env file).
  const raw = process.env.DATA_ENCRYPTION_KEYS?.trim().replace(/^(['"])(.*)\1$/, "$2").trim();
  if (!raw) throw new Error("DATA_ENCRYPTION_KEYS is not set");
  const keys = new Map<string, Buffer>();
  let activeId = "";
  for (const entry of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [id, b64] = entry.split(":");
    const key = Buffer.from(b64 ?? "", "base64");
    if (!id || key.length !== 32) throw new Error(`Invalid encryption key entry '${id}'`);
    keys.set(id, key);
    activeId ||= id;
  }
  keyring = { activeId, keys };
  return keyring;
}

export function encrypt(plaintext: string, aad: string): string {
  const { activeId, keys } = loadKeyring();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keys.get(activeId)!, iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [activeId, iv, cipher.getAuthTag(), ct]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function decrypt(envelope: string, aad: string): string {
  const { keys } = loadKeyring();
  const [id, iv, tag, ct] = envelope.split(".");
  const key = keys.get(id);
  if (!key || !iv || !tag || !ct) {
    throw new Error(`Cannot decrypt: key '${id}' is not in DATA_ENCRYPTION_KEYS (or the value is malformed)`);
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  try {
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error(`Cannot decrypt with key '${id}': DATA_ENCRYPTION_KEYS differs from the key that encrypted this data`);
  }
}

export function encryptJson(value: unknown, aad: string): string {
  return encrypt(JSON.stringify(value), aad);
}

export function decryptJson<T>(envelope: string, aad: string): T {
  return JSON.parse(decrypt(envelope, aad)) as T;
}
