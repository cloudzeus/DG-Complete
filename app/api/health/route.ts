import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { openSoftOneCredentials } from "@/lib/softone";
import { keyFingerprint } from "@/lib/crypto";

// Liveness + database check for the Coolify / Docker healthcheck.
// `encryption` reports whether DATA_ENCRYPTION_KEYS can decrypt the stored credentials
// (never fails the healthcheck — a wrong key must not restart-loop the container).
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json({ ok: false, error: "database" }, { status: 503 });
  }

  let encryption: "ok" | "mismatch" | "no-data" | "not-set" = "no-data";
  const key = keyFingerprint();
  if ("error" in key) {
    return NextResponse.json({ ok: true, encryption: "not-set", key });
  }
  try {
    const s1 = await prisma.softOneConnection.findFirst({ select: { id: true, credentialsEnc: true } });
    if (s1) {
      openSoftOneCredentials(s1.id, s1.credentialsEnc);
      encryption = "ok";
    }
  } catch {
    encryption = "mismatch";
  }
  return NextResponse.json({ ok: true, encryption, key });
}
