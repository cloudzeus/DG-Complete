import { apiHandler, apiJson } from "@/lib/api-v1";
import { kimonCatalog } from "@/lib/kimon/catalog";

// GET /api/v1/meta — the members (cube.member) the tenant's plan allows, with their types.
export const GET = apiHandler(async (_req, { tenantId }) => {
  const { types } = await kimonCatalog(tenantId);
  const cubes: Record<string, { member: string; type: string }[]> = {};
  for (const [member, type] of types) (cubes[member.split(".")[0]] ??= []).push({ member, type });
  return apiJson({ cubes });
});
