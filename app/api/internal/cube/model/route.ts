import { NextResponse } from "next/server";
import { CUBE_DEPLOYMENT_ID, verifyInternalToken } from "@/lib/cube";
import { readCubeModel } from "@/lib/cube-model";
import { prisma } from "@/lib/prisma";

// Cube's repositoryFactory fetches the data model from here. Auth: Bearer CONTROL_PLANE_TOKEN.
export async function GET(request: Request) {
  if (!(await verifyInternalToken(request.headers.get("authorization")))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const deployment = await prisma.cubeDeployment.findUnique({ where: { id: CUBE_DEPLOYMENT_ID }, select: { modelExclude: true } });
  const { version, files } = await readCubeModel(deployment?.modelExclude ?? []);
  return NextResponse.json({ version, files }, { headers: { "Cache-Control": "no-store" } });
}
