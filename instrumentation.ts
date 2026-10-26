// Runs once per server start. Validates the environment and starts the in-process scheduler.
// Production: on unless SCHEDULER=off. Development: off unless SCHEDULER=on.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Fail fast on a missing / malformed environment (docs/10 §3).
  const { env } = await import("./lib/env");
  env();
  // First SUPER_ADMIN from SEED_ADMIN_* when none exists; a database error must not stop the server.
  const { bootstrapAdmin } = await import("./lib/bootstrap-admin");
  await bootstrapAdmin().catch((err) => console.error("[bootstrap] admin:", err instanceof Error ? err.message : err));
  const flag = process.env.SCHEDULER;
  const enabled = process.env.NODE_ENV === "production" ? flag !== "off" : flag === "on";
  if (!enabled) return;
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
