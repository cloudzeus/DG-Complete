import "dotenv/config";
import { hostname } from "node:os";
import { createServer } from "node:http";
import { z } from "zod";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getBoss } from "@/lib/queue";
import { RUNS_QUEUE } from "@/lib/runs/create";
import { withPlatformTx } from "@/lib/tenant-db";
import { closeBrowser } from "./browser";
import { processRun } from "./run";

// DG Complete worker (docs/06): pg-boss consumer of `runs` + Playwright browser pool.
// Runs with `--conditions=react-server`, so the shared server modules (prisma, crypto, …) that
// import "server-only" load in plain Node.

const Payload = z.object({ runId: z.string().min(1), tenantId: z.string().min(1) });
const WORKER_ID = `${hostname()}:${process.pid}`;
const stats = { active: 0, done: 0, failed: 0, other: 0, durationSum: 0, startedAt: new Date().toISOString() };

function prometheus() {
  return [
    "# HELP dg_worker_active_runs Runs executing in this worker.",
    "# TYPE dg_worker_active_runs gauge",
    `dg_worker_active_runs ${stats.active}`,
    "# HELP dg_worker_runs_total Runs finished by this worker, by outcome.",
    "# TYPE dg_worker_runs_total counter",
    `dg_worker_runs_total{outcome="succeeded"} ${stats.done}`,
    `dg_worker_runs_total{outcome="failed"} ${stats.failed}`,
    `dg_worker_runs_total{outcome="other"} ${stats.other}`,
    "# HELP dg_worker_run_seconds_sum Total seconds spent in runs.",
    "# TYPE dg_worker_run_seconds_sum counter",
    `dg_worker_run_seconds_sum ${(stats.durationSum / 1000).toFixed(3)}`,
    "# HELP dg_worker_rss_bytes Resident memory of the worker process.",
    "# TYPE dg_worker_rss_bytes gauge",
    `dg_worker_rss_bytes ${process.memoryUsage().rss}`,
    "",
  ].join("\n");
}

/** Runs left QUEUED without a live queue job (lost send, restart) get a new one; singletonKey dedupes. */
async function sweep() {
  const stale = await withPlatformTx((tx) =>
    tx.run.findMany({ where: { status: "QUEUED", queuedAt: { lt: new Date(Date.now() - 30_000) } }, select: { id: true, tenantId: true }, take: 200, orderBy: { queuedAt: "asc" } }),
  );
  if (!stale.length) return;
  const boss = await getBoss("worker");
  for (const r of stale) await boss.send(RUNS_QUEUE, { runId: r.id, tenantId: r.tenantId }, { singletonKey: r.id });
}

/** RUNNING runs whose worker died (no lease heartbeat for 10′) → FAILED E_INTERNAL. */
async function reapOrphans() {
  const orphans = await withPlatformTx((tx) =>
    tx.run.findMany({ where: { status: "RUNNING", startedAt: { lt: new Date(Date.now() - 15 * 60_000) } }, select: { id: true } }),
  );
  for (const o of orphans) {
    const lease = await prisma.concurrencyLease.findFirst({ where: { runId: o.id, expiresAt: { gt: new Date() } } });
    if (lease) continue;
    await withPlatformTx((tx) =>
      tx.run.updateMany({ where: { id: o.id, status: "RUNNING" }, data: { status: "FAILED", errorCode: "E_INTERNAL", errorMessage: "Ο worker σταμάτησε κατά την εκτέλεση.", finishedAt: new Date() } }),
    );
  }
}

async function main() {
  const e = env();
  const boss = await getBoss("worker");
  await boss.createQueue(RUNS_QUEUE);
  console.log(`[worker] ${WORKER_ID} — pg-boss started (schema pgboss, concurrency ${e.WORKER_CONCURRENCY})`);

  await boss.work(RUNS_QUEUE, { batchSize: 1, localConcurrency: e.WORKER_CONCURRENCY }, async ([job]) => {
    const p = Payload.safeParse(job.data);
    if (!p.success) {
      console.error("[worker] invalid payload", job.id);
      return;
    }
    stats.active++;
    const t0 = Date.now();
    try {
      const outcome = await processRun(p.data.runId, p.data.tenantId, WORKER_ID);
      if (outcome.startsWith("failed")) stats.failed++;
      else if (outcome === "succeeded") stats.done++;
      else stats.other++;
      stats.durationSum += Date.now() - t0;
      console.log(`[worker] run ${p.data.runId} → ${outcome}`);
    } catch (err) {
      // processRun handles run errors itself; this is infrastructure (DB down …) — let pg-boss retry.
      console.error(`[worker] run ${p.data.runId} crashed:`, (err as Error).message);
      throw err;
    } finally {
      stats.active--;
    }
  });

  const tick = async () => {
    await sweep().catch((err) => console.error("[worker] sweep", (err as Error).message));
    await reapOrphans().catch((err) => console.error("[worker] reap", (err as Error).message));
  };
  void tick();
  const timer = setInterval(() => void tick(), 60_000);

  // Liveness / metrics for Coolify (internal port only).
  const port = Number(process.env.WORKER_METRICS_PORT ?? 9100);
  const server = createServer((req, res) => {
    if (req.url?.startsWith("/metrics")) {
      res.setHeader("content-type", "text/plain; version=0.0.4");
      res.end(prometheus());
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, worker: WORKER_ID, ...stats }));
  });
  server.on("error", (err) => console.error(`[worker] metrics port ${port}:`, err.message));
  server.listen(port, "0.0.0.0");

  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[worker] ${signal} — stopping`);
    clearInterval(timer);
    server.close();
    await boss.stop({ graceful: true, timeout: 60_000 });
    await closeBrowser();
    process.exit(0);
  };
  process.on("SIGINT", () => void stop("SIGINT"));
  process.on("SIGTERM", () => void stop("SIGTERM"));
}

main().catch((err) => {
  console.error("[worker] failed to start:", err instanceof Error ? err.message : err);
  process.exit(1);
});
