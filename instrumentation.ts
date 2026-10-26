// Runs once per server start. Validates the environment, starts the embedded worker and the in-process scheduler.
// Production: on unless SCHEDULER=off. Development: off unless SCHEDULER=on.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Fail fast on a missing / malformed environment (docs/10 §3).
  const { env } = await import("./lib/env");
  env();
  // First SUPER_ADMIN from SEED_ADMIN_* when none exists; a database error must not stop the server.
  const { bootstrapAdmin } = await import("./lib/bootstrap-admin");
  await bootstrapAdmin().catch((err) => console.error("[bootstrap] admin:", err instanceof Error ? err.message : err));
  // Embedded worker (ADR-025): runs execute in this process unless WORKER_EMBEDDED=off
  // (then a separate worker application consumes the queue). Development: off unless =on.
  const embedded = process.env.WORKER_EMBEDDED;
  if (process.env.NODE_ENV === "production" ? embedded !== "off" : embedded === "on") {
    // Never let the worker take the web down: on any failure the site still starts (runs stay queued).
    import("./worker/consumer")
      .then(({ startWorker }) => startWorker({ metricsPort: null, label: "embedded" }))
      .catch((err) => console.error("[worker] embedded failed to start:", err instanceof Error ? err.message : err));
  }
  const flag = process.env.SCHEDULER;
  const enabled = process.env.NODE_ENV === "production" ? flag !== "off" : flag === "on";
  if (!enabled) return;
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
