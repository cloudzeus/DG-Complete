import "server-only";
import { prisma } from "@/lib/prisma";

// AI tokens per tenant: every AI feature (Κίμων, κλαδική ανάλυση, εναλλακτικά είδη …) draws from one
// balance. Plans include a monthly amount; tenants request token packs (priced by us, incl. our
// markup on the central OpenRouter account) and we approve them when paid. Demo tenants are free.
// A token = one prompt or completion token as counted by the model provider.

export class AiTokensExhausted extends Error {
  constructor() {
    super("Τα AI tokens της εταιρείας σας εξαντλήθηκαν. Προσθέστε tokens από τη σελίδα «AI tokens».");
    this.name = "AiTokensExhausted";
  }
}

export type TokenPackage = { tokens: number; priceEur: number };

export async function tokenPackages(): Promise<TokenPackage[]> {
  const s = await prisma.aiSettings.findUnique({ where: { id: "default" }, select: { tokenPackages: true } });
  const list = Array.isArray(s?.tokenPackages) ? (s.tokenPackages as TokenPackage[]) : [];
  return list.filter((p) => Number(p.tokens) > 0 && Number(p.priceEur) >= 0).sort((a, b) => a.tokens - b.tokens);
}

/** Throws when the tenant has no tokens left and charging is enforced. */
export async function assertTokens(tenantId: string | null) {
  if (!tenantId) return;
  const [settings, t] = await Promise.all([
    prisma.aiSettings.findUnique({ where: { id: "default" }, select: { enforceTokens: true } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { isDemo: true, aiTokenBalance: true } }),
  ]);
  if (settings?.enforceTokens && t && !t.isDemo && t.aiTokenBalance <= 0) throw new AiTokensExhausted();
}

async function move(tenantId: string, delta: number, data: { kind: string; feature?: string; note?: string; key?: string; aiUsageId?: string; requestId?: string; createdById?: string }) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.tenant.update({ where: { id: tenantId }, data: { aiTokenBalance: { increment: delta } }, select: { aiTokenBalance: true } });
    return tx.aiTokenLedger.create({ data: { tenantId, delta, balanceAfter: t.aiTokenBalance, ...data } });
  });
}

/** Deducts the tokens of one AI call (demo tenants: not charged). */
export async function chargeTokens(tenantId: string | null, tokens: number, feature: string, aiUsageId?: string) {
  if (!tenantId || tokens <= 0) return;
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { isDemo: true } });
  if (!t || t.isDemo) return;
  await move(tenantId, -tokens, { kind: "usage", feature, aiUsageId });
}

export async function addTokens(tenantId: string, tokens: number, opts: { kind: "topup" | "adjust" | "grant"; note?: string; by?: string; requestId?: string; key?: string }) {
  return move(tenantId, tokens, { kind: opts.kind, note: opts.note, createdById: opts.by, requestId: opts.requestId, key: opts.key });
}

/** Monthly plan allowance, once per tenant and month (unused tokens carry over). */
export async function grantMonthlyTokens() {
  const month = new Date().toISOString().slice(0, 7);
  const tenants = await prisma.tenant.findMany({
    where: { isDemo: false, status: { not: "CANCELED" }, plan: { aiTokensMonthly: { gt: 0 } } },
    select: { id: true, plan: { select: { aiTokensMonthly: true, name: true } } },
  });
  let granted = 0;
  for (const t of tenants) {
    const key = `grant:${t.id}:${month}`;
    if (await prisma.aiTokenLedger.findUnique({ where: { key }, select: { id: true } })) continue;
    await addTokens(t.id, t.plan!.aiTokensMonthly, { kind: "grant", key, note: `Μηνιαία tokens πακέτου «${t.plan!.name}» ${month}` });
    granted++;
  }
  return { granted };
}

export type TokenUsage = { feature: string; tokens: number; calls: number };

/** Tokens used per AI feature since a date. */
export async function tokenUsage(tenantId: string, since: Date): Promise<TokenUsage[]> {
  const rows = await prisma.aiUsage.groupBy({
    by: ["feature"],
    where: { tenantId, createdAt: { gte: since }, ok: true },
    _sum: { promptTokens: true, completionTokens: true },
    _count: { _all: true },
  });
  return rows
    .map((r) => ({ feature: r.feature, tokens: (r._sum.promptTokens ?? 0) + (r._sum.completionTokens ?? 0), calls: r._count._all }))
    .sort((a, b) => b.tokens - a.tokens);
}

export const FEATURE_NAMES: Record<string, string> = {
  kimon: "Κίμων",
  chat: "Κίμων",
  industry: "Κλαδική ανάλυση",
  substitutes: "Εναλλακτικά είδη",
  weekly_report: "Εβδομαδιαία αναφορά",
  test: "Δοκιμή",
};
