import type { Metadata } from "next";
import { Suspense } from "react";
import { Factory, Receipt, ShoppingCart, Truck } from "lucide-react";
import { CompareAreaChart, DonutChart, RankingChart } from "@/components/charts/bi-charts";
import { ChartCard, DashboardErrors, DashboardSkeleton, EmptyDashboard, Kpi } from "@/components/dashboards/blocks";
import { YearPicker } from "@/components/dashboards/dashboard-nav";
import { ExportButton } from "@/components/dashboards/export-button";
import { cubeLoad, cubeLoadAll, num, type CubeRow } from "@/lib/cube-client";
import { pickYear, requireDashboardTenant } from "@/lib/dashboards";
import { eurCompact, eurFull, MONTHS_SHORT, pct, yoy } from "@/lib/format";

export const metadata: Metadata = { title: "Αγορές" };

const P = (m: string) => `purchases.${m}`;
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();
const range = (y: number, toMonth = 12): [string, string] => [`${y}-01-01`, `${y}-${String(toMonth).padStart(2, "0")}-${lastDay(y, toMonth)}`];

export default async function PurchasesDashboard({ params, searchParams }: PageProps<"/dashboards/[tenantId]/purchases">) {
  const { tenantId } = await params;
  await requireDashboardTenant(tenantId);

  let years: number[] = [];
  try {
    const rows = await cubeLoad(tenantId, { dimensions: [P("fiscal_year")], measures: [P("invoices")], order: { [P("fiscal_year")]: "desc" } });
    years = rows.filter((r) => num(r[P("invoices")]) > 0).map((r) => num(r[P("fiscal_year")])).filter(Boolean);
  } catch (err) {
    return <DashboardErrors errors={[(err as Error).message]} />;
  }
  if (!years.length) {
    return <EmptyDashboard title="Δεν υπάρχουν ακόμα αγορές">Τα παραστατικά αγορών εμφανίζονται μετά την άντληση δεδομένων από το SoftOne του πελάτη.</EmptyDashboard>;
  }
  const year = pickYear((await searchParams).year, years);

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Αγορές {year}</h1>
          <p className="text-xs text-muted-foreground">Τιμολόγια αγοράς, καθαρή αξία· τα πιστωτικά αφαιρούνται.</p>
        </div>
        <YearPicker years={years} year={year} />
      </div>
      <Suspense key={year} fallback={<DashboardSkeleton />}>
        <PurchasesBody tenantId={tenantId} year={year} hasPrevious={years.includes(year - 1)} />
      </Suspense>
    </>
  );
}

async function PurchasesBody({ tenantId, year, hasPrevious }: { tenantId: string; year: number; hasPrevious: boolean }) {
  const monthly = await cubeLoad(tenantId, {
    measures: [P("net"), P("invoices")],
    timeDimensions: [{ dimension: P("date"), granularity: "month", dateRange: [`${year - 1}-01-01`, `${year}-12-31`] }],
  }).catch(() => [] as CubeRow[]);
  const byMonth = (y: number) => {
    const out = Array.from({ length: 12 }, () => ({ net: 0, invoices: 0 }));
    for (const r of monthly) {
      const d = String(r[P("date.month")] ?? "");
      if (!d.startsWith(String(y))) continue;
      out[Number(d.slice(5, 7)) - 1] = { net: num(r[P("net")]), invoices: num(r[P("invoices")]) };
    }
    return out;
  };
  const cur = byMonth(year);
  const prev = byMonth(year - 1);
  const lastMonth = cur.reduce((last, m, i) => (m.invoices ? i + 1 : last), 0) || 12;

  const kpis = [P("net"), P("invoices"), P("suppliers")];
  const { data, errors } = await cubeLoadAll(tenantId, {
    now: { measures: kpis, timeDimensions: [{ dimension: P("date"), dateRange: range(year) }] },
    before: { measures: kpis, timeDimensions: [{ dimension: P("date"), dateRange: range(year - 1, lastMonth) }] },
    suppliers: {
      measures: [P("net")],
      dimensions: [P("supplier_name")],
      timeDimensions: [{ dimension: P("date"), dateRange: range(year) }],
      order: { [P("net")]: "desc" },
      limit: 10,
    },
    series: {
      measures: [P("net")],
      dimensions: [P("series_name")],
      timeDimensions: [{ dimension: P("date"), dateRange: range(year) }],
      order: { [P("net")]: "desc" },
    },
  });
  const n = (k: string) => num(data.now[0]?.[P(k)]);
  const b = (k: string) => (hasPrevious ? num(data.before[0]?.[P(k)]) : 0);
  const ytdHint = hasPrevious ? `vs ${MONTHS_SHORT[0]}–${MONTHS_SHORT[lastMonth - 1]} ${year - 1}` : undefined;

  const top = data.suppliers.map((r) => ({ name: String(r[P("supplier_name")]), value: num(r[P("net")]) }));
  const top1 = top[0];
  const concentration = n("net") && top1 ? (100 * top1.value) / n("net") : 0;
  const seriesRows = data.series.map((r) => ({ name: String(r[P("series_name")]), value: num(r[P("net")]) })).filter((r) => r.value > 0);
  const mix = seriesRows.slice(0, 5);
  const rest = seriesRows.slice(5).reduce((s, r) => s + r.value, 0);
  if (rest > 0) mix.push({ name: "Λοιπές σειρές", value: rest });

  return (
    <div className="space-y-5">
      <DashboardErrors errors={errors} />
      <div className="flex justify-end">
        <ExportButton
          tenantId={tenantId}
          title={`Αγορές ${year}`}
          sheets={[
            {
              name: "Προμηθευτές",
              columns: [
                { key: "purchases.supplier_code", label: "Κωδικός" },
                { key: "purchases.supplier_name", label: "Προμηθευτής" },
                { key: "purchases.net", label: "Καθαρές αγορές", format: "eur" },
                { key: "purchases.invoices", label: "Τιμολόγια", format: "int" },
              ],
              query: {
                measures: ["purchases.net", "purchases.invoices"],
                dimensions: ["purchases.supplier_code", "purchases.supplier_name"],
                timeDimensions: [{ dimension: "purchases.date", dateRange: range(year) }],
                order: { "purchases.net": "desc" },
              },
            },
            {
              name: "Ανά μήνα",
              columns: [
                { key: "purchases.date.month", label: "Μήνας", format: "date" },
                { key: "purchases.net", label: "Καθαρές αγορές", format: "eur" },
                { key: "purchases.invoices", label: "Τιμολόγια", format: "int" },
              ],
              query: {
                measures: ["purchases.net", "purchases.invoices"],
                timeDimensions: [{ dimension: "purchases.date", granularity: "month", dateRange: range(year) }],
                order: { "purchases.date": "asc" },
              },
            },
          ]}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Καθαρές αγορές" value={eurCompact(n("net"))} change={yoy(n("net"), b("net"))} inverse hint={ytdHint} icon={ShoppingCart} tone="amber" spark={cur.slice(0, lastMonth).map((m) => m.net)} />
        <Kpi label="Τιμολόγια αγοράς" value={n("invoices").toLocaleString("el-GR")} change={yoy(n("invoices"), b("invoices"))} hint={n("invoices") ? `μέση αξία ${eurFull(n("net") / n("invoices"))}` : undefined} icon={Receipt} tone="violet" spark={cur.slice(0, lastMonth).map((m) => m.invoices)} />
        <Kpi label="Ενεργοί προμηθευτές" value={n("suppliers").toLocaleString("el-GR")} change={yoy(n("suppliers"), b("suppliers"))} icon={Truck} tone="teal" />
        <Kpi label="Μεγαλύτερος προμηθευτής" value={top1 ? pct(concentration) : "—"} hint={top1 ? top1.name : undefined} icon={Factory} tone="slate" />
      </div>

      <ChartCard title="Αγορές ανά μήνα" description={hasPrevious ? `${year} έναντι ${year - 1}` : String(year)}>
        <CompareAreaChart
          data={MONTHS_SHORT.map((m, i) => ({ month: m, current: i < lastMonth ? cur[i].net : null, previous: hasPrevious ? prev[i].net : null }))}
          xKey="month"
          current={{ key: "current", label: String(year), color: "var(--chart-5)" }}
          previous={{ key: "previous", label: String(year - 1), color: "var(--chart-4)" }}
        />
      </ChartCard>

      <div className="grid gap-5 lg:grid-cols-5">
        <ChartCard title="Κορυφαίοι προμηθευτές" description={`Top 10, ${year}`} className="lg:col-span-3">
          <RankingChart data={top} label="Αγορές" color="var(--chart-5)" />
        </ChartCard>
        <ChartCard title="Αγορές ανά σειρά παραστατικών" description={String(year)} className="lg:col-span-2">
          <DonutChart data={mix} centerLabel="προ πιστωτικών" />
        </ChartCard>
      </div>
    </div>
  );
}
