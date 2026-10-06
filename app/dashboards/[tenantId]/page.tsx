import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Info,
  Landmark,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { CompareAreaChart, RankingChart } from "@/components/charts/bi-charts";
import { ChartCard, DashboardErrors, DashboardSkeleton, Kpi } from "@/components/dashboards/blocks";
import { ExportButton } from "@/components/dashboards/export-button";
import { PeriodPicker } from "@/components/dashboards/period-picker";
import { cubeLoadAll, num } from "@/lib/cube-client";
import { requireDashboardTenant } from "@/lib/dashboards";
import { eurCompact, eurFull, pct, yoy } from "@/lib/format";
import { buildInsights, type Insight, type Severity } from "@/lib/insights";
import { fmtDate, periodQuery, resolvePeriod, type Period } from "@/lib/period";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Επισκόπηση" };

export default async function OverviewPage({ params, searchParams }: PageProps<"/dashboards/[tenantId]">) {
  const { tenantId } = await params;
  await requireDashboardTenant(tenantId);
  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const unavailable = typeof sp.unavailable === "string" ? sp.unavailable : null;

  return (
    <>
      {unavailable !== null && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Η σελίδα που ζητήσατε δεν περιλαμβάνεται στο πακέτο της εταιρείας σας. Για ενεργοποίηση επικοινωνήστε με την DGsoft.
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Επισκόπηση</h1>
          <p className="text-xs text-muted-foreground">
            {fmtDate(period.from)} – {fmtDate(period.to)} · σύγκριση με {fmtDate(period.prevFrom)} – {fmtDate(period.prevTo)}
          </p>
        </div>
        <PeriodPicker preset={period.preset} from={period.from} to={period.to} label={period.label} />
      </div>
      <Suspense key={periodQuery(period)} fallback={<DashboardSkeleton />}>
        <OverviewBody tenantId={tenantId} period={period} />
      </Suspense>
    </>
  );
}

const SEVERITY: Record<Severity, { icon: LucideIcon; tone: string; bar: string; label: string }> = {
  bad: { icon: XCircle, tone: "text-red-600 bg-red-50", bar: "before:bg-red-500", label: "Προσοχή" },
  warn: { icon: AlertTriangle, tone: "text-amber-600 bg-amber-50", bar: "before:bg-amber-500", label: "Ενέργεια" },
  good: { icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-50", bar: "before:bg-emerald-500", label: "Θετικό" },
  info: { icon: Info, tone: "text-sky-600 bg-sky-50", bar: "before:bg-sky-500", label: "Πληροφορία" },
};

function InsightCard({ i, base, q }: { i: Insight; base: string; q: string }) {
  const s = SEVERITY[i.severity];
  return (
    <li
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card p-4 shadow-fluent-2 before:absolute before:inset-y-0 before:left-0 before:w-1",
        s.bar,
      )}
    >
      <div className="flex gap-3">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", s.tone)}>
          <s.icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">{i.area}</span>
            <span className={cn("rounded px-1.5 py-px text-2xs font-semibold", s.tone)}>{s.label}</span>
          </div>
          <p className="text-sm leading-snug font-semibold">{i.title}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{i.detail}</p>
          {i.action && (
            <p className="text-xs leading-relaxed">
              <span className="font-semibold text-foreground">Πρόταση: </span>
              {i.action}
            </p>
          )}
          {i.href && (
            <Link href={`${base}/${i.href}${i.href.includes("?") ? "&" : "?"}${q}`} className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-primary hover:underline">
              Δείτε τη λίστα <ArrowRight className="size-3.5" />
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

function granularity(p: Period): "day" | "week" | "month" {
  return p.days <= 62 ? "day" : p.days <= 200 ? "week" : "month";
}

async function OverviewBody({ tenantId, period }: { tenantId: string; period: Period }) {
  const g = granularity(period);
  const [{ insights, errors, kpis: k }, trend] = await Promise.all([
    buildInsights(tenantId, period),
    cubeLoadAll(tenantId, {
      now: { measures: ["sales_lines.revenue"], timeDimensions: [{ dimension: "sales_lines.date", granularity: g, dateRange: [period.from, period.to] }] },
      prev: { measures: ["sales_lines.revenue"], timeDimensions: [{ dimension: "sales_lines.date", granularity: g, dateRange: [period.prevFrom, period.prevTo] }] },
    }),
  ]);
  const key = `sales_lines.date.${g}`;
  const label = (iso: string) => {
    const d = new Date(iso);
    return g === "month"
      ? d.toLocaleDateString("el-GR", { month: "short", year: "2-digit" })
      : d.toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit" });
  };
  const nowRows = trend.data.now;
  const prevRows = trend.data.prev;
  const points = nowRows.map((r, i) => ({
    x: label(String(r[key])),
    current: num(r["sales_lines.revenue"]),
    previous: prevRows[i] ? num(prevRows[i]["sales_lines.revenue"]) : null,
  }));
  const base = `/dashboards/${tenantId}`;
  const marginPct = k.marginPct.now;

  return (
    <div className="space-y-5">
      <DashboardErrors errors={[...errors, ...trend.errors]} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <Kpi label="Τζίρος" value={eurCompact(k.revenue.now)} change={yoy(k.revenue.now, k.revenue.prev)} hint="έναντι πέρσι" icon={Banknote} tone="blue" spark={points.map((p) => p.current)} />
        <Kpi label="Μικτό κέρδος" value={eurCompact(k.margin.now)} change={yoy(k.margin.now, k.margin.prev)} hint={marginPct ? `περιθώριο ${pct(marginPct)}` : undefined} icon={TrendingUp} tone="green" />
        <Kpi label="Παραστατικά" value={k.documents.now.toLocaleString("el-GR")} change={yoy(k.documents.now, k.documents.prev)} hint={k.documents.now ? `μέση αξία ${eurFull(k.revenue.now / k.documents.now)}` : undefined} icon={Receipt} tone="violet" />
        <Kpi label="Ενεργοί πελάτες" value={k.customers.now.toLocaleString("el-GR")} change={yoy(k.customers.now, k.customers.prev)} hint="με αγορά στην περίοδο" icon={Users} tone="teal" />
        <Kpi label="Υπόλοιπο πελατών" value={eurCompact(k.receivables)} hint={`DSO ${Math.round(k.dso)} ημ. · >90 ημ. ${eurCompact(k.overdue90)}`} icon={Wallet} tone="amber" />
        <Kpi label="Ταμείο & τράπεζες" value={k.cash ? eurCompact(k.cash) : "—"} hint={`απόθεμα ${eurCompact(k.stockValue)}`} icon={Landmark} tone="slate" />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <section className="space-y-3 lg:col-span-3" aria-label="Συμπεράσματα">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Τι πρέπει να ξέρετε</h2>
              <p className="text-xs text-muted-foreground">Αυτόματα συμπεράσματα από τα δεδομένα της επιχείρησης, ενημερωμένα κάθε ώρα.</p>
            </div>
            <ExportButton
              tenantId={tenantId}
              title={`Επισκόπηση ${period.from} – ${period.to}`}
              subtitle={`${period.label}: ${period.from} έως ${period.to}, σύγκριση με ${period.prevFrom} έως ${period.prevTo}`}
              sheets={[
                {
                  name: "Συμπεράσματα",
                  columns: [
                    { key: "area", label: "Περιοχή" },
                    { key: "severity", label: "Σοβαρότητα" },
                    { key: "title", label: "Εύρημα" },
                    { key: "detail", label: "Λεπτομέρειες" },
                    { key: "action", label: "Πρόταση" },
                  ],
                  rows: insights.map((i) => ({ ...i, severity: SEVERITY[i.severity].label })),
                },
                {
                  name: "Κατηγορίες",
                  columns: [
                    { key: "sales_lines.category", label: "Κατηγορία" },
                    { key: "sales_lines.revenue", label: "Τζίρος", format: "eur" },
                    { key: "sales_lines.margin", label: "Μικτό κέρδος", format: "eur" },
                    { key: "sales_lines.margin_pct", label: "Περιθώριο %", format: "pct" },
                    { key: "sales_lines.quantity", label: "Ποσότητα", format: "num" },
                    { key: "sales_lines.customers", label: "Πελάτες", format: "int" },
                  ],
                  query: {
                    measures: ["sales_lines.revenue", "sales_lines.margin", "sales_lines.margin_pct", "sales_lines.quantity", "sales_lines.customers"],
                    dimensions: ["sales_lines.category"],
                    timeDimensions: [{ dimension: "sales_lines.date", dateRange: [period.from, period.to] }],
                    order: { "sales_lines.revenue": "desc" },
                  },
                },
                {
                  name: "Τζίρος ανά ημέρα",
                  columns: [
                    { key: "sales_lines.date.day", label: "Ημερομηνία", format: "date" },
                    { key: "sales_lines.revenue", label: "Τζίρος", format: "eur" },
                    { key: "sales_lines.margin", label: "Μικτό κέρδος", format: "eur" },
                    { key: "sales_lines.documents", label: "Παραστατικά", format: "int" },
                  ],
                  query: {
                    measures: ["sales_lines.revenue", "sales_lines.margin", "sales_lines.documents"],
                    timeDimensions: [{ dimension: "sales_lines.date", granularity: "day", dateRange: [period.from, period.to] }],
                    order: { "sales_lines.date": "asc" },
                  },
                },
              ]}
            />
          </div>
          {insights.length ? (
            <ul className="space-y-3">
              {insights.map((i) => (
                <InsightCard key={i.id} i={i} base={base} q={periodQuery(period)} />
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">Δεν υπάρχουν ακόμα αρκετά δεδομένα για συμπεράσματα.</p>
          )}
        </section>

        <div className="space-y-5 lg:col-span-2">
          <ChartCard title="Τζίρος" description={`${g === "day" ? "Ανά ημέρα" : g === "week" ? "Ανά εβδομάδα" : "Ανά μήνα"}, έναντι ίδιας περιόδου πέρσι`}>
            <CompareAreaChart
              data={points}
              xKey="x"
              className="h-60"
              current={{ key: "current", label: "Φέτος", color: "var(--chart-1)" }}
              previous={{ key: "previous", label: "Πέρσι", color: "var(--chart-5)" }}
            />
          </ChartCard>
          <ChartCard title="Κατηγορίες" description="Τζίρος περιόδου ανά εμπορική κατηγορία">
            <RankingChart data={k.categories.slice(0, 8).map((c) => ({ name: c.name, value: c.revenue }))} label="Τζίρος" />
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-2xs text-muted-foreground">
              {k.categories.slice(0, 8).map((c) => (
                <li key={c.name} className="flex justify-between gap-2">
                  <span className="truncate">{c.name}</span>
                  <span className={cn("tabular-nums", c.margin < 15 ? "text-red-600" : "text-emerald-700")}>{c.margin ? pct(c.margin) : "—"}</span>
                </li>
              ))}
            </ul>
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
