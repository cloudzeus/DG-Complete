import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CircleAlert, Info, Siren } from "lucide-react";
import { ComboChart } from "@/components/charts/bi-charts";
import { ChartCard, Kpi } from "@/components/dashboards/blocks";
import { AiBrief } from "@/components/smart/ai-brief";
import { loadSmart, SmartError, SmartHeader } from "@/components/smart/smart-page";
import { requireDashboardTenant } from "@/lib/dashboards";
import { eurCompact } from "@/lib/format";
import { anomalies, type Anomaly } from "@/lib/smart/anomalies";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Έξυπνες ειδοποιήσεις" };

const SEV: Record<Anomaly["severity"], { label: string; icon: typeof Siren; box: string; tint: string }> = {
  high: { label: "Υψηλή", icon: CircleAlert, box: "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30", tint: "text-red-600" },
  medium: { label: "Μέτρια", icon: AlertTriangle, box: "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/30", tint: "text-amber-600" },
  low: { label: "Χαμηλή", icon: Info, box: "border-sky-200 bg-sky-50/40 dark:border-sky-900 dark:bg-sky-950/30", tint: "text-sky-600" },
};

export default async function AnomaliesPage({ params }: PageProps<"/dashboards/[tenantId]/anomalies">) {
  const { tenantId } = await params;
  await requireDashboardTenant(tenantId, "anomalies");
  const { data: a, error } = await loadSmart(() => anomalies(tenantId));
  const base = `/dashboards/${tenantId}`;
  const areas = a ? [...new Set(a.items.map((x) => x.area))] : [];

  return (
    <>
      <SmartHeader title="Έξυπνες ειδοποιήσεις" icon={Siren}>
        Ό,τι ξεφεύγει από το συνηθισμένο, μετρημένο απέναντι στο δικό του μοτίβο (διάμεσος και διασπορά του ιστορικού του, όχι σταθερά όρια): κατηγορίες με
        πτώση πωλήσεων ή περιθωρίου, μεγάλοι πελάτες που σταμάτησαν ή αγοράζουν πολύ λιγότερα, πωλήσεις σε ασυνήθιστα χαμηλή τιμή, χρήστες με ασυνήθιστα
        μεγάλες εκπτώσεις. Πατήστε μια ειδοποίηση για εξήγηση από το AI.
      </SmartHeader>
      <SmartError error={error} />
      {a && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Υψηλής προτεραιότητας" value={String(a.counts.high)} icon={CircleAlert} tone="red" />
            <Kpi label="Μέτριας" value={String(a.counts.medium)} icon={AlertTriangle} tone="amber" />
            <Kpi label="Χαμηλής" value={String(a.counts.low)} icon={Info} tone="blue" />
            <Kpi label="Συνολική επίδραση" value={eurCompact(a.items.reduce((s, x) => s + x.impact, 0))} hint="εκτίμηση" icon={Siren} tone="violet" />
          </div>

          <ChartCard title="Εβδομαδιαίος τζίρος και το «φυσιολογικό» εύρος" description="Η γραμμή είναι ο διάμεσος των προηγούμενων εβδομάδων· έξω από το εύρος = ασυνήθιστο">
            <ComboChart
              data={a.weekly.map((w) => ({ x: new Date(w.week).toLocaleDateString("el-GR", { day: "numeric", month: "numeric" }), revenue: w.revenue, expected: w.expected, high: w.high, low: w.low }))}
              xKey="x"
              series={[
                { key: "revenue", label: "Τζίρος", color: "var(--chart-1)", type: "bar" },
                { key: "expected", label: "Συνηθισμένος", color: "var(--chart-3)", type: "line" },
                { key: "high", label: "Πάνω όριο", color: "var(--chart-5)", type: "line", dashed: true },
                { key: "low", label: "Κάτω όριο", color: "var(--chart-5)", type: "line", dashed: true },
              ]}
            />
          </ChartCard>

          {a.items.length === 0 && <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">Τίποτα ασυνήθιστο αυτή τη στιγμή.</p>}
          {areas.map((area) => (
            <section key={area} className="space-y-2">
              <h2 className="text-sm font-semibold">{area}</h2>
              <ul className="space-y-2">
                {a.items
                  .filter((x) => x.area === area)
                  .map((x) => {
                    const S = SEV[x.severity];
                    return (
                      <li key={x.id} className={cn("rounded-lg border p-3", S.box)}>
                        <details>
                          <summary className="flex cursor-pointer list-none items-start gap-2.5">
                            <S.icon className={cn("mt-0.5 size-4 shrink-0", S.tint)} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold">{x.title}</span>
                              <span className="block text-xs text-muted-foreground">{x.detail}</span>
                            </span>
                            <span className="text-right text-xs whitespace-nowrap tabular-nums">
                              <span className="block font-semibold">{eurCompact(x.impact)}</span>
                              <span className="text-2xs text-muted-foreground">{S.label}</span>
                            </span>
                          </summary>
                          <div className="mt-3 space-y-2 pl-6">
                            {x.href && (
                              <Link href={`${base}/${x.href}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                                Άνοιγμα <ArrowRight className="size-3.5" />
                              </Link>
                            )}
                            <AiBrief tenantId={tenantId} kind="anomaly" refId={x.id} label="Γιατί; — εξήγηση με AI" />
                          </div>
                        </details>
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
