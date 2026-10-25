import type { Metadata } from "next";
import Link from "next/link";
import { Activity, BadgeEuro, Bot, CircleDollarSign, Percent, Sparkles } from "lucide-react";
import { PageHeader, SectionTitle } from "@/components/admin/page-header";
import { StatusPill } from "@/components/admin/tone";
import { StatCard } from "@/components/admin/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/lib/rbac";
import { getAiSettings, listModels, usageByTenant, type ModelInfo } from "@/lib/openrouter";
import { AiForm } from "./ai-form";
import { TokenSettings } from "./token-settings";
import { UsageTable } from "./usage-table";

export const metadata: Metadata = { title: "AI · OpenRouter" };

const MONTH = /^(\d{4})-(\d{2})$/;
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const usd = (n: number) => `$${n.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function AiSettingsPage({ searchParams }: PageProps<"/admin/settings/ai">) {
  await requirePermission("platform.settings.manage");
  const { month: monthParam } = await searchParams;
  const now = new Date();
  const match = typeof monthParam === "string" ? MONTH.exec(monthParam) : null;
  const from = match ? new Date(Number(match[1]), Number(match[2]) - 1, 1) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  const month = monthKey(from);
  const months = Array.from({ length: 6 }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));

  const [settings, usage] = await Promise.all([getAiSettings(), usageByTenant(from, to)]);
  let models: ModelInfo[] = [];
  try {
    models = await listModels();
  } catch {
    // catalog unreachable — the form still accepts a typed model id
  }

  const total = usage.reduce(
    (a, r) => ({ requests: a.requests + r.requests, cost: a.cost + r.costUsd, billed: a.billed + r.billedUsd }),
    { requests: 0, cost: 0, billed: 0 },
  );
  const monthLabel = from.toLocaleDateString("el-GR", { month: "long", year: "numeric" });

  return (
    <>
      <PageHeader
        eyebrow="Ρυθμίσεις"
        title="AI · OpenRouter"
        description="Το κλειδί της πλατφόρμας για τα μοντέλα AI, το markup μας και η κατανάλωση κάθε tenant. Το κόστος κάθε κλήσης καταγράφεται όπως το χρεώνει το OpenRouter."
        icon={Bot}
        tone="violet"
        actions={
          settings.enabled ? (
            <StatusPill tone="green">Ενεργό</StatusPill>
          ) : (
            <StatusPill tone="slate">Ανενεργό</StatusPill>
          )
        }
      />

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>
              <SectionTitle
                icon={Sparkles}
                tone="violet"
                extra={
                  settings.lastTestedAt && (
                    <StatusPill tone={settings.lastTestOk ? "green" : "red"}>
                      {settings.lastTestOk ? "Δοκιμή OK" : "Δοκιμή απέτυχε"}
                    </StatusPill>
                  )
                }
              >
                Σύνδεση & τιμολόγηση
              </SectionTitle>
            </CardTitle>
            <CardDescription>
              Ένα κλειδί για όλη την πλατφόρμα· κάθε κλήση χρεώνεται στον tenant που την έκανε με κόστος × (1 + markup).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AiForm
              values={{
                keyHint: settings.keyHint,
                defaultModel: settings.defaultModel,
                markupPercent: Number(settings.markupPercent),
                enabled: settings.enabled,
              }}
              models={models}
            />
            {settings.lastTestError && !settings.lastTestOk && (
              <p className="mt-3 text-xs text-destructive">Τελευταίο σφάλμα: {settings.lastTestError}</p>
            )}
          </CardContent>
        </Card>

        <div className="grid content-start gap-4 sm:grid-cols-2 xl:col-span-2 xl:grid-cols-2">
          <StatCard href={`/admin/settings/ai?month=${month}`} label="Κλήσεις" value={total.requests.toLocaleString("el-GR")} hint={monthLabel} icon={Activity} tone="blue" />
          <StatCard href={`/admin/settings/ai?month=${month}`} label="Κόστος OpenRouter" value={usd(total.cost)} hint="τι πληρώνουμε" icon={CircleDollarSign} tone="amber" />
          <StatCard href={`/admin/settings/ai?month=${month}`} label="Χρέωση πελατών" value={usd(total.billed)} hint="με markup" icon={BadgeEuro} tone="green" />
          <StatCard
            href={`/admin/settings/ai?month=${month}`}
            label="Περιθώριο"
            value={usd(total.billed - total.cost)}
            hint={`markup ${Number(settings.markupPercent).toLocaleString("el-GR")}%`}
            icon={Percent}
            tone="violet"
          />
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>
            <SectionTitle icon={Sparkles} tone="violet">
              AI tokens πελατών
            </SectionTitle>
          </CardTitle>
          <CardDescription>
            Κάθε πελάτης έχει ένα υπόλοιπο tokens για όλες τις λειτουργίες AI (Κίμων, κλαδική ανάλυση, εναλλακτικά είδη). Το πακέτο συνδρομής δίνει
            tokens κάθε μήνα· επιπλέον tokens αγοράζονται σε πακέτα. Τα αιτήματα εγκρίνονται από την Επισκόπηση ή τη σελίδα του πελάτη.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TokenSettings
            values={{
              enforceTokens: settings.enforceTokens,
              alertEmail: settings.alertEmail ?? "",
              alertBelowUsd: Number(settings.alertBelowUsd),
              packages: Array.isArray(settings.tokenPackages) ? (settings.tokenPackages as { tokens: number; priceEur: number }[]) : [],
            }}
          />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>
            <SectionTitle icon={Activity} tone="blue">
              Χρήση ανά tenant — {monthLabel}
            </SectionTitle>
          </CardTitle>
          <CardDescription>Κλήσεις, tokens και κόστος ανά πελάτη. Η χρέωση υπολογίζεται με το markup που ίσχυε τη στιγμή κάθε κλήσης.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {months.map((m) => (
              <Link
                key={m}
                href={`/admin/settings/ai?month=${m}`}
                scroll={false}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs tabular-nums transition-colors",
                  m === month ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {m}
              </Link>
            ))}
          </div>
          <UsageTable data={usage} month={monthLabel} />
        </CardContent>
      </Card>
    </>
  );
}
