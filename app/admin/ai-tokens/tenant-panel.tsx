import { FEATURE_NAMES, tokenUsage } from "@/lib/ai-tokens";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { AdjustTokens } from "./adjust";
import { TokenRequests } from "./requests";

const KIND: Record<string, string> = { grant: "Μηνιαία πακέτου", topup: "Αγορά / προσθήκη", usage: "Κατανάλωση", adjust: "Διόρθωση" };
const tok = (v: number) => v.toLocaleString("el-GR");
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

/** Admin → tenant: AI token balance, usage by feature, ledger, manual change, pending requests. */
export async function TenantAiTokens({ tenantId }: { tenantId: string }) {
  const since = daysAgo(30);
  const [t, usage, ledger, pending] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { aiTokenBalance: true, isDemo: true, plan: { select: { name: true, aiTokensMonthly: true } } } }),
    tokenUsage(tenantId, since),
    prisma.aiTokenLedger.findMany({ where: { tenantId, kind: { not: "usage" } }, orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.aiTokenRequest.findMany({ where: { tenantId, status: "PENDING" }, orderBy: { createdAt: "asc" } }),
  ]);
  if (!t) return null;
  const used = usage.reduce((a, u) => a + u.tokens, 0);
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <div className="text-2xs text-muted-foreground">Υπόλοιπο</div>
          <div className={cn("text-2xl font-semibold tabular-nums", t.aiTokenBalance <= 0 && !t.isDemo && "text-red-600")}>{tok(t.aiTokenBalance)}</div>
        </div>
        <div>
          <div className="text-2xs text-muted-foreground">Πακέτο</div>
          <div>{t.isDemo ? "Demo — χωρίς χρέωση" : t.plan?.aiTokensMonthly ? `${tok(t.plan.aiTokensMonthly)} / μήνα («${t.plan.name}»)` : "Χωρίς μηνιαία tokens"}</div>
        </div>
        <div>
          <div className="text-2xs text-muted-foreground">Κατανάλωση 30 ημ.</div>
          <div className="tabular-nums">{tok(used)}</div>
        </div>
      </div>
      {usage.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {usage.map((u) => (
            <span key={u.feature} className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">
              {FEATURE_NAMES[u.feature] ?? u.feature}: {tok(u.tokens)} ({u.calls} κλήσεις)
            </span>
          ))}
        </div>
      )}
      <AdjustTokens tenantId={tenantId} />
      {pending.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold">Αιτήματα σε αναμονή</h4>
          <TokenRequests
            rows={pending.map((p) => ({ id: p.id, tenant: "", tokens: p.tokens, priceEur: Number(p.priceEur), requestedBy: null, createdAt: p.createdAt.toLocaleDateString("el-GR") }))}
          />
        </div>
      )}
      {ledger.length > 0 && (
        <table className="w-full text-xs">
          <tbody>
            {ledger.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="py-1.5 pr-2 whitespace-nowrap text-muted-foreground tabular-nums">{l.createdAt.toLocaleDateString("el-GR")}</td>
                <td className="py-1.5 pr-2">{KIND[l.kind] ?? l.kind}</td>
                <td className="py-1.5 pr-2 text-muted-foreground">{l.note}</td>
                <td className={cn("py-1.5 pr-2 text-right tabular-nums", l.delta > 0 ? "text-emerald-700" : "text-red-600")}>
                  {l.delta > 0 ? "+" : ""}
                  {tok(l.delta)}
                </td>
                <td className="py-1.5 text-right text-muted-foreground tabular-nums">{tok(l.balanceAfter)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
