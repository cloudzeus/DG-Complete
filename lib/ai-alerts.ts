import "server-only";
import { grantMonthlyTokens } from "@/lib/ai-tokens";
import { APP_URL, sendTemplate } from "@/lib/email";
import { creditsRemaining, getAiSettings } from "@/lib/openrouter";
import { prisma } from "@/lib/prisma";

// Hourly AI housekeeping: the monthly plan tokens, and an email to us (once a day) when the central
// OpenRouter credit runs low — with the tenants that are out of tokens and the pending requests.

const usd = (v: number) => `$${v.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function runAiHousekeeping() {
  const grants = await grantMonthlyTokens();
  const settings = await getAiSettings();
  if (!settings.apiKeyEnc || !settings.alertEmail) return { ...grants, alert: "off" };
  const credits = await creditsRemaining().catch(() => null);
  const threshold = Number(settings.alertBelowUsd);
  if (credits?.remaining === null || credits?.remaining === undefined || credits.remaining >= threshold) {
    return { ...grants, remaining: credits?.remaining ?? null };
  }
  const [low, pending] = await Promise.all([
    prisma.tenant.findMany({ where: { isDemo: false, aiTokenBalance: { lte: 0 }, status: { not: "CANCELED" } }, select: { name: true, aiTokenBalance: true }, take: 20 }),
    prisma.aiTokenRequest.count({ where: { status: "PENDING" } }),
  ]);
  const r = await sendTemplate({
    template: "ai_credits_low",
    to: [settings.alertEmail],
    force: true, // internal alert: goes out even while customer emails are switched off
    dedupeKey: `ai-credits-low:${new Date().toISOString().slice(0, 10)}`,
    vars: {
      remaining: usd(credits.remaining),
      threshold: usd(threshold),
      tenantsLow: low.length ? low.map((t) => `${t.name} (${t.aiTokenBalance.toLocaleString("el-GR")} tokens)`).join(", ") : "κανένας",
      pending: String(pending),
      link: `${APP_URL}/admin`,
    },
  });
  return { ...grants, remaining: credits.remaining, alert: r.ok ? (r.skipped ? "already-sent" : "sent") : r.error };
}
