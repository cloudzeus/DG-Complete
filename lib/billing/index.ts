import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Run credits (docs/14 §2). The ONLY place that changes Tenant.runBalance: each change is a ledger row
// with a unique key, applied in the same transaction, so a retried grant/usage never counts twice.

export type CreditKind = "grant" | "topup" | "gift" | "usage" | "refund" | "adjust" | "overage_invoice";

export type CreditChange = {
  tenantId: string;
  delta: number;
  kind: CreditKind;
  /** Idempotency key, e.g. usage:<runId> | grant:<tenant>:<YYYY-MM> */
  key: string;
  runId?: string;
  requestId?: string;
  paymentId?: string;
  note?: string;
  createdById?: string;
  expiresAt?: Date;
};

type Tx = Prisma.TransactionClient;

/** Applies a change once; returns the new balance, or null when the key was already applied. */
export async function applyCredit(change: CreditChange, tx?: Tx): Promise<number | null> {
  const run = async (db: Tx) => {
    if (await db.runCreditLedger.findUnique({ where: { key: change.key }, select: { id: true } })) return null;
    const { runBalance } = await db.tenant.update({
      where: { id: change.tenantId },
      data: { runBalance: { increment: change.delta } },
      select: { runBalance: true },
    });
    await db.runCreditLedger.create({
      data: {
        tenantId: change.tenantId,
        delta: change.delta,
        balanceAfter: runBalance,
        kind: change.kind,
        key: change.key,
        runId: change.runId,
        requestId: change.requestId,
        paymentId: change.paymentId,
        note: change.note,
        createdById: change.createdById,
        expiresAt: change.expiresAt,
      },
    });
    return runBalance;
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

/** Monthly grant of the plan's runs (key grant:<tenant>:<YYYY-MM>). */
export function grantMonthly(tenantId: string, runs: number, month = new Date().toISOString().slice(0, 7)) {
  return applyCredit({ tenantId, delta: runs, kind: "grant", key: `grant:${tenantId}:${month}`, note: `Μηνιαία χορήγηση ${month}` });
}
