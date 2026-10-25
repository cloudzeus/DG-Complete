import "server-only";
import { encryptJson } from "@/lib/crypto";
import type { RunTrigger } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getBoss } from "@/lib/queue";
import { tenantDb, withTenantTx } from "@/lib/tenant-db";

// Creates a run and puts it on the `runs` queue (pg-boss, ADR-022). The input is stored encrypted
// (AAD tenantId:runId) with a masked preview; billing happens on SUCCEEDED in the worker (docs/14 §2) —
// here only the quota check before queueing.

export class RunError extends Error {
  constructor(
    public code: "E_QUOTA_EXCEEDED" | "E_METHOD_PAUSED" | "E_NOT_PUBLISHED",
    message: string,
  ) {
    super(message);
  }
}

export const RUNS_QUEUE = "runs";
const ACTIVE = ["QUEUED", "RUNNING", "RETRY_SCHEDULED", "NEEDS_ATTENTION"] as const;
const SENSITIVE = /pass|secret|otp|token|pin|iban|card/i;

/** Masked copy of the input for lists and logs: secrets hidden, long strings shortened. */
export function previewInput(input: Record<string, unknown>, sensitive: string[] = []) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (sensitive.includes(k) || SENSITIVE.test(k)) out[k] = "••••";
    else if (typeof v === "string") out[k] = v.length > 80 ? `${v.slice(0, 77)}…` : v;
    else out[k] = v;
  }
  return out;
}

export async function assertQuota(tenantId: string, units = 1) {
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { runBalance: true, isDemo: true, plan: { select: { overageEnabled: true } } } });
  if (t.isDemo || t.plan?.overageEnabled) return;
  const active = await withTenantTx(tenantId, (tx) => tx.run.count({ where: { status: { in: [...ACTIVE] } } }));
  if (t.runBalance - active < units) {
    throw new RunError("E_QUOTA_EXCEEDED", `Το υπόλοιπο εκτελέσεων δεν επαρκεί (${t.runBalance} διαθέσιμες, ${active} σε εξέλιξη).`);
  }
}

export async function createRun(opts: {
  tenantId: string;
  workflowVersionId: string;
  methodId?: string | null;
  input: Record<string, unknown>;
  trigger: RunTrigger;
  userId?: string | null;
  externalRef?: string | null;
  jobId?: string | null;
  itemIndex?: number | null;
  retryOfRunId?: string | null;
}) {
  const version = await tenantDb(opts.tenantId).workflowVersion.findUnique({ where: { id: opts.workflowVersionId }, select: { status: true } });
  if (!version) throw new RunError("E_NOT_PUBLISHED", "Η έκδοση της ροής δεν βρέθηκε.");
  if (opts.trigger !== "UI_TEST" && version.status !== "PUBLISHED") throw new RunError("E_NOT_PUBLISHED", "Μόνο δημοσιευμένες εκδόσεις εκτελούνται από μεθόδους.");
  if (opts.methodId) {
    const m = await tenantDb(opts.tenantId).method.findUnique({ where: { id: opts.methodId }, select: { state: true, isActive: true } });
    if (m && (m.state === "PAUSED" || !m.isActive)) throw new RunError("E_METHOD_PAUSED", "Η μέθοδος είναι σε παύση.");
  }
  if (opts.trigger !== "UI_TEST") await assertQuota(opts.tenantId);

  const run = await withTenantTx(opts.tenantId, async (tx) => {
    const r = await tx.run.create({
      data: {
        tenantId: opts.tenantId,
        workflowVersionId: opts.workflowVersionId,
        methodId: opts.methodId ?? null,
        trigger: opts.trigger,
        externalRef: opts.externalRef ?? null,
        jobId: opts.jobId ?? null,
        itemIndex: opts.itemIndex ?? null,
        retryOfRunId: opts.retryOfRunId ?? null,
        createdByUserId: opts.userId ?? null,
        inputEnc: "pending",
        inputPreview: previewInput(opts.input) as never,
      },
      select: { id: true },
    });
    await tx.run.update({ where: { id: r.id }, data: { inputEnc: encryptJson(opts.input, `${opts.tenantId}:${r.id}`) } });
    return r;
  });
  await enqueueRun(opts.tenantId, run.id);
  return run;
}

/** Best effort: a run left QUEUED without a queue job is picked up by the stuck-run sweeper. */
export async function enqueueRun(tenantId: string, runId: string) {
  try {
    const boss = await getBoss("web");
    await boss.createQueue(RUNS_QUEUE);
    await boss.send(RUNS_QUEUE, { runId, tenantId }, { singletonKey: runId });
  } catch (err) {
    console.error("[queue] enqueue failed", runId, (err as Error).message);
  }
}
