import { NextResponse } from "next/server";
import { verifyInternalToken } from "@/lib/cube";
import { prisma } from "@/lib/prisma";
import { tenantAccess } from "@/lib/tenant-services";

// Called by the Cube refresh worker (scheduledRefreshContexts) to build pre-aggregations
// for every active tenant. Auth: Bearer CONTROL_PLANE_TOKEN.
export async function GET(request: Request) {
  if (!(await verifyInternalToken(request.headers.get("authorization")))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tenants = await prisma.tenant.findMany({ where: { OR: [{ status: "ACTIVE" }, { isDemo: true }] }, select: { id: true } });
  // modules: the cubes of the tenant's plan (null = no restriction, demo tenants)
  return NextResponse.json(await Promise.all(tenants.map(async (t) => ({ tenantId: t.id, modules: (await tenantAccess(t.id)).cubes }))));
}
