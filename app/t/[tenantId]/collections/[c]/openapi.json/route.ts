import { getCollection } from "@/lib/data/tenant";
import { env } from "@/lib/env";
import { collectionOpenApi } from "@/lib/methods/openapi";
import { requireTenant } from "@/lib/tenant";

// OpenAPI of a collection for the signed-in user (download from the UI; the API itself uses keys).
export async function GET(_req: Request, ctx: RouteContext<"/t/[tenantId]/collections/[c]/openapi.json">) {
  const { tenantId, c } = await ctx.params;
  await requireTenant(tenantId);
  const col = await getCollection(tenantId, c);
  const doc = col ? await collectionOpenApi(tenantId, col.slug, env().BETTER_AUTH_URL) : null;
  if (!doc) return new Response(null, { status: 404 });
  return new Response(JSON.stringify(doc, null, 2), {
    headers: { "content-type": "application/json", "cache-control": "no-store", "content-disposition": `attachment; filename="${col!.slug}.openapi.json"` },
  });
}
