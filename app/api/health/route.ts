import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { openSoftOneCredentials } from "@/lib/softone";
import { openCredentials } from "@/lib/connections";

// Liveness + database check for the Coolify / Docker healthcheck.
// `encryption` reports whether DATA_ENCRYPTION_KEYS can decrypt the stored credentials
// (never fails the healthcheck — a wrong key must not restart-loop the container).
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json({ ok: false, error: "database" }, { status: 503 });
  }

  let encryption: "ok" | "mismatch" | "no-data" = "no-data";
  try {
    const s1 = await prisma.softOneConnection.findFirst({ select: { id: true, credentialsEnc: true } });
    const conn = s1 ? null : await prisma.dataConnection.findFirst({ select: { id: true, credentialsEnc: true } });
    if (s1) openSoftOneCredentials(s1.id, s1.credentialsEnc);
    else if (conn) openCredentials(conn.id, conn.credentialsEnc);
    if (s1 || conn) encryption = "ok";
  } catch {
    encryption = "mismatch";
  }
  return NextResponse.json({ ok: true, encryption });
}
