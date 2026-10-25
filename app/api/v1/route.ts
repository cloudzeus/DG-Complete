import { apiHandler, apiJson } from "@/lib/api-v1";
import { tenantAccess } from "@/lib/tenant-services";

// GET /api/v1 — what this key can use.
export const GET = apiHandler(async (_req, { tenantId }) => {
  const access = await tenantAccess(tenantId);
  return apiJson({
    version: 1,
    services: [...access.services],
  });
});
