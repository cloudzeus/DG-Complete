import { NextResponse } from "next/server";
import { verifyInternalToken } from "@/lib/cube";
import { prisma } from "@/lib/prisma";

// Called by the Cube refresh worker (scheduledRefreshContexts) to build pre-aggregations
// for every active tenant. Auth: Bearer CONTROL_PLANE_TOKEN.
export async function GET(request: Request) {
  if (!(await verifyInternalToken(request.headers.get("authorization")))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tenants = await prisma.tenant.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  // modules: null = no plan restriction yet (plans arrive in Phase 3)
  return NextResponse.json(tenants.map((t) => ({ tenantId: t.id, modules: null })));
}
