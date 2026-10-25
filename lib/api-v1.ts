import "server-only";
import { ApiAuthError, authenticateApiKey } from "@/lib/api-keys";

// Shared plumbing of /api/v1/*: key authentication, JSON errors, typed values.

export type ApiContext = { tenantId: string; keyId: string };

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export function apiJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: HEADERS });
}

export function apiHandler(fn: (req: Request, ctx: ApiContext) => Promise<Response>) {
  return async (req: Request) => {
    try {
      const ctx = await authenticateApiKey(req.headers.get("authorization"));
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof ApiAuthError) return apiJson({ error: err.message }, err.status);
      return apiJson({ error: (err as Error).message.slice(0, 300) }, 400);
    }
  };
}
