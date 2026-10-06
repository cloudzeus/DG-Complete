import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runAiHousekeeping } from "@/lib/ai-alerts";
import { runSubscriptionReminders } from "@/lib/email";
import { runGeocoding } from "@/lib/geo";
import { runKadLookups } from "@/lib/kad";
import { runWeeklyReports } from "@/lib/weekly-report";
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

const HOURLY = [
  ["reminders", runSubscriptionReminders], // each reminder once (dedupe in email_log)
  ["geocoding", runGeocoding], // new / changed customer addresses
  ["kad", runKadLookups], // activity codes by AFM
  ["ai", runAiHousekeeping], // monthly plan tokens + low OpenRouter credit alert
  ["weekly", runWeeklyReports], // Κίμων's report, Monday morning
] as const;

export async function POST(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Hourly tasks run in the background: they can take minutes and must not hold up the syncs.
  const g = globalThis as { __dgHourlyAt?: number; __dgHourlyRunning?: boolean };
  let hourly = false;
  if (!g.__dgHourlyRunning && (!g.__dgHourlyAt || Date.now() - g.__dgHourlyAt > 3600_000)) {
    g.__dgHourlyAt = Date.now();
    g.__dgHourlyRunning = true;
    hourly = true;
    void (async () => {
      for (const [name, task] of HOURLY) {
        try {
          console.log(`[hourly] ${name}`, JSON.stringify(await task()).slice(0, 300));
        } catch (err) {
          console.error(`[hourly] ${name} failed:`, (err as Error).message);
        }
      }
    })().finally(() => {
      g.__dgHourlyRunning = false;
    });
  }
  return NextResponse.json({ ...(await runDueJobs(8 * 60_000)), ...(hourly ? { hourly: "started" } : {}) });
}
