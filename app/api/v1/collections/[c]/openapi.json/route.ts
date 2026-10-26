import { apiHandler, apiJson, problem, requireScope } from "@/lib/api-v1";
import { env } from "@/lib/env";
import { collectionOpenApi } from "@/lib/methods/openapi";

// GET /api/v1/collections/{c}/openapi.json — OpenAPI 3.1 of the collection (docs/07 §3).
export const GET = apiHandler<{ c: string }>(async (_req, ctx, route) => {
  requireScope(ctx, "collections:read");
  const { c } = await route.params;
  const doc = await collectionOpenApi(ctx.tenantId, c, env().BETTER_AUTH_URL);
  return doc ? apiJson(doc) : problem(404, "Η συλλογή δεν βρέθηκε.");
});
