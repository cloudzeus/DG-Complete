import { datasetDef } from "@/lib/api-datasets";
import { apiHandler, apiJson, typedRows } from "@/lib/api-v1";
import { cubeLoad } from "@/lib/cube-client";
import { resolvePeriod } from "@/lib/period";
import { tenantAccess } from "@/lib/tenant-services";

// GET /api/v1/datasets/{key}?period=ytd&limit=100 (or from/to) — one dataset as JSON rows.
export const GET = apiHandler(async (req, { tenantId }) => {
  const key = new URL(req.url).pathname.split("/").pop() ?? "";
  const d = datasetDef(key);
  if (!d) return apiJson({ error: `Άγνωστο σύνολο δεδομένων «${key}».` }, 404);
  if (!(await tenantAccess(tenantId)).services.has(d.service)) return apiJson({ error: "Το σύνολο δεν περιλαμβάνεται στο πακέτο σας." }, 403);
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const period = resolvePeriod(sp);
  const limit = Math.min(Math.max(Number(sp.limit ?? 1000) || 1000, 1), 10_000);
  const rows = await typedRows(tenantId, await cubeLoad(tenantId, d.query(period, limit)));
  return apiJson({
    dataset: d.key,
    title: d.title,
    ...(d.periodic ? { period: { from: period.from, to: period.to } } : {}),
    count: rows.length,
    data: rows,
  });
});
