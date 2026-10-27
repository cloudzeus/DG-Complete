import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { act, getSession, snapshot, type Action } from "@/lib/recorder/live";
import { requirePermission } from "@/lib/rbac";

// Actions of the live recorder: click / keys / navigation / field capture (docs/04 §10).
// Typed text goes to the page only; it is not logged or stored.
const num = z.number().finite();
const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("click"), x: num, y: num }),
  z.object({ type: z.literal("text"), text: z.string().max(2000) }),
  z.object({ type: z.literal("key"), key: z.string().max(20) }),
  z.object({ type: z.literal("scroll"), dy: num }),
  z.object({ type: z.literal("navigate"), url: z.string().min(1).max(2000) }),
  z.object({ type: z.literal("select"), css: z.string().min(1).max(500), value: z.string().max(500) }),
  z.object({ type: z.literal("extract"), x: num, y: num, key: z.string().min(1).max(40), label: z.string().max(80).optional(), table: z.boolean().optional() }),
  z.object({ type: z.literal("inspect"), x: num, y: num }),
  z.object({ type: z.literal("capture") }),
  z.object({
    type: z.literal("captureApply"),
    fields: z.array(z.object({ css: z.string().max(500), kind: z.enum(["input", "username", "password", "skip"]), repeat: z.boolean().optional() })).max(200),
    repeat: z.object({ list: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/), label: z.string().max(80).optional(), addButtonCss: z.string().max(500).optional(), firstRowExists: z.boolean() }).optional(),
  }),
  z.object({ type: z.literal("undo") }),
  z.object({ type: z.literal("deleteStep"), id: z.string().min(1).max(40) }),
  z.object({ type: z.literal("back") }),
  z.object({ type: z.literal("retry") }),
]);
const Body = z.object({ tenantId: z.string().min(1), action: ActionSchema });

const problem = (status: number, title: string) => NextResponse.json({ type: "about:blank", title, status }, { status, headers: { "content-type": "application/problem+json", "cache-control": "no-store" } });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/recorder/[id]/action">) {
  const { id } = await ctx.params;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return problem(422, "Μη έγκυρη ενέργεια.");
  const user = await requirePermission("tenant.workflows.edit", body.data.tenantId);
  const s = getSession(id, body.data.tenantId, user.id);
  if (!s) return problem(404, "Η καταγραφή έληξε ή δεν βρέθηκε.");
  try {
    const result = await act(s, body.data.action as Action);
    return NextResponse.json({ result, state: snapshot(s) }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    return NextResponse.json({ result: { message: /ERR_BLOCKED_BY_CLIENT/.test(msg) ? "Η διεύθυνση δεν ανήκει στο σύστημα‑στόχο." : "Η ενέργεια δεν ολοκληρώθηκε στη σελίδα." }, state: snapshot(s) }, { headers: { "cache-control": "no-store" } });
  }
}
