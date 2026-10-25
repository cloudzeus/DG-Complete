import "dotenv/config";
import { env } from "@/lib/env";
import { getBoss } from "@/lib/queue";

// DG Complete worker (docs/06): pg-boss consumers + Playwright browser pool.
// Runs with `--conditions=react-server`, so the shared server modules (prisma, crypto, …) that
// import "server-only" load in plain Node. Consumers come with P08.

async function main() {
  const e = env();
  const boss = await getBoss("worker");
  console.log(`[worker] pg-boss started (schema pgboss, concurrency ${e.WORKER_CONCURRENCY})`);

  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[worker] ${signal} — stopping`);
    await boss.stop({ graceful: true, timeout: 30_000 });
    process.exit(0);
  };
  process.on("SIGINT", () => void stop("SIGINT"));
  process.on("SIGTERM", () => void stop("SIGTERM"));
}

main().catch((err) => {
  console.error("[worker] failed to start:", err instanceof Error ? err.message : err);
  process.exit(1);
});
