// SSRF guard (docs/08 §3): page navigations only to the target's allowed origins; no request at all
// to loopback / private / link-local addresses unless that origin is explicitly allowed.
import type { BrowserContext } from "playwright";

const PRIVATE = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

export function isPrivateHost(host: string) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80:")) return true;
  return PRIVATE.some((r) => r.test(h));
}

/** The UI stores hosts ("erp.example.gr", "localhost:4100"); a host gets the scheme of the base URL. */
export function normalizeOrigins(list: string[], baseUrl: string): string[] {
  const proto = new URL(baseUrl).protocol;
  const out = new Set<string>([new URL(baseUrl).origin]);
  for (const raw of list) {
    const v = raw.trim();
    if (!v) continue;
    try {
      out.add(new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `${proto}//${v}`).origin);
    } catch {
      // ignore malformed entries
    }
  }
  return [...out];
}

/** Returns `allow(origin)` to extend the allowlist at runtime (live recorder, after the user agrees). */
export async function installGuard(context: BrowserContext, allowedOrigins: string[], onBlock: (origin: string, reason: "private" | "origin", url: string) => void) {
  const allowed = new Set(allowedOrigins.map((o) => new URL(o).origin));
  await context.route("**/*", (route) => {
    const req = route.request();
    let url: URL;
    try {
      url = new URL(req.url());
    } catch {
      return route.continue();
    }
    if (!/^https?:$/.test(url.protocol)) return route.continue();
    const ok = allowed.has(url.origin);
    if (!ok && isPrivateHost(url.hostname)) {
      onBlock(url.origin, "private", url.toString());
      return route.abort("blockedbyclient");
    }
    if (!ok && req.isNavigationRequest() && req.frame() === req.frame().page()?.mainFrame()) {
      onBlock(url.origin, "origin", url.toString());
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  return {
    allow(origin: string) {
      const o = new URL(origin).origin;
      if (isPrivateHost(new URL(o).hostname)) throw new Error("private origin");
      allowed.add(o);
    },
  };
}
