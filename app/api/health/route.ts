import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Liveness + database check for the Coolify / Docker healthcheck.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "database" }, { status: 503 });
  }
}
