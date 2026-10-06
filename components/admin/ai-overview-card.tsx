import Link from "next/link";
import { Bot } from "lucide-react";
import { SectionTitle } from "@/components/admin/page-header";
import { StatusPill } from "@/components/admin/tone";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TokenRequests } from "@/app/admin/ai-tokens/requests";
import { aiOverview } from "@/lib/ai-overview";
import { cn } from "@/lib/utils";

const usd = (v: number) => `$${v.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const eur = (v: number) => `${v.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const tok = (v: number) => (Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toLocaleString("el-GR", { maximumFractionDigits: 1 })}M` : v.toLocaleString("el-GR"));

/** Super admin: AI cost vs what we charge, token pack sales, central credit, tenants running out. */
export async function AiOverviewCard() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const o = await aiOverview(from, to);
  const low = o.credits?.remaining !== null && o.credits?.remaining !== undefined && o.credits.remaining < o.alertBelowUsd;
  const stat = (label: string, value: string, hint?: string, tone?: string) => (
    <div className="rounded-lg border p-3">
      <div className="text-2xs text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-semibold tabular-nums", tone)}>{value}</div>
      {hint && <div className="text-2xs text-muted-foreground">{hint}</div>}
    </div>
  );
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>
          <SectionTitle
            icon={Bot}
            tone="violet"
            extra={o.enforceTokens ? <StatusPill tone="green">Χρέωση tokens ενεργή</StatusPill> : <StatusPill tone="slate">Χρέωση tokens ανενεργή</StatusPill>}
          >
            AI & tokens — {from.toLocaleDateString("el-GR", { month: "long", year: "numeric" })}
          </SectionTitle>
        </CardTitle>
        <CardDescription>
          Τι πληρώνουμε στο OpenRouter, τι χρεώνουμε (markup) και τι πουλάμε σε πακέτα tokens.{" "}
          <Link href="/admin/settings/ai" className="text-sisyphus-600 hover:underline">
            Ρυθμίσεις AI
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {stat(
            "Υπόλοιπο OpenRouter",
            o.credits?.remaining === null || o.credits?.remaining === undefined ? "—" : usd(o.credits.remaining),
            low ? `κάτω από ${usd(o.alertBelowUsd)} — αγοράστε πιστώσεις` : o.credits?.total ? `από ${usd(o.credits.total)}` : undefined,
            low ? "text-red-600" : undefined,
          )}
          {stat("Κόστος OpenRouter", usd(o.costUsd), `${o.calls.toLocaleString("el-GR")} κλήσεις · ${tok(o.tokens)} tokens`)}
          {stat("Χρέωση με markup", usd(o.billedUsd), "η αξία της κατανάλωσης")}
          {stat("Κέρδος markup", usd(o.markupProfitUsd), undefined, "text-emerald-700")}
          {stat("Πωλήσεις πακέτων", eur(o.packSalesEur), `${o.packCount} πακέτα · ${tok(o.packTokens)} tokens`)}
          {stat("Αιτήματα σε αναμονή", String(o.pending.length), o.pending.length ? "έγκριση όταν πληρωθούν" : undefined, o.pending.length ? "text-amber-700" : undefined)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-1 text-sm font-semibold">Αιτήματα πακέτων tokens</h3>
            <TokenRequests rows={o.pending} />
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold">Πελάτες που τελειώνουν</h3>
            {o.lowTenants.length === 0 ? (
              <p className="text-sm text-muted-foreground">Κανένας πελάτης χωρίς tokens.</p>
            ) : (
              <ul className="divide-y text-sm">
                {o.lowTenants.slice(0, 8).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 py-1.5">
                    <Link href={`/admin/tenants/${t.id}`} className="truncate hover:underline">
                      {t.name}
                    </Link>
                    <span className={cn("shrink-0 tabular-nums", t.balance <= 0 ? "font-semibold text-red-600" : "text-amber-700")}>
                      {tok(t.balance)}
                      {t.monthly > 0 && <span className="text-muted-foreground"> / {tok(t.monthly)} μήνα</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
