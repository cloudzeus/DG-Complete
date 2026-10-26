import type { NextRequest } from "next/server";
import { frame, getSession } from "@/lib/recorder/live";
import { requirePermission } from "@/lib/rbac";

// Current image of the live recorder's browser (docs/04 §10). Not stored anywhere; never cached.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/recorder/[id]/frame">) {
  const { id } = await ctx.params;
  const tenantId = req.nextUrl.searchParams.get("tenantId") ?? "";
  const user = await requirePermission("tenant.workflows.edit", tenantId);
  const s = getSession(id, tenantId, user.id);
  if (!s) return new Response(null, { status: 404 });
  const buf = await frame(s).catch(() => null);
  if (!buf) return new Response(null, { status: 503 });
  return new Response(new Uint8Array(buf), { headers: { "content-type": "image/jpeg", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
