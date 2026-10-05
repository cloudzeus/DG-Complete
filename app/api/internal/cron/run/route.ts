import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runDueJobs } from "@/lib/softone-sync";

// Scheduler tick: runs every due SoftOne sync job (Ρυθμίσεις → Συγχρονισμοί).
// Called every minute by the app's own in-process scheduler (lib/scheduler.ts, started from
// instrumentation.ts). Can also be called manually with Authorization: Bearer $CRON_SECRET.

export const maxDuration = 600;

function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runDueJobs(8 * 60_000));
}
