import { DATASETS } from "@/lib/api-datasets";
import { apiHandler, apiJson } from "@/lib/api-v1";
import { tenantAccess } from "@/lib/tenant-services";

// GET /api/v1/datasets — the ready-made datasets of the tenant's plan.
export const GET = apiHandler(async (_req, { tenantId }) => {
  const access = await tenantAccess(tenantId);
  return apiJson({
    data: DATASETS.filter((d) => access.services.has(d.service)).map((d) => ({ key: d.key, title: d.title, description: d.description, periodic: d.periodic })),
  });
});
