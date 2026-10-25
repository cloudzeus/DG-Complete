// In-process scheduler: the app runs its own SoftOne sync jobs — no external cron (Coolify) needed.
// Every minute it calls this server's /api/internal/cron/run, which runs the jobs whose nextRunAt has
// passed. Safe with several replicas: each job holds a per-job RUNNING lock in the database.
//
// Env: SCHEDULER=off disables it (e.g. on extra replicas); CRON_SECRET authorises the call.

const TICK_MS = 60_000;
const FIRST_TICK_MS = 15_000;

type SchedulerState = { started: boolean; running: boolean; lastTick?: string; lastResult?: unknown };

const g = globalThis as unknown as { __dgScheduler?: SchedulerState };

export function schedulerState(): SchedulerState {
  return g.__dgScheduler ?? { started: false, running: false };
}

export function startScheduler() {
  if (g.__dgScheduler?.started) return; // HMR / repeated register() in dev
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[scheduler] CRON_SECRET is not set — SoftOne sync jobs will not run automatically.");
    return;
  }
  const state: SchedulerState = { started: true, running: false };
  g.__dgScheduler = state;
  const url = `http://127.0.0.1:${process.env.PORT ?? 3000}/api/internal/cron/run`;

  const tick = async () => {
    if (state.running) return; // previous tick still busy
    state.running = true;
    state.lastTick = new Date().toISOString();
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(10 * 60_000),
      });
      state.lastResult = res.ok ? await res.json() : { status: res.status };
      const r = state.lastResult as { ran?: number; results?: { job: string; ok: boolean; error?: string }[] };
      if (r.ran) {
        for (const x of r.results ?? []) {
          console.log(`[scheduler] ${x.ok ? "✓" : "✗"} ${x.job}${x.error ? ` — ${x.error}` : ""}`);
        }
      }
    } catch (err) {
      state.lastResult = { error: (err as Error).message };
      console.error("[scheduler] tick failed:", (err as Error).message);
    } finally {
      state.running = false;
    }
  };

  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), TICK_MS).unref();
  }, FIRST_TICK_MS).unref();
  console.log("[scheduler] started — SoftOne sync jobs run every minute (SCHEDULER=off to disable)");
}
