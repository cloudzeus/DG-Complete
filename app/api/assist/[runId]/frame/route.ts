import type { NextRequest } from "next/server";
import { requireAssist } from "@/lib/assist/access";
import { assistFrame, getAssist, takeLock } from "@/lib/assist/registry";

// Current image of a waiting run's page (docs/22 §4). Held in memory for 200 ms, never stored or cached.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/assist/[runId]/frame">) {
  const { runId } = await ctx.params;
  const tenantId = req.nextUrl.searchParams.get("tenantId") ?? "";
  const { user, allowed } = await requireAssist(tenantId);
  if (!allowed) return new Response(null, { status: 403 });
  const s = getAssist(runId, tenantId);
  if (!s) return new Response(null, { status: 404 });
  if (!takeLock(s, user).ok) return new Response(null, { status: 423 });
  const buf = await assistFrame(s).catch(() => null);
  if (!buf) return new Response(null, { status: 503 });
  return new Response(new Uint8Array(buf), { headers: { "content-type": "image/jpeg", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
