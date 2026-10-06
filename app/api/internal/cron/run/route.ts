import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runSubscriptionReminders } from "@/lib/email";
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
  // Subscription reminders: checked once an hour (each reminder is sent once — dedupe in email_log).
  const g = globalThis as { __dgRemindersAt?: number };
  let reminders: unknown = null;
  if (!g.__dgRemindersAt || Date.now() - g.__dgRemindersAt > 3600_000) {
    g.__dgRemindersAt = Date.now();
    reminders = await runSubscriptionReminders().catch((err: Error) => ({ error: err.message }));
  }
  return NextResponse.json({ ...(await runDueJobs(8 * 60_000)), ...(reminders ? { reminders } : {}) });
}
