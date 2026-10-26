import "dotenv/config";
import { startWorker } from "./consumer";

// DG Complete worker process (docs/06) — for scaling out beyond the worker embedded in the web
// (ADR-025). Runs with `--conditions=react-server`, so the shared server modules (prisma, crypto, …)
// that import "server-only" load in plain Node.

startWorker()
  .then((stop) => {
    const exit = (signal: string) => void stop(signal).finally(() => process.exit(0));
    process.on("SIGINT", () => exit("SIGINT"));
    process.on("SIGTERM", () => exit("SIGTERM"));
  })
  .catch((err) => {
    console.error("[worker] failed to start:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
