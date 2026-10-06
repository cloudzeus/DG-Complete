import { z } from "zod";
import { runKimon } from "@/lib/kimon/agent";
import type { KimonEvent } from "@/lib/kimon/types";
import { getAiSettings } from "@/lib/openrouter";
import { prisma } from "@/lib/prisma";
import { can, getCurrentUser } from "@/lib/rbac";

// Ask Κίμων. Streams NDJSON events (status → artifacts → answer) while the agent works, so the UI
// can show progress; the turn is stored even if the browser goes away mid-answer.

const body = z.object({
  tenantId: z.string().regex(/^[a-z0-9]{1,40}$/),
  chatId: z.string().max(40).optional(),
  question: z.string().trim().min(1).max(4000),
  context: z
    .object({
      page: z.string().max(40).optional(),
      period: z.string().max(20).optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    })
    .optional(),
});

export const maxDuration = 180;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Μη έγκυρο αίτημα." }, { status: 400 });
  const b = parsed.data;
  if (!can(user, "tenant.dashboards.view", b.tenantId)) return Response.json({ error: "forbidden" }, { status: 403 });

  const [tenant, ai] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: b.tenantId }, select: { id: true, name: true } }),
    getAiSettings(),
  ]);
  if (!tenant) return Response.json({ error: "Ο πελάτης δεν βρέθηκε." }, { status: 404 });
  if (!ai.enabled || !ai.apiKeyEnc) {
    return Response.json({ error: "Ο Κίμων δεν είναι ενεργός αυτή τη στιγμή (Ρυθμίσεις → AI)." }, { status: 503 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (e: KimonEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          open = false; // the browser left; keep working so the answer is stored
        }
      };
      try {
        await runKimon({ tenant, userId: user.id, chatId: b.chatId, question: b.question, context: b.context, emit });
      } catch (err) {
        emit({ type: "error", error: (err as Error).message.slice(0, 300) });
      } finally {
        if (open) controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
