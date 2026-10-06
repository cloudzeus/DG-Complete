import "server-only";
import type { PendingRequest } from "@/app/admin/ai-tokens/requests";
import { creditsRemaining } from "@/lib/openrouter";
import { prisma } from "@/lib/prisma";

// Super admin view of AI: what we pay OpenRouter, what tenants are charged, token pack sales,
// the central credit left, tenants running out and pending requests.

export async function aiOverview(from: Date, to: Date) {
  const [usage, sales, credits, low, pending, settings] = await Promise.all([
    prisma.aiUsage.aggregate({
      where: { createdAt: { gte: from, lt: to } },
      _sum: { costUsd: true, billedUsd: true, promptTokens: true, completionTokens: true },
      _count: { _all: true },
    }),
    prisma.aiTokenRequest.aggregate({ where: { status: "APPROVED", decidedAt: { gte: from, lt: to } }, _sum: { priceEur: true, tokens: true }, _count: { _all: true } }),
    creditsRemaining().catch(() => null),
    prisma.tenant.findMany({
      where: { isDemo: false, status: { not: "CANCELED" }, OR: [{ aiTokenBalance: { lte: 0 } }, { plan: { aiTokensMonthly: { gt: 0 } } }] },
      select: { id: true, name: true, aiTokenBalance: true, plan: { select: { aiTokensMonthly: true } } },
    }),
    prisma.aiTokenRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { tenant: { select: { name: true } } },
    }),
    prisma.aiSettings.findUnique({ where: { id: "default" }, select: { alertBelowUsd: true, enforceTokens: true } }),
  ]);
  const requesters = new Map(
    (await prisma.user.findMany({ where: { id: { in: pending.map((p) => p.requestedById).filter((v): v is string => !!v) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]),
  );
  const cost = Number(usage._sum.costUsd ?? 0);
  const billed = Number(usage._sum.billedUsd ?? 0);
  return {
    calls: usage._count._all,
    tokens: (usage._sum.promptTokens ?? 0) + (usage._sum.completionTokens ?? 0),
    costUsd: cost,
    billedUsd: billed,
    markupProfitUsd: billed - cost,
    packSalesEur: Number(sales._sum.priceEur ?? 0),
    packTokens: sales._sum.tokens ?? 0,
    packCount: sales._count._all,
    credits,
    alertBelowUsd: Number(settings?.alertBelowUsd ?? 0),
    enforceTokens: !!settings?.enforceTokens,
    // Out of tokens, or below 10% of their monthly allowance.
    lowTenants: low
      .filter((t) => t.aiTokenBalance <= 0 || (t.plan?.aiTokensMonthly ?? 0) * 0.1 >= t.aiTokenBalance)
      .sort((a, b) => a.aiTokenBalance - b.aiTokenBalance)
      .map((t) => ({ id: t.id, name: t.name, balance: t.aiTokenBalance, monthly: t.plan?.aiTokensMonthly ?? 0 })),
    pending: pending.map(
      (p): PendingRequest => ({
        id: p.id,
        tenant: p.tenant.name,
        tokens: p.tokens,
        priceEur: Number(p.priceEur),
        requestedBy: p.requestedById ? (requesters.get(p.requestedById) ?? null) : null,
        createdAt: p.createdAt.toLocaleDateString("el-GR"),
      }),
    ),
  };
}
