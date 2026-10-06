import type { Metadata } from "next";
import { Coins } from "lucide-react";
import { FEATURE_NAMES, tokenPackages, tokenUsage } from "@/lib/ai-tokens";
import { requireDashboardTenant } from "@/lib/dashboards";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { CancelRequest, RequestPack } from "./request-pack";

export const metadata: Metadata = { title: "AI tokens" };

const tok = (v: number) => v.toLocaleString("el-GR");
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
const KIND: Record<string, string> = { grant: "Μηνιαία tokens πακέτου", topup: "Αγορά tokens", adjust: "Διόρθωση" };

export default async function AiTokensPage({ params }: PageProps<"/dashboards/[tenantId]/ai-tokens">) {
  const { tenantId } = await params;
  const { user, tenant } = await requireDashboardTenant(tenantId, "ai-tokens");
  const canBuy = can(user, "tenant.billing.manage", tenantId);
  const [t, usage30, packs, ledger, requests] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { aiTokenBalance: true, plan: { select: { name: true, aiTokensMonthly: true } } } }),
    tokenUsage(tenantId, daysAgo(30)),
    tokenPackages(),
    prisma.aiTokenLedger.findMany({ where: { tenantId, kind: { not: "usage" } }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.aiTokenRequest.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const balance = t?.aiTokenBalance ?? 0;
  const used30 = usage30.reduce((a, u) => a + u.tokens, 0);
  const daily = used30 / 30;
  const daysLeft = daily > 0 && balance > 0 ? Math.floor(balance / daily) : null;
  const pending = requests.find((r) => r.status === "PENDING");

  return (
    <>
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Coins className="size-5 text-dg-red-500" /> AI tokens
        </h1>
        <p className="text-xs text-muted-foreground">
          Ένα υπόλοιπο για όλες τις λειτουργίες AI: Κίμων, κλαδική ανάλυση, εναλλακτικά είδη στις παραγγελίες. Κάθε ερώτηση ή ανάλυση καταναλώνει
          tokens (λέξεις που διαβάζει και γράφει το μοντέλο).
        </p>
      </div>

      {tenant.isDemo ? (
        <p className="rounded-lg border bg-muted/40 p-4 text-sm">Εταιρεία επίδειξης: η χρήση AI δεν χρεώνεται.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground">Υπόλοιπο</div>
            <div className={cn("text-3xl font-semibold tabular-nums", balance <= 0 && "text-red-600")}>{tok(balance)}</div>
            <div className="text-xs text-muted-foreground">{daysLeft !== null ? `φτάνει για ~${daysLeft} ημέρες με τη σημερινή χρήση` : balance <= 0 ? "Προσθέστε tokens για να συνεχίσει το AI" : ""}</div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground">Με το πακέτο σας</div>
            <div className="text-xl font-semibold tabular-nums">{t?.plan?.aiTokensMonthly ? `${tok(t.plan.aiTokensMonthly)} / μήνα` : "—"}</div>
            <div className="text-xs text-muted-foreground">{t?.plan ? `«${t.plan.name}» · προστίθενται την 1η κάθε μήνα` : "Χωρίς πακέτο συνδρομής"}</div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground">Κατανάλωση 30 ημερών</div>
            <div className="text-xl font-semibold tabular-nums">{tok(used30)}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {usage30.map((u) => (
                <span key={u.feature} className="rounded-full bg-muted px-2 py-0.5 text-2xs tabular-nums">
                  {FEATURE_NAMES[u.feature] ?? u.feature} {tok(u.tokens)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {!tenant.isDemo && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Πρόσθετα tokens</h2>
          {packs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Επικοινωνήστε μαζί μας για πρόσθετα tokens.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {packs.map((p) => (
                <div key={p.tokens} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
                  <div className="text-lg font-semibold tabular-nums">{tok(p.tokens)} tokens</div>
                  <div className="text-sm tabular-nums">{p.priceEur.toLocaleString("el-GR", { minimumFractionDigits: 2 })} € με ΦΠΑ</div>
                  {canBuy && <RequestPack tenantId={tenantId} tokens={p.tokens} disabled={!!pending} />}
                </div>
              ))}
            </div>
          )}
          {!canBuy && <p className="text-xs text-muted-foreground">Το αίτημα αγοράς το κάνει ο διαχειριστής της εταιρείας σας.</p>}
          {pending && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm">
              <span>
                Αίτημα σε αναμονή: <strong>{tok(pending.tokens)} tokens</strong> · {Number(pending.priceEur).toLocaleString("el-GR", { minimumFractionDigits: 2 })} € — τα
                tokens προστίθενται με την πληρωμή.
              </span>
              {canBuy && <CancelRequest tenantId={tenantId} id={pending.id} />}
            </div>
          )}
        </section>
      )}

      {ledger.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Κινήσεις</h2>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <tbody>
                {ledger.map((l) => (
                  <tr key={l.id} className="border-t first:border-0">
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums">{l.createdAt.toLocaleDateString("el-GR")}</td>
                    <td className="px-3 py-2">{KIND[l.kind] ?? l.kind}</td>
                    <td className="px-3 py-2 text-muted-foreground">{l.note}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", l.delta > 0 ? "text-emerald-700" : "text-red-600")}>
                      {l.delta > 0 ? "+" : ""}
                      {tok(l.delta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
