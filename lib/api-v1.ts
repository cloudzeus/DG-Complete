import "server-only";
import { ApiAuthError, authenticateApiKey } from "@/lib/api-keys";
import { CubeForbiddenError, type CubeRow } from "@/lib/cube-client";
import { kimonCatalog } from "@/lib/kimon/catalog";

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
      if (err instanceof CubeForbiddenError) return apiJson({ error: err.message }, 403);
      return apiJson({ error: (err as Error).message.slice(0, 300) }, 400);
    }
  };
}

const NUMERIC = new Set(["number", "sum", "count", "countDistinct", "count_distinct", "countDistinctApprox", "avg", "min", "max", "runningTotal"]);

/** Cube returns numbers as strings — convert the numeric members (codes stay strings). */
export async function typedRows(tenantId: string, rows: CubeRow[]) {
  if (!rows.length) return rows;
  const { types } = await kimonCatalog(tenantId);
  const numeric = Object.keys(rows[0]).filter((k) => NUMERIC.has(types.get(k.split(".").slice(0, 2).join(".")) ?? ""));
  return rows.map((r) => {
    const out: CubeRow = { ...r };
    for (const k of numeric) if (out[k] !== null && out[k] !== undefined && out[k] !== "") out[k] = Number(out[k]);
    return out;
  });
}
