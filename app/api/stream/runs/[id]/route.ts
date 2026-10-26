import type { NextRequest } from "next/server";
import { subscribeRun } from "@/lib/queue/events";
import { requireTenant } from "@/lib/tenant";
import { withTenantTx } from "@/lib/tenant-db";

// SSE of a run's progress (docs/06 §8): step.started / step / status events from the worker.
// ?tenantId= is required; access is checked like the run page. Never cached.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/stream/runs/[id]">) {
  const { id } = await ctx.params;
  const tenantId = req.nextUrl.searchParams.get("tenantId") ?? "";
  await requireTenant(tenantId);
  const run = await withTenantTx(tenantId, (tx) => tx.run.findUnique({ where: { id }, select: { status: true } }));
  if (!run) return new Response(null, { status: 404 });

  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      send("status", { type: "status", status: run.status });
      const unsubscribe = await subscribeRun(id, (e) => {
        if (e.tenantId !== tenantId) return;
        send(e.type, e);
        if (e.type === "status" && !["QUEUED", "RUNNING", "RETRY_SCHEDULED"].includes(e.status)) setTimeout(() => cleanup(), 500);
      });
      const ping = setInterval(() => {
        try {
          controller.enqueue(enc.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, 15_000);
      cleanup = () => {
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store, no-transform", connection: "keep-alive", "x-accel-buffering": "no" },
  });
}
