import { apiHandler, apiJson, problem, requireScope } from "@/lib/api-v1";
import { runBody } from "@/lib/methods/invoke";
import { withTenantTx } from "@/lib/tenant-db";

// GET /api/v1/runs/{id} — status and result of a run (docs/07 §3).
export const GET = apiHandler<{ id: string }>(async (_req, ctx, route) => {
  requireScope(ctx, "runs:read");
  const { id } = await route.params;
  const r = await withTenantTx(ctx.tenantId, (tx) => tx.run.findUnique({ where: { id } }));
  if (!r) return problem(404, "Η εκτέλεση δεν βρέθηκε.");
  return apiJson(runBody(r));
});
