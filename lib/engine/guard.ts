// SSRF guard (docs/08 §3): page navigations only to the target's allowed origins; no request at all
// to loopback / private / link-local addresses unless that origin is explicitly allowed.
import type { BrowserContext } from "playwright";

const PRIVATE = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

export function isPrivateHost(host: string) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80:")) return true;
  return PRIVATE.some((r) => r.test(h));
}

export async function installGuard(context: BrowserContext, allowedOrigins: string[], onBlock: (url: string, reason: string) => void) {
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
      onBlock(url.origin, "private");
      return route.abort("blockedbyclient");
    }
    if (!ok && req.isNavigationRequest() && req.frame() === req.frame().page()?.mainFrame()) {
      onBlock(url.origin, "origin");
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
}
