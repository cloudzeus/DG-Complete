import { PgBoss } from "pg-boss";
import { env } from "@/lib/env";

// Queues on Postgres with pg-boss (ADR-022 — no Redis/Valkey). pg-boss keeps its tables in the
// `pgboss` schema and connects directly to Postgres (QUEUE_DATABASE_URL, port 5432), never through
// PgBouncer: it needs LISTEN/NOTIFY and session-pinned connections.
// Queue names, zod payloads and producers come with P08.

export const QUEUE_SCHEMA = "pgboss";

const g = globalThis as unknown as { __dgBoss?: Promise<PgBoss> };

export function createBoss(role: "web" | "worker") {
  const e = env();
  return new PgBoss({
    connectionString: e.QUEUE_DATABASE_URL,
    schema: QUEUE_SCHEMA,
    max: e.QUEUE_POOL_MAX,
    application_name: `dg-complete-${role}`,
    useListenNotify: true,
  });
}

/** One started pg-boss per process (survives HMR in dev). */
export function getBoss(role: "web" | "worker" = "web"): Promise<PgBoss> {
  g.__dgBoss ??= (async () => {
    const boss = createBoss(role);
    boss.on("error", (err) => console.error("[queue]", err.message));
    await boss.start();
    return boss;
  })().catch((err) => {
    g.__dgBoss = undefined;
    throw err;
  });
  return g.__dgBoss;
}
