import { z } from "zod";
import { apiHandler, apiJson, typedRows } from "@/lib/api-v1";
import { cubeLoad, type CubeQuery } from "@/lib/cube-client";

// POST /api/v1/query — { query: CubeQuery } → rows. Scoped to the tenant and its plan by Cube.
const body = z.object({
  query: z.object({
    measures: z.array(z.string().max(120)).max(30).optional(),
    dimensions: z.array(z.string().max(120)).max(30).optional(),
    timeDimensions: z.array(z.record(z.string(), z.unknown())).max(3).optional(),
    filters: z.array(z.record(z.string(), z.unknown())).max(30).optional(),
    order: z.union([z.record(z.string(), z.enum(["asc", "desc"])), z.array(z.tuple([z.string(), z.enum(["asc", "desc"])]))]).optional(),
    limit: z.number().int().min(1).max(10_000).optional(),
  }),
});

export const POST = apiHandler(async (req, { tenantId }) => {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiJson({ error: "Μη έγκυρο σώμα: { query: { measures, dimensions, … } }" }, 400);
  const query = { ...parsed.data.query, limit: parsed.data.query.limit ?? 1000 } as CubeQuery;
  const rows = await typedRows(tenantId, await cubeLoad(tenantId, query));
  return apiJson({ count: rows.length, data: rows });
});
