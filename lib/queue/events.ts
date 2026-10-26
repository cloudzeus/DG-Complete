import "server-only";
import { Client, Pool } from "pg";
import { env } from "@/lib/env";

// Live run progress (docs/06 §8): the worker publishes with pg_notify, the web listens and forwards
// over SSE. Only on the direct connection (QUEUE_DATABASE_URL) — LISTEN/NOTIFY does not work through
// PgBouncer in transaction mode. Payloads stay small (NOTIFY limit 8 kB) and never carry values.

export const RUN_CHANNEL = "dg_run_events";

export type RunEvent =
  | { type: "step.started"; stepId: string; seq: number; iteration?: number }
  | { type: "step"; stepId: string; seq: number; status: string; durationMs: number; errorCode?: string; iteration?: number }
  | { type: "status"; status: string; errorCode?: string | null };

const g = globalThis as unknown as { __dgEventsPool?: Pool; __dgListener?: Listener };

function pool() {
  g.__dgEventsPool ??= new Pool({ connectionString: env().QUEUE_DATABASE_URL, max: 2, application_name: "dg-complete-events" });
  return g.__dgEventsPool;
}

export async function publishRunEvent(runId: string, tenantId: string, event: RunEvent) {
  const payload = JSON.stringify({ runId, tenantId, ...event }).slice(0, 7900);
  await pool().query("select pg_notify($1, $2)", [RUN_CHANNEL, payload]);
}

type Handler = (event: RunEvent & { runId: string; tenantId: string }) => void;

/** One LISTEN connection per web process, fanned out to the open SSE streams. */
class Listener {
  private client: Client | null = null;
  private connecting: Promise<void> | null = null;
  private handlers = new Map<string, Set<Handler>>();

  private async connect() {
    if (this.client) return;
    this.connecting ??= (async () => {
      const c = new Client({ connectionString: env().QUEUE_DATABASE_URL, application_name: "dg-complete-sse" });
      c.on("notification", (n) => {
        if (n.channel !== RUN_CHANNEL || !n.payload) return;
        try {
          const e = JSON.parse(n.payload) as RunEvent & { runId: string; tenantId: string };
          for (const h of this.handlers.get(e.runId) ?? []) h(e);
        } catch {
          // ignore malformed payloads
        }
      });
      c.on("error", () => {
        this.client = null;
        void c.end().catch(() => undefined);
        if (this.handlers.size) setTimeout(() => void this.connect().catch(() => undefined), 2000);
      });
      await c.connect();
      await c.query(`LISTEN ${RUN_CHANNEL}`);
      this.client = c;
    })().finally(() => (this.connecting = null));
    return this.connecting;
  }

  async subscribe(runId: string, h: Handler) {
    let set = this.handlers.get(runId);
    if (!set) this.handlers.set(runId, (set = new Set()));
    set.add(h);
    await this.connect();
    return () => {
      set.delete(h);
      if (!set.size) this.handlers.delete(runId);
    };
  }
}

export function subscribeRun(runId: string, h: Handler) {
  g.__dgListener ??= new Listener();
  return g.__dgListener.subscribe(runId, h);
}
