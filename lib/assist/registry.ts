// Live assist sessions (docs/22, ADR-026). The worker runs inside the web process (ADR-025), so a
// waiting run's page lives in this process: the run page reads frames and sends input through the
// /api/assist routes, which reach the session here. Nothing is persisted: frames stay in memory for
// 200 ms, typed text goes straight to the page, field values only to the `fill` elements.
import type { HumanBox, HumanTask } from "@/lib/engine/human";

export type AssistLock = { userId: string; name: string; until: number };

export type AssistSession = {
  runId: string;
  tenantId: string;
  task: HumanTask;
  deadline: number;
  lock: AssistLock | null;
  /** Operator said «Ολοκληρώθηκε». */
  complete(): void;
  /** Operator said «Αδυναμία» (or the run was cancelled). */
  cancel(): void;
  frame?: { at: number; buf: Buffer };
  boxes?: { at: number; boxes: HumanBox[] };
  /** Last time each user's typing was audited (one row per burst, never the text). */
  audited: Map<string, number>;
  /** Users whose assist.open was audited. */
  openedBy: Set<string>;
};

const LOCK_MS = 2 * 60_000;
const g = globalThis as unknown as { __dgAssist?: Map<string, AssistSession> };
const sessions = (g.__dgAssist ??= new Map());

export function registerAssist(s: AssistSession) {
  sessions.set(s.runId, s);
}

export function unregisterAssist(runId: string) {
  sessions.delete(runId);
}

export function getAssist(runId: string, tenantId: string): AssistSession | null {
  const s = sessions.get(runId);
  return s && s.tenantId === tenantId ? s : null;
}

/** Cancels a waiting run from elsewhere (cancel button on the run). */
export function cancelAssist(runId: string) {
  sessions.get(runId)?.cancel();
}

/** One operator per run; the lock is renewed by every frame/action of its holder (2′). */
export function takeLock(s: AssistSession, user: { id: string; name: string }): { ok: true; fresh: boolean } | { ok: false; by: string } {
  const now = Date.now();
  if (s.lock && s.lock.until > now && s.lock.userId !== user.id) return { ok: false, by: s.lock.name };
  const fresh = !s.lock || s.lock.userId !== user.id || s.lock.until <= now;
  s.lock = { userId: user.id, name: user.name, until: now + LOCK_MS };
  return { ok: true, fresh };
}

export function releaseLock(s: AssistSession, userId: string) {
  if (s.lock?.userId === userId) s.lock = null;
}

export async function assistFrame(s: AssistSession): Promise<Buffer> {
  if (s.frame && Date.now() - s.frame.at < 200) return s.frame.buf;
  const page = s.task.page;
  const buf = await page.screenshot({ type: "jpeg", quality: 60, timeout: 10_000, mask: [...s.task.sensitive, page.locator("input[type=password]")] });
  s.frame = { at: Date.now(), buf };
  return buf;
}

export async function assistBoxes(s: AssistSession): Promise<HumanBox[]> {
  if (s.task.mode === "full") return [];
  if (s.boxes && Date.now() - s.boxes.at < 1000) return s.boxes.boxes;
  const boxes = await s.task.allowedBoxes().catch(() => []);
  s.boxes = { at: Date.now(), boxes };
  return boxes;
}

export const inside = (boxes: HumanBox[], x: number, y: number) => boxes.some((b) => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height);

export async function assistState(s: AssistSession) {
  const vp = s.task.page.viewportSize() ?? { width: 1280, height: 800 };
  return {
    runId: s.runId,
    label: s.task.label,
    reason: s.task.reason,
    instructions: s.task.instructions,
    mode: s.task.mode,
    fields: s.task.fields.filter((f) => f.fillable).map(({ key, label, type }) => ({ key, label, type })),
    deadline: s.deadline,
    viewport: vp,
    boxes: await assistBoxes(s),
    lockedBy: s.lock && s.lock.until > Date.now() ? s.lock.name : null,
  };
}
export type AssistState = Awaited<ReturnType<typeof assistState>>;
