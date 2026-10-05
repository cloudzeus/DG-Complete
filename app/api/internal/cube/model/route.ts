import { NextResponse } from "next/server";
import { verifyInternalToken } from "@/lib/cube";
import { readCubeModel } from "@/lib/cube-model";

// Cube's repositoryFactory fetches the data model from here. Auth: Bearer CONTROL_PLANE_TOKEN.
export async function GET(request: Request) {
  if (!(await verifyInternalToken(request.headers.get("authorization")))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await readCubeModel(), { headers: { "Cache-Control": "no-store" } });
}
