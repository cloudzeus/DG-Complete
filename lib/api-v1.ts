import "server-only";
import { ApiAuthError, authenticateApiKey } from "@/lib/api-keys";

// Shared plumbing of /api/v1/*: key authentication, JSON errors, typed values.

export type ApiContext = { tenantId: string; keyId: string; scopes: string[]; collectionIds: string[] };

/** RFC 9457 problem+json (CLAUDE.md §6). */
export function problem(status: number, title: string, extra: Record<string, unknown> = {}) {
  return Response.json({ type: "about:blank", title, status, ...extra }, { status, headers: { ...HEADERS, "Content-Type": "application/problem+json" } });
}

/** A key without scopes (older keys) may do everything; otherwise the scope must be granted. */
export function requireScope(ctx: ApiContext, scope: string) {
  if (ctx.scopes.length && !ctx.scopes.includes(scope)) throw new ApiAuthError(`Το API key δεν έχει δικαίωμα «${scope}».`, 403);
}

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export function apiJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: HEADERS });
}

export function apiHandler<P = unknown>(fn: (req: Request, ctx: ApiContext, route: { params: Promise<P> }) => Promise<Response>) {
  return async (req: Request, route: { params: Promise<P> }) => {
    try {
      const ctx = await authenticateApiKey(req.headers.get("authorization"));
      return await fn(req, ctx, route);
    } catch (err) {
      if (err instanceof ApiAuthError) return problem(err.status, err.message);
      console.error("[api/v1]", (err as Error).message);
      return problem(500, "Εσωτερικό σφάλμα.");
    }
  };
}
