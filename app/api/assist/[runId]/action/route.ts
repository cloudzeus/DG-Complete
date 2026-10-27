import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAssist } from "@/lib/assist/access";
import { assistBoxes, assistState, getAssist, inside, releaseLock, takeLock, type AssistSession } from "@/lib/assist/registry";
import { audit } from "@/lib/audit";

// Operator input for a waiting run (docs/22 §2, §4). Focus mode: clicks only inside the allowed
// elements, typing only while one of them has focus. Text and field values go to the page only;
// the audit says that input happened, never what.
const num = z.number().finite();
const KEYS = ["Backspace", "Delete", "Tab", "Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Escape"] as const;
const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("open") }),
  z.object({ type: z.literal("state") }),
  z.object({ type: z.literal("click"), x: num, y: num }),
  z.object({ type: z.literal("text"), text: z.string().max(500) }),
  z.object({ type: z.literal("key"), key: z.enum(KEYS) }),
  z.object({ type: z.literal("scroll"), dy: num }),
  z.object({ type: z.literal("fields"), values: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/), z.string().max(200)) }),
  z.object({ type: z.literal("complete") }),
  z.object({ type: z.literal("cancel") }),
  z.object({ type: z.literal("release") }),
]);
const Body = z.object({ tenantId: z.string().min(1), action: ActionSchema });
type Action = z.infer<typeof ActionSchema>;

const problem = (status: number, title: string) => NextResponse.json({ type: "about:blank", title, status }, { status, headers: { "content-type": "application/problem+json", "cache-control": "no-store" } });
const ok = (body: unknown) => NextResponse.json(body, { headers: { "cache-control": "no-store" } });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/assist/[runId]/action">) {
  const { runId } = await ctx.params;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return problem(422, "Μη έγκυρη ενέργεια.");
  const { tenantId, action } = body.data;
  const { user, allowed, full } = await requireAssist(tenantId);
  if (!allowed) return problem(403, "Η ζωντανή προβολή είναι διαθέσιμη μόνο σε μέλη του οργανισμού.");
  const s = getAssist(runId, tenantId);
  if (!s) return problem(404, "Η εκτέλεση δεν περιμένει πια ενέργεια ή εκτελείται σε ξεχωριστό worker χωρίς ζωντανή προβολή.");
  if (action.type === "release") {
    releaseLock(s, user.id);
    return ok({ state: null });
  }
  const lock = takeLock(s, user);
  if (!lock.ok) return ok({ result: { lockedBy: lock.by }, state: await assistState(s) });
  const meta = { stepId: s.task.stepId, mode: s.task.mode };
  if (!s.openedBy.has(user.id)) {
    s.openedBy.add(user.id);
    await audit({ actorId: user.id, action: "assist.open", entity: "Run", entityId: runId, tenantId, meta });
  }

  try {
    const result = await act(s, action, { userId: user.id, tenantId, full });
    return ok({ result, state: action.type === "complete" || action.type === "cancel" ? null : await assistState(s) });
  } catch {
    return ok({ result: { message: "Η ενέργεια δεν ολοκληρώθηκε στη σελίδα. Δοκιμάστε ξανά." }, state: await assistState(s).catch(() => null) });
  }
}

async function act(s: AssistSession, a: Action, who: { userId: string; tenantId: string; full: boolean }): Promise<Record<string, unknown>> {
  const page = s.task.page;
  const focus = s.task.mode === "focus";
  if (!focus && !who.full && ["click", "text", "key", "scroll"].includes(a.type)) {
    return { message: "Αυτή η ενέργεια (CAPTCHA) θέλει πλήρη έλεγχο της σελίδας· χρειάζεται το δικαίωμα «Πλήρης έλεγχος σελίδας»." };
  }
  const typed = async () => {
    const last = s.audited.get(who.userId) ?? 0;
    if (Date.now() - last < 30_000) return;
    s.audited.set(who.userId, Date.now());
    await audit({ actorId: who.userId, action: "assist.input", entity: "Run", entityId: s.runId, tenantId: who.tenantId, meta: { stepId: s.task.stepId } });
  };
  const after = () => {
    s.frame = undefined;
    s.boxes = undefined;
  };

  switch (a.type) {
    case "open":
    case "state":
      return {};
    case "click": {
      if (focus && !inside(await assistBoxes(s), a.x, a.y)) return { ignored: true, message: "Επιτρέπεται κλικ μόνο στα σημειωμένα πεδία." };
      await page.mouse.click(a.x, a.y);
      after();
      return {};
    }
    case "text": {
      if (focus && !(await s.task.focusAllowed())) return { ignored: true, message: "Κάντε πρώτα κλικ στο σημειωμένο πεδίο." };
      await page.keyboard.insertText(a.text);
      await typed();
      after();
      return {};
    }
    case "key": {
      if (focus && !(await s.task.focusAllowed())) return { ignored: true };
      await page.keyboard.press(a.key);
      after();
      return {};
    }
    case "scroll":
      await page.mouse.wheel(0, Math.max(-2000, Math.min(2000, a.dy)));
      after();
      return {};
    case "fields": {
      await s.task.fill(a.values);
      await audit({ actorId: who.userId, action: "assist.input", entity: "Run", entityId: s.runId, tenantId: who.tenantId, meta: { stepId: s.task.stepId, fields: Object.keys(a.values) } });
      after();
      if (!s.task.hasCompleteWhen) {
        await audit({ actorId: who.userId, action: "assist.complete", entity: "Run", entityId: s.runId, tenantId: who.tenantId, meta: { stepId: s.task.stepId } });
        s.complete();
        return { done: true };
      }
      return { message: "Τα πεδία συμπληρώθηκαν. Ολοκληρώστε στην εικόνα (π.χ. «Συνέχεια») ή πατήστε «Ολοκληρώθηκε»." };
    }
    case "complete":
      await audit({ actorId: who.userId, action: "assist.complete", entity: "Run", entityId: s.runId, tenantId: who.tenantId, meta: { stepId: s.task.stepId } });
      s.complete();
      return { done: true };
    case "cancel":
      await audit({ actorId: who.userId, action: "assist.cancel", entity: "Run", entityId: s.runId, tenantId: who.tenantId, meta: { stepId: s.task.stepId } });
      s.cancel();
      return { done: true, cancelled: true };
    case "release":
      return {};
  }
}
