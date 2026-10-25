// Runs once per server start. Validates the environment and starts the in-process scheduler.
// Production: on unless SCHEDULER=off. Development: off unless SCHEDULER=on.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Fail fast on a missing / malformed environment (docs/10 §3).
  const { env } = await import("./lib/env");
  env();
  const flag = process.env.SCHEDULER;
  const enabled = process.env.NODE_ENV === "production" ? flag !== "off" : flag === "on";
  if (!enabled) return;
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
