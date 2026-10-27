// Live assist on the worker side (docs/22): the run waits for an operator with its browser open,
// without holding a tenant slot (up to ASSIST_MAX_WAITING per tenant), and continues on completion.
// Timeout → E_HUMAN_TIMEOUT (FAILED, not charged). Values typed by the operator never reach logs.
import { audit } from "@/lib/audit";
import { cancelAssist, registerAssist, unregisterAssist, type AssistSession } from "@/lib/assist/registry";
import { APP_URL, sendTemplate } from "@/lib/email";
import { EngineError, type HumanTask, type StepEvent } from "@/lib/engine";
import { Prisma } from "@/lib/generated/prisma/client";
import type { LogLevel } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import type { RunEvent } from "@/lib/queue/events";
import { withTenantTx } from "@/lib/tenant-db";
import { saveArtifact, type ArtifactCtx } from "./artifacts";
import { acquire, release, type LeaseKey } from "./leases";

const MAX_WAITING = Number(process.env.ASSIST_MAX_WAITING ?? 5);
const waiting = new Map<string, number>();

export type AssistCtx = {
  tenantId: string;
  run: { id: string; createdByUserId: string | null; workflowName: string };
  tenantLease: LeaseKey;
  artifactCtx: ArtifactCtx;
  log: (level: LogLevel, message: string, data?: Record<string, unknown>, stepId?: string, source?: string) => void;
  emit: (e: RunEvent) => void;
};

export { cancelAssist };

export async function waitForOperator(c: AssistCtx, e: StepEvent, task: HumanTask): Promise<void> {
  const { tenantId } = c;
  const runId = c.run.id;
  const started = Date.now();
  const deadline = started + task.timeoutSec * 1000;
  await snapshot(c, task, "before");

  const attention = {
    stepId: task.stepId,
    seq: e.seq,
    label: task.label,
    reason: task.reason,
    instructions: task.instructions,
    mode: task.mode,
    fields: task.fields.filter((f) => f.fillable).map(({ key, label }) => ({ key, label })),
    deadline: new Date(deadline).toISOString(),
  };
  await withTenantTx(tenantId, (tx) => tx.run.update({ where: { id: runId }, data: { status: "NEEDS_ATTENTION", attention } }));
  c.emit({ type: "status", status: "NEEDS_ATTENTION" });
  c.log("WARN", `Αναμονή χειριστή: ${task.label} (έως ${Math.round(task.timeoutSec / 60)}′).`, { reason: task.reason, mode: task.mode }, task.stepId, "system");
  await notify(c, task, Math.round(task.timeoutSec / 60), false);

  // A waiting run does not take a tenant slot, within the per-tenant limit of waiting runs.
  const n = waiting.get(tenantId) ?? 0;
  const freeSlot = n < MAX_WAITING;
  waiting.set(tenantId, n + 1);
  if (freeSlot) await release(runId, [c.tenantLease]);

  // No new tabs or downloads while the operator has the page (docs/22 §2).
  const context = task.page.context();
  const noTabs = (p: import("playwright").Page) => void p.close().catch(() => undefined);
  const noDownloads = (d: import("playwright").Download) => void d.cancel().catch(() => undefined);
  context.on("page", noTabs);
  task.page.on("download", noDownloads);

  let outcome: "complete" | "cancel" | "timeout" = "timeout";
  try {
    outcome = await new Promise<"complete" | "cancel" | "timeout">((resolve) => {
      const timers: NodeJS.Timeout[] = [];
      const finish = (o: "complete" | "cancel" | "timeout") => {
        timers.forEach(clearTimeout);
        clearInterval(poll);
        resolve(o);
      };
      const session: AssistSession = { runId, tenantId, task, deadline, lock: null, complete: () => finish("complete"), cancel: () => finish("cancel"), audited: new Map(), openedBy: new Set() };
      registerAssist(session);
      timers.push(setTimeout(() => finish("timeout"), deadline - Date.now()));
      timers.push(setTimeout(() => void notify(c, task, Math.round(task.timeoutSec / 120), true).catch(() => undefined), (deadline - Date.now()) / 2));
      // completeWhen (selector / URL) or the CAPTCHA disappearing; and a cancel from the run page.
      let busy = false;
      const poll = setInterval(async () => {
        if (busy) return;
        busy = true;
        try {
          if (task.hasCompleteWhen && (await task.isComplete().catch(() => false))) {
            // Completed on the page itself (URL / element / CAPTCHA gone): audited for the operator holding the view.
            await audit({ actorId: session.lock?.userId ?? null, action: "assist.complete", entity: "Run", entityId: runId, tenantId, meta: { stepId: task.stepId, auto: true } }).catch(() => undefined);
            return finish("complete");
          }
          const r = await withTenantTx(tenantId, (tx) => tx.run.findUnique({ where: { id: runId }, select: { status: true } }));
          if (r?.status === "CANCELLED") finish("cancel");
        } finally {
          busy = false;
        }
      }, 1500);
    });
  } finally {
    unregisterAssist(runId);
    context.off("page", noTabs);
    task.page.off("download", noDownloads);
    waiting.set(tenantId, Math.max(0, (waiting.get(tenantId) ?? 1) - 1));
  }

  if (outcome === "timeout") {
    await audit({ actorId: null, action: "assist.timeout", entity: "Run", entityId: runId, tenantId, meta: { stepId: task.stepId } }).catch(() => undefined);
    throw new EngineError("E_HUMAN_TIMEOUT", `Δεν ολοκληρώθηκε η ενέργεια χειριστή «${task.label}» μέσα σε ${Math.round(task.timeoutSec / 60)}′.`, { stepId: task.stepId });
  }
  if (outcome === "cancel") throw new EngineError("E_CANCELLED", "Ο χειριστής δήλωσε αδυναμία· η εκτέλεση ακυρώθηκε.", { stepId: task.stepId });

  // Back to running: take the tenant slot again (the run already has its target/credential slots).
  if (freeSlot) {
    for (let i = 0; !(await acquire(runId, [c.tenantLease])); i++) {
      if (i > 300) throw new EngineError("E_INTERNAL", "Δεν βρέθηκε διαθέσιμη θέση εκτέλεσης μετά την ενέργεια χειριστή.");
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  await withTenantTx(tenantId, (tx) => tx.run.update({ where: { id: runId }, data: { status: "RUNNING", attention: Prisma.DbNull } }));
  c.emit({ type: "status", status: "RUNNING" });
  c.log("INFO", `Η ενέργεια χειριστή ολοκληρώθηκε σε ${Math.round((Date.now() - started) / 1000)}″· η εκτέλεση συνεχίζει.`, undefined, task.stepId, "system");
  await snapshot(c, task, "after");
}

/** One masked screenshot before and one after, as evidence (docs/22 §5). Frames are never stored. */
async function snapshot(c: AssistCtx, task: HumanTask, when: "before" | "after") {
  const page = task.page;
  const buf = await page.screenshot({ mask: [...task.sensitive, page.locator("input[type=password]")], timeout: 10_000 }).catch(() => null);
  if (buf) await saveArtifact(c.artifactCtx, "SCREENSHOT_VIEWPORT", buf, "image/png", { meta: { assist: when, stepId: task.stepId } }).catch(() => undefined);
}

/** In-app notification + email to who started the run, otherwise to the tenant's operators. */
async function notify(c: AssistCtx, task: HumanTask, minutes: number, reminder: boolean) {
  const link = `/t/${c.tenantId}/runs/${c.run.id}`;
  const title = `${reminder ? "Υπενθύμιση: " : ""}Χρειάζεται ενέργεια · ${c.run.workflowName}`;
  await prisma.notification
    .create({ data: { tenantId: c.tenantId, userId: c.run.createdByUserId, kind: "run.needs_attention", title, body: task.instructions.slice(0, 500), link } })
    .catch(() => undefined);
  const users = c.run.createdByUserId
    ? await prisma.user.findMany({ where: { id: c.run.createdByUserId, active: true }, select: { name: true, email: true } })
    : await prisma.user.findMany({ where: { active: true, memberships: { some: { tenantId: c.tenantId, role: { in: ["TENANT_ADMIN", "TENANT_OPERATOR"] } } } }, select: { name: true, email: true }, take: 20 });
  const tenant = await prisma.tenant.findUnique({ where: { id: c.tenantId }, select: { name: true } });
  for (const u of users) {
    await sendTemplate({
      template: "run_needs_attention",
      to: [u.email],
      tenantId: c.tenantId,
      dedupeKey: `assist:${c.run.id}:${task.stepId}:${reminder ? "r" : "n"}`,
      vars: { name: u.name, tenant: tenant?.name ?? "", flow: c.run.workflowName, task: task.instructions, minutes: String(minutes), link: `${APP_URL}${link}` },
    }).catch(() => undefined);
  }
}
