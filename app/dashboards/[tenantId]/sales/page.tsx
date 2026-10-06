import type { Metadata } from "next";
import { Suspense } from "react";
import { Banknote, Receipt, RotateCcw, Users } from "lucide-react";
import { ComboChart, CompareAreaChart, DonutChart, RankingChart } from "@/components/charts/bi-charts";
import { ChartCard, DashboardErrors, DashboardSkeleton, EmptyDashboard, Kpi } from "@/components/dashboards/blocks";
import { YearPicker } from "@/components/dashboards/dashboard-nav";
import { ExportButton } from "@/components/dashboards/export-button";
import { cubeLoad, cubeLoadAll, num, type CubeRow } from "@/lib/cube-client";
import { pickYear, requireDashboardTenant } from "@/lib/dashboards";
import { eurCompact, eurFull, MONTHS_SHORT, pct, yoy } from "@/lib/format";

export const metadata: Metadata = { title: "Πωλήσεις" };

const S = (m: string) => `sales.${m}`;
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();
const range = (y: number, toMonth = 12): [string, string] => [`${y}-01-01`, `${y}-${String(toMonth).padStart(2, "0")}-${lastDay(y, toMonth)}`];

export default async function SalesDashboard({ params, searchParams }: PageProps<"/dashboards/[tenantId]/sales">) {
  const { tenantId } = await params;
  await requireDashboardTenant(tenantId);

  let years: number[] = [];
  try {
    const rows = await cubeLoad(tenantId, { dimensions: [S("fiscal_year")], measures: [S("invoices")], order: { [S("fiscal_year")]: "desc" } });
    years = rows.filter((r) => num(r[S("invoices")]) > 0).map((r) => num(r[S("fiscal_year")])).filter(Boolean);
  } catch (err) {
    return <DashboardErrors errors={[(err as Error).message]} />;
  }
  if (!years.length) {
    return <EmptyDashboard title="Δεν υπάρχουν ακόμα πωλήσεις">Τα παραστατικά πωλήσεων εμφανίζονται μετά την άντληση δεδομένων από το SoftOne του πελάτη.</EmptyDashboard>;
  }
  const year = pickYear((await searchParams).year, years);

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Πωλήσεις {year}</h1>
          <p className="text-xs text-muted-foreground">Τιμολόγια και αποδείξεις, καθαρή αξία· τα πιστωτικά και οι επιστροφές αφαιρούνται.</p>
        </div>
        <YearPicker years={years} year={year} />
      </div>
      <Suspense key={year} fallback={<DashboardSkeleton />}>
        <SalesBody tenantId={tenantId} year={year} hasPrevious={years.includes(year - 1)} />
      </Suspense>
    </>
  );
}

async function SalesBody({ tenantId, year, hasPrevious }: { tenantId: string; year: number; hasPrevious: boolean }) {
  const monthly = await cubeLoad(tenantId, {
    measures: [S("net"), S("invoices")],
    timeDimensions: [{ dimension: S("date"), granularity: "month", dateRange: [`${year - 1}-01-01`, `${year}-12-31`] }],
  }).catch(() => [] as CubeRow[]);

  const byMonth = (y: number) => {
    const out = Array.from({ length: 12 }, () => ({ net: 0, invoices: 0 }));
    for (const r of monthly) {
      const d = String(r[S("date.month")] ?? "");
      if (!d.startsWith(String(y))) continue;
      const m = Number(d.slice(5, 7)) - 1;
      out[m] = { net: num(r[S("net")]), invoices: num(r[S("invoices")]) };
    }
    return out;
  };
  const cur = byMonth(year);
  const prev = byMonth(year - 1);
  const lastMonth = cur.reduce((last, m, i) => (m.invoices ? i + 1 : last), 0) || 12;

  const kpis = [S("net"), S("invoices"), S("customers"), S("avg_invoice"), S("returns"), S("credit_notes")];
  const { data, errors } = await cubeLoadAll(tenantId, {
    now: { measures: kpis, timeDimensions: [{ dimension: S("date"), dateRange: range(year) }] },
    before: { measures: kpis, timeDimensions: [{ dimension: S("date"), dateRange: range(year - 1, lastMonth) }] },
    customers: {
      measures: [S("net")],
      dimensions: [S("customer_name")],
      timeDimensions: [{ dimension: S("date"), dateRange: range(year) }],
      order: { [S("net")]: "desc" },
      limit: 10,
    },
    cities: {
      measures: [S("net")],
      dimensions: [S("customer_city")],
      timeDimensions: [{ dimension: S("date"), dateRange: range(year) }],
      filters: [{ member: S("customer_city"), operator: "set" }],
      order: { [S("net")]: "desc" },
      limit: 8,
    },
    series: {
      measures: [S("net")],
      dimensions: [S("series_name")],
      timeDimensions: [{ dimension: S("date"), dateRange: range(year) }],
      order: { [S("net")]: "desc" },
    },
    weekly: {
      measures: [S("net")],
      timeDimensions: [{ dimension: S("date"), granularity: "week", dateRange: range(year) }],
    },
  });
  const n = (k: string) => num(data.now[0]?.[S(k)]);
  const b = (k: string) => (hasPrevious ? num(data.before[0]?.[S(k)]) : 0);
  const ytdHint = hasPrevious ? `vs ${MONTHS_SHORT[0]}–${MONTHS_SHORT[lastMonth - 1]} ${year - 1}` : undefined;

  const compare = MONTHS_SHORT.map((m, i) => ({
    month: m,
    current: i < lastMonth ? cur[i].net : null,
    previous: hasPrevious ? prev[i].net : null,
  }));
  const invoicesTrend = MONTHS_SHORT.map((m, i) => ({ month: m, invoices: cur[i].invoices, avg: cur[i].invoices ? cur[i].net / cur[i].invoices : 0 }));

  const seriesRows = data.series.map((r) => ({ name: String(r[S("series_name")]), value: num(r[S("net")]) })).filter((r) => r.value > 0);
  const mix = seriesRows.slice(0, 5);
  const rest = seriesRows.slice(5).reduce((s, r) => s + r.value, 0);
  if (rest > 0) mix.push({ name: "Λοιπές σειρές", value: rest });

  const weekly = data.weekly.map((r) => {
    const d = new Date(String(r[S("date.week")]));
    return { week: d.toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit" }), net: num(r[S("net")]) };
  });

  const top = data.customers.map((r) => ({ name: String(r[S("customer_name")]), value: num(r[S("net")]) }));
  const topShare = n("net") ? (100 * top.reduce((s, r) => s + r.value, 0)) / n("net") : 0;

  return (
    <div className="space-y-5">
      <DashboardErrors errors={errors} />
      <div className="flex justify-end">
        <ExportButton
          tenantId={tenantId}
          title={`Πωλήσεις ${year}`}
          sheets={[
            {
              name: "Πελάτες",
              columns: [
                { key: "sales.customer_code", label: "Κωδικός" },
                { key: "sales.customer_name", label: "Πελάτης" },
                { key: "sales.customer_city", label: "Πόλη" },
                { key: "sales.net", label: "Καθαρές πωλήσεις", format: "eur" },
                { key: "sales.invoices", label: "Παραστατικά", format: "int" },
                { key: "sales.returns", label: "Πιστωτικά", format: "eur" },
              ],
              query: {
                measures: ["sales.net", "sales.invoices", "sales.returns"],
                dimensions: ["sales.customer_code", "sales.customer_name", "sales.customer_city"],
                timeDimensions: [{ dimension: "sales.date", dateRange: range(year) }],
                order: { "sales.net": "desc" },
              },
            },
            {
              name: "Ανά μήνα",
              columns: [
                { key: "sales.date.month", label: "Μήνας", format: "date" },
                { key: "sales.net", label: "Καθαρές πωλήσεις", format: "eur" },
                { key: "sales.invoices", label: "Παραστατικά", format: "int" },
                { key: "sales.customers", label: "Πελάτες", format: "int" },
              ],
              query: {
                measures: ["sales.net", "sales.invoices", "sales.customers"],
                timeDimensions: [{ dimension: "sales.date", granularity: "month", dateRange: range(year) }],
                order: { "sales.date": "asc" },
              },
            },
            {
              name: "Ανά σειρά",
              columns: [
                { key: "sales.series_name", label: "Σειρά" },
                { key: "sales.net", label: "Καθαρή αξία", format: "eur" },
                { key: "sales.invoices", label: "Παραστατικά", format: "int" },
              ],
              query: {
                measures: ["sales.net", "sales.invoices"],
                dimensions: ["sales.series_name"],
                timeDimensions: [{ dimension: "sales.date", dateRange: range(year) }],
                order: { "sales.net": "desc" },
              },
            },
          ]}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Καθαρές πωλήσεις" value={eurCompact(n("net"))} change={yoy(n("net"), b("net"))} hint={ytdHint} icon={Banknote} tone="blue" spark={cur.slice(0, lastMonth).map((m) => m.net)} />
        <Kpi label="Παραστατικά" value={n("invoices").toLocaleString("el-GR")} change={yoy(n("invoices"), b("invoices"))} hint={`μέση αξία ${eurFull(n("avg_invoice"))}`} icon={Receipt} tone="violet" spark={cur.slice(0, lastMonth).map((m) => m.invoices)} />
        <Kpi label="Ενεργοί πελάτες" value={n("customers").toLocaleString("el-GR")} change={yoy(n("customers"), b("customers"))} hint="με τουλάχιστον ένα παραστατικό" icon={Users} tone="green" />
        <Kpi
          label="Πιστωτικά & επιστροφές"
          value={eurCompact(n("returns"))}
          change={yoy(n("returns"), b("returns"))}
          inverse
          hint={`${n("credit_notes").toLocaleString("el-GR")} παραστατικά · ${n("net") ? pct((100 * n("returns")) / (n("net") + n("returns"))) : "—"} των πωλήσεων`}
          icon={RotateCcw}
          tone="red"
        />
      </div>

      <ChartCard title="Πωλήσεις ανά μήνα" description={hasPrevious ? `${year} έναντι ${year - 1}` : String(year)}>
        <CompareAreaChart
          data={compare}
          xKey="month"
          current={{ key: "current", label: String(year), color: "var(--chart-1)" }}
          previous={{ key: "previous", label: String(year - 1), color: "var(--chart-5)" }}
        />
      </ChartCard>

      <div className="grid gap-5 lg:grid-cols-5">
        <ChartCard title="Κορυφαίοι πελάτες" description={`Top 10 · ${pct(topShare)} των πωλήσεων ${year}`} className="lg:col-span-3">
          <RankingChart data={top} label="Πωλήσεις" />
        </ChartCard>
        <ChartCard title="Πωλήσεις ανά σειρά παραστατικών" description={String(year)} className="lg:col-span-2">
          <DonutChart data={mix} centerLabel="προ πιστωτικών" />
        </ChartCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Εβδομαδιαίες πωλήσεις" description={`Καθαρή αξία ανά εβδομάδα, ${year}`}>
          <ComboChart data={weekly} xKey="week" className="h-64" series={[{ key: "net", label: "Πωλήσεις", color: "var(--chart-1)" }]} />
        </ChartCard>
        <ChartCard title="Παραστατικά & μέση αξία" description={`Ανά μήνα, ${year}`}>
          <ComboChart
            data={invoicesTrend}
            xKey="month"
            format="count"
            className="h-64"
            series={[
              { key: "invoices", label: "Παραστατικά", color: "var(--chart-4)" },
              { key: "avg", label: "Μέση αξία (€)", color: "var(--chart-3)", type: "line", rightAxis: "eur" },
            ]}
          />
        </ChartCard>
      </div>

      {data.cities.length > 0 && (
        <ChartCard title="Πωλήσεις ανά πόλη πελάτη" description={`Top 8, ${year}`}>
          <RankingChart data={data.cities.map((r) => ({ name: String(r[S("customer_city")]), value: num(r[S("net")]) }))} label="Πωλήσεις" color="var(--chart-3)" />
        </ChartCard>
      )}
    </div>
  );
}
