import { DATASETS } from "@/lib/api-datasets";
import { apiHandler, apiJson } from "@/lib/api-v1";
import { tenantAccess } from "@/lib/tenant-services";

// GET /api/v1 — what this key can use.
export const GET = apiHandler(async (_req, { tenantId }) => {
  const access = await tenantAccess(tenantId);
  return apiJson({
    version: 1,
    endpoints: {
      "GET /api/v1/datasets": "Τα έτοιμα σύνολα δεδομένων",
      "GET /api/v1/datasets/{key}?period=ytd|12m|…&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=": "Ένα σύνολο δεδομένων",
      "GET /api/v1/kpis?period=": "Βασικοί δείκτες και ευρήματα της επισκόπησης",
      "GET /api/v1/meta": "Τα μεγέθη και οι διαστάσεις που μπορείτε να ζητήσετε",
      "POST /api/v1/query": "Δικό σας ερώτημα: { query: { measures, dimensions, timeDimensions, filters, order, limit } }",
    },
    datasets: DATASETS.filter((d) => access.services.has(d.service)).map((d) => d.key),
  });
});
