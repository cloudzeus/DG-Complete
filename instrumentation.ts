// Runs once per server start. Starts the in-process scheduler for the SoftOne sync jobs.
// Production: on unless SCHEDULER=off. Development: off unless SCHEDULER=on.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const flag = process.env.SCHEDULER;
  const enabled = process.env.NODE_ENV === "production" ? flag !== "off" : flag === "on";
  if (!enabled) return;
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
