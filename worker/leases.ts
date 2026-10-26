// Semaphores on Postgres (ADR-022, docs/06 §2): a run holds a row in concurrency_lease per scope.
// Insert first, then check our rank among the live leases — two workers racing for the last slot
// both see the same order, so at most `max` runs keep their lease. No advisory locks (PgBouncer).
import { prisma } from "@/lib/prisma";

const TTL_MS = 10 * 60_000;

export type LeaseKey = { scope: "tenant" | "target" | "credential"; key: string; max: number };

export async function acquire(runId: string, keys: LeaseKey[]): Promise<boolean> {
  const taken: LeaseKey[] = [];
  for (const k of keys) {
    await prisma.concurrencyLease.deleteMany({ where: { scope: k.scope, key: k.key, expiresAt: { lt: new Date() } } });
    await prisma.concurrencyLease.upsert({
      where: { scope_key_runId: { scope: k.scope, key: k.key, runId } },
      create: { scope: k.scope, key: k.key, runId, expiresAt: new Date(Date.now() + TTL_MS) },
      update: { expiresAt: new Date(Date.now() + TTL_MS) },
    });
    const live = await prisma.concurrencyLease.findMany({
      where: { scope: k.scope, key: k.key, expiresAt: { gt: new Date() } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: k.max,
      select: { runId: true },
    });
    if (!live.some((l) => l.runId === runId)) {
      await release(runId, [...taken, k]);
      return false;
    }
    taken.push(k);
  }
  return true;
}

export async function heartbeat(runId: string) {
  await prisma.concurrencyLease.updateMany({ where: { runId }, data: { expiresAt: new Date(Date.now() + TTL_MS) } });
}

export async function release(runId: string, keys?: LeaseKey[]) {
  await prisma.concurrencyLease.deleteMany({
    where: keys ? { runId, OR: keys.map((k) => ({ scope: k.scope, key: k.key })) } : { runId },
  });
}
