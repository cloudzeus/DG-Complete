import type { Metadata } from "next";
import { Suspense } from "react";
import {
  Clock,
  Factory,
  Layers,
  Receipt,
  ShoppingCart,
  Tags,
  Truck,
} from "lucide-react";
import {
  ComboChart,
  CompareAreaChart,
  DonutChart,
  MultiLineChart,
  RankingChart,
} from "@/components/charts/bi-charts";
import {
  CashDragTable,
  Findings,
  GroupTable,
  PaybackItemTable,
  PaybackSupplierTable,
  PriceTable,
  RoiTable,
  SupplierTable,
} from "@/components/purchases/purchase-analysis";
import {
  ChangeTreemap,
  Heatmap,
  QuadrantBubbles,
  RatioGauge,
} from "@/components/charts/insight-charts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { purchasePayback } from "@/lib/purchase-payback";
import {
  purchaseAnalysis,
  type PurchaseAnalysis,
} from "@/lib/purchase-analysis";
import {
  ChartCard,
  DashboardErrors,
  DashboardSkeleton,
  EmptyDashboard,
  Kpi,
} from "@/components/dashboards/blocks";
import { YearPicker } from "@/components/dashboards/dashboard-nav";
import { ExportButton } from "@/components/dashboards/export-button";
import { cubeLoad, cubeLoadAll, num, type CubeRow } from "@/lib/cube-client";
import { pickYear, requireDashboardTenant } from "@/lib/dashboards";
import { eurCompact, eurFull, MONTHS_SHORT, pct, yoy } from "@/lib/format";

export const metadata: Metadata = { title: "Αγορές" };

const P = (m: string) => `purchases.${m}`;
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();
const range = (y: number, toMonth = 12): [string, string] => [
  `${y}-01-01`,
  `${y}-${String(toMonth).padStart(2, "0")}-${lastDay(y, toMonth)}`,
];

export default async function PurchasesDashboard({
  params,
  searchParams,
}: PageProps<"/dashboards/[tenantId]/purchases">) {
  const { tenantId } = await params;
  await requireDashboardTenant(tenantId, "purchases");

  let years: number[] = [];
  try {
    const rows = await cubeLoad(tenantId, {
      dimensions: [P("fiscal_year")],
      measures: [P("invoices")],
      order: { [P("fiscal_year")]: "desc" },
    });
    years = rows
      .filter((r) => num(r[P("invoices")]) > 0)
      .map((r) => num(r[P("fiscal_year")]))
      .filter(Boolean);
  } catch (err) {
    return <DashboardErrors errors={[(err as Error).message]} />;
  }
  if (!years.length) {
    return (
      <EmptyDashboard title="Δεν υπάρχουν ακόμα αγορές">
        Τα παραστατικά αγορών εμφανίζονται μετά την άντληση δεδομένων από το
        SoftOne του πελάτη.
      </EmptyDashboard>
    );
  }
  const year = pickYear((await searchParams).year, years);

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Αγορές {year}
          </h1>
          <p className="text-xs text-muted-foreground">
            Τιμολόγια αγοράς, καθαρή αξία· τα πιστωτικά αφαιρούνται.
          </p>
        </div>
        <YearPicker years={years} year={year} />
      </div>
      <Suspense key={year} fallback={<DashboardSkeleton />}>
        <PurchasesBody
          tenantId={tenantId}
          year={year}
          hasPrevious={years.includes(year - 1)}
        />
      </Suspense>
    </>
  );
}

async function PurchasesBody({
  tenantId,
  year,
  hasPrevious,
}: {
  tenantId: string;
  year: number;
  hasPrevious: boolean;
}) {
  const monthly = await cubeLoad(tenantId, {
    measures: [P("net"), P("invoices")],
    timeDimensions: [
      {
        dimension: P("date"),
        granularity: "month",
        dateRange: [`${year - 1}-01-01`, `${year}-12-31`],
      },
    ],
  }).catch(() => [] as CubeRow[]);
  const byMonth = (y: number) => {
    const out = Array.from({ length: 12 }, () => ({ net: 0, invoices: 0 }));
    for (const r of monthly) {
      const d = String(r[P("date.month")] ?? "");
      if (!d.startsWith(String(y))) continue;
      out[Number(d.slice(5, 7)) - 1] = {
        net: num(r[P("net")]),
        invoices: num(r[P("invoices")]),
      };
    }
    return out;
  };
  const cur = byMonth(year);
  const prev = byMonth(year - 1);
  const lastMonth =
    cur.reduce((last, m, i) => (m.invoices ? i + 1 : last), 0) || 12;

  const kpis = [P("net"), P("invoices"), P("suppliers")];
  const paybackP = purchasePayback(tenantId).catch((err) => {
    console.error("[purchases] payback:", (err as Error).message);
    return null;
  });
  const analysisP: Promise<PurchaseAnalysis | null> = purchaseAnalysis(
    tenantId,
    year,
    lastMonth,
  ).catch((err) => {
    console.error("[purchases] analysis:", (err as Error).message);
    return null;
  });
  const { data, errors } = await cubeLoadAll(tenantId, {
    now: {
      measures: kpis,
      timeDimensions: [{ dimension: P("date"), dateRange: range(year) }],
    },
    before: {
      measures: kpis,
      timeDimensions: [
        { dimension: P("date"), dateRange: range(year - 1, lastMonth) },
      ],
    },
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
  const a = await analysisP;
  const pb = await paybackP;
  const monthLabel = (ym: string) =>
    `${MONTHS_SHORT[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;
  const period = `${MONTHS_SHORT[0]}–${MONTHS_SHORT[lastMonth - 1]} ${year}`;
  const n = (k: string) => num(data.now[0]?.[P(k)]);
  const b = (k: string) => (hasPrevious ? num(data.before[0]?.[P(k)]) : 0);
  const ytdHint = hasPrevious
    ? `vs ${MONTHS_SHORT[0]}–${MONTHS_SHORT[lastMonth - 1]} ${year - 1}`
    : undefined;

  const top = data.suppliers.map((r) => ({
    name: String(r[P("supplier_name")]),
    value: num(r[P("net")]),
  }));
  const top1 = top[0];
  const concentration = n("net") && top1 ? (100 * top1.value) / n("net") : 0;
  const seriesRows = data.series
    .map((r) => ({
      name: String(r[P("series_name")]),
      value: num(r[P("net")]),
    }))
    .filter((r) => r.value > 0);
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
                {
                  key: "purchases.net",
                  label: "Καθαρές αγορές",
                  format: "eur",
                },
                {
                  key: "purchases.invoices",
                  label: "Τιμολόγια",
                  format: "int",
                },
              ],
              query: {
                measures: ["purchases.net", "purchases.invoices"],
                dimensions: [
                  "purchases.supplier_code",
                  "purchases.supplier_name",
                ],
                timeDimensions: [
                  { dimension: "purchases.date", dateRange: range(year) },
                ],
                order: { "purchases.net": "desc" },
              },
            },
            {
              name: "Ανά μήνα",
              columns: [
                { key: "purchases.date.month", label: "Μήνας", format: "date" },
                {
                  key: "purchases.net",
                  label: "Καθαρές αγορές",
                  format: "eur",
                },
                {
                  key: "purchases.invoices",
                  label: "Τιμολόγια",
                  format: "int",
                },
              ],
              query: {
                measures: ["purchases.net", "purchases.invoices"],
                timeDimensions: [
                  {
                    dimension: "purchases.date",
                    granularity: "month",
                    dateRange: range(year),
                  },
                ],
                order: { "purchases.date": "asc" },
              },
            },
          ]}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Καθαρές αγορές"
          value={eurCompact(n("net"))}
          change={yoy(n("net"), b("net"))}
          inverse
          hint={ytdHint}
          icon={ShoppingCart}
          tone="amber"
          spark={cur.slice(0, lastMonth).map((m) => m.net)}
        />
        <Kpi
          label="Τιμολόγια αγοράς"
          value={n("invoices").toLocaleString("el-GR")}
          change={yoy(n("invoices"), b("invoices"))}
          hint={
            n("invoices")
              ? `μέση αξία ${eurFull(n("net") / n("invoices"))}`
              : undefined
          }
          icon={Receipt}
          tone="violet"
          spark={cur.slice(0, lastMonth).map((m) => m.invoices)}
        />
        <Kpi
          label="Ενεργοί προμηθευτές"
          value={n("suppliers").toLocaleString("el-GR")}
          change={yoy(n("suppliers"), b("suppliers"))}
          icon={Truck}
          tone="teal"
        />
        <Kpi
          label="Μεγαλύτερος προμηθευτής"
          value={top1 ? pct(concentration) : "—"}
          hint={top1 ? top1.name : undefined}
          icon={Factory}
          tone="slate"
        />
      </div>

      {a && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Αγορές / κόστος πωλήσεων"
              value={
                a.totals.cogs
                  ? (a.totals.purchases / a.totals.cogs).toLocaleString(
                      "el-GR",
                      { maximumFractionDigits: 2 },
                    )
                  : "—"
              }
              hint={
                a.totals.cogs
                  ? `απόθεμα ${a.totals.stockChange >= 0 ? "+" : "−"}${eurCompact(Math.abs(a.totals.stockChange))} · ${period}`
                  : undefined
              }
              icon={Layers}
              tone={
                a.totals.cogs && a.totals.purchases / a.totals.cogs > 1.1
                  ? "amber"
                  : "green"
              }
            />
            <Kpi
              label="Τιμές αγοράς (ίδια είδη)"
              value={
                a.priceIndexPct === null
                  ? "—"
                  : `${a.priceIndexPct > 0 ? "+" : ""}${a.priceIndexPct.toLocaleString("el-GR", { maximumFractionDigits: 1 })}%`
              }
              hint={`έναντι ${year - 1} · ${Math.round(a.pricedSpendPct)}% των αγορών`}
              icon={Tags}
              tone={
                a.priceIndexPct !== null && a.priceIndexPct > 2 ? "red" : "teal"
              }
            />
            <Kpi
              label="5 μεγαλύτεροι προμηθευτές"
              value={`${Math.round(a.top5SharePct)}%`}
              hint="των αγορών της περιόδου"
              icon={Truck}
              tone="violet"
            />
            <Kpi
              label="Χρόνος παράδοσης"
              value={a.leadMedian === null ? "—" : `${a.leadMedian} ημ.`}
              hint="διάμεσος, παραγγελία → παραλαβή (24μ)"
              icon={Clock}
              tone="blue"
            />
          </div>
          <Findings items={a.findings} />
          <div className="grid gap-5 lg:grid-cols-4">
            <ChartCard
              title="Ισορροπία αγορών"
              description={period}
              className="lg:col-span-1"
            >
              <RatioGauge
                value={
                  a.totals.cogs ? a.totals.purchases / a.totals.cogs : null
                }
                label="Αγορές ÷ κόστος πωλήσεων"
                hint={
                  a.totals.cogs
                    ? `απόθεμα ${a.totals.stockChange >= 0 ? "+" : "−"}${eurCompact(Math.abs(a.totals.stockChange))}`
                    : undefined
                }
              />
            </ChartCard>
            <ChartCard
              title="Αγορές έναντι κόστους πωλήσεων"
              description={`${year} ανά μήνα — όταν οι αγορές ξεπερνούν το κόστος των πωλήσεων, το απόθεμα μεγαλώνει`}
              className="lg:col-span-3"
            >
              <ComboChart
                data={MONTHS_SHORT.slice(0, lastMonth).map((m, i) => ({
                  month: m,
                  purchases: a.months[i].purchases,
                  cogs: a.months[i].cogs,
                  gap: a.months[i].purchases - a.months[i].cogs,
                }))}
                xKey="month"
                series={[
                  {
                    key: "purchases",
                    label: "Αγορές",
                    color: "var(--chart-5)",
                    type: "bar",
                  },
                  {
                    key: "cogs",
                    label: "Κόστος πωλήσεων",
                    color: "var(--chart-2)",
                    type: "line",
                  },
                  {
                    key: "gap",
                    label: "Διαφορά (απόθεμα)",
                    color: "var(--chart-4)",
                    type: "line",
                    dashed: true,
                  },
                ]}
                zeroLine
              />
            </ChartCard>
          </div>
        </>
      )}

      <ChartCard
        title="Αγορές ανά μήνα"
        description={hasPrevious ? `${year} έναντι ${year - 1}` : String(year)}
      >
        <CompareAreaChart
          data={MONTHS_SHORT.map((m, i) => ({
            month: m,
            current: i < lastMonth ? cur[i].net : null,
            previous: hasPrevious ? prev[i].net : null,
          }))}
          xKey="month"
          current={{
            key: "current",
            label: String(year),
            color: "var(--chart-5)",
          }}
          previous={{
            key: "previous",
            label: String(year - 1),
            color: "var(--chart-4)",
          }}
        />
      </ChartCard>

      <div className="grid gap-5 lg:grid-cols-5">
        <ChartCard
          title="Κορυφαίοι προμηθευτές"
          description={`Top 10, ${year}`}
          className="lg:col-span-3"
        >
          <RankingChart data={top} label="Αγορές" color="var(--chart-5)" />
        </ChartCard>
        <ChartCard
          title="Αγορές ανά σειρά παραστατικών"
          description={String(year)}
          className="lg:col-span-2"
        >
          <DonutChart data={mix} centerLabel="προ πιστωτικών" />
        </ChartCard>
      </div>

      {a && (
        <>
          <ChartCard
            title="Πού πάνε τα χρήματα των αγορών"
            description={`${period}: μέγεθος = αξία αγορών ανά κατηγορία · χρώμα = μεταβολή έναντι ${year - 1} (κόκκινο πτώση, πράσινο αύξηση)`}
          >
            <ChangeTreemap
              data={a.categories.map((c) => ({
                name: c.name,
                value: c.purchases,
                change: c.growthPct,
              }))}
              valueLabel="Αγορές"
              changeLabel={`Μεταβολή vs ${year - 1}`}
            />
          </ChartCard>
          <div className="grid gap-5 xl:grid-cols-2">
            <ChartCard
              title="Αγορές ανά κατηγορία"
              description={`${period} έναντι ίδιας περιόδου ${year - 1} · αγορές ÷ κόστος πωλήσεων`}
            >
              <GroupTable rows={a.categories} label="Κατηγορία" />
            </ChartCard>
            <ChartCard
              title="Αγορές ανά μάρκα"
              description={`${period} έναντι ίδιας περιόδου ${year - 1} · αγορές ÷ κόστος πωλήσεων`}
            >
              <GroupTable rows={a.brands} label="Μάρκα" />
            </ChartCard>
          </div>
          <ChartCard
            title="Προμηθευτές"
            description={`${period}: μερίδιο, μεταβολή, χρόνος παράδοσης και μεταβολή τιμών στα ίδια είδη`}
          >
            <SupplierTable rows={a.suppliers} leadMedian={a.leadMedian} />
          </ChartCard>
          <h2 className="pt-2 text-lg font-semibold tracking-tight">
            Απόδοση & απόσβεση αγορών
          </h2>
          {pb && pb.brandMonths.brands.length > 0 && (
            <ChartCard
              title="Σε πόσες ημέρες αποσβένονται οι αγορές κάθε μάρκας"
              description="Ανά μήνα αγοράς: ημέρες ως ότου οι πωλήσεις των τεμαχίων κάλυψαν το κόστος τους (διάμεσος, σταθμισμένος με την αξία) — χαμηλότερα = καλύτερα. Οι πρόσφατοι μήνες βελτιώνονται όσο πουλιούνται."
            >
              <MultiLineChart
                data={pb.brandMonths.months.map((m, i) => ({
                  month: monthLabel(m),
                  ...Object.fromEntries(
                    pb.brandMonths.brands.map((b, j) => [`b${j}`, b.values[i]]),
                  ),
                }))}
                xKey="month"
                series={pb.brandMonths.brands.map((b, j) => ({ key: `b${j}`, label: b.name }))}
                format="days"
                reference={{ y: 90, label: "90 ημέρες" }}
              />
            </ChartCard>
          )}
          {pb && pb.brandMonths.brands.length > 0 && (
            <ChartCard
              title="Χάρτης απόσβεσης: μάρκα × μήνας αγοράς"
              description="Ημέρες ως την απόσβεση — πράσινο γρήγορα (≤30), κόκκινο αργά (≥180)"
            >
              <Heatmap
                rows={pb.brandMonths.brands.map((b) => b.name)}
                columns={pb.brandMonths.months.map(monthLabel)}
                values={pb.brandMonths.brands.map((b) => b.values)}
                good={30}
                bad={180}
                unit=" ημ."
              />
            </ChartCard>
          )}
          <ChartCard
            title="Μήτρα απόδοσης αποθέματος ανά κατηγορία"
            description="Σε σχέση με τις υπόλοιπες κατηγορίες (οι διακεκομμένες = διάμεσος): αριστερά-πάνω γυρίζει γρήγορα με καλό κέρδος, δεξιά-κάτω κεφάλαιο που κοιμάται. Μέγεθος = αξία αποθέματος."
          >
            <QuadrantBubbles
              data={a.roi.categories
                .filter(
                  (r) =>
                    r.gmroi !== null &&
                    r.stockDays !== null &&
                    r.stockValue > 0,
                )
                .map((r) => ({
                  name: r.name,
                  x: Math.min(r.stockDays!, 1500),
                  y: r.gmroi!,
                  size: r.stockValue,
                }))}
              xLabel="Ημέρες αποθέματος"
              yLabel="Κέρδος ανά 1 € αποθέματος"
              quadrants={[
                "Αστέρια",
                "Αργά αλλά κερδοφόρα",
                "Γρήγορα, χαμηλό κέρδος",
                "Δεμένο κεφάλαιο",
              ]}
              xUnit=" ημ."
              yUnit=" €"
              sizeLabel="Απόθεμα"
            />
          </ChartCard>
          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard
              title="ROI αποθέματος ανά κατηγορία"
              description="Μικτό κέρδος 12 μηνών για κάθε 1 € που είναι δεμένο σε απόθεμα — ψηλότερα = καλύτερα"
            >
              <RankingChart
                data={a.roi.categories
                  .filter((r) => r.gmroi !== null)
                  .sort((x, y) => y.gmroi! - x.gmroi!)
                  .slice(0, 12)
                  .map((r) => ({
                    name: r.name,
                    value: Math.round(r.gmroi! * 100) / 100,
                  }))}
                label="Κέρδος ανά 1 € αποθέματος"
                color="var(--chart-2)"
              />
            </ChartCard>
            {pb && (
              <ChartCard
                title="Ακίνητες αγορές ανά προμηθευτή"
                description="% της αξίας που αγοράστηκε πριν από 90+ ημέρες και δεν έχει πουληθεί — ψηλότερα = χειρότερα για το ταμείο"
              >
                <RankingChart
                  data={pb.suppliers
                    .filter((x) => x.idlePct !== null && x.cost >= 2000)
                    .sort((x, y) => y.idleCost - x.idleCost)
                    .slice(0, 12)
                    .map((x) => ({
                      name: x.supplier,
                      value: Math.round(x.idlePct!),
                    }))}
                  label="Ακίνητο"
                  color="var(--chart-5)"
                  format="pct"
                />
              </ChartCard>
            )}
          </div>
          {pb && (
            <ChartCard
              title="Απόσβεση ανά προμηθευτή"
              description="Τελευταίοι 18 μήνες: πόσο έχει επιστρέψει από πωλήσεις, σε πόσες ημέρες αποσβένεται ένα τιμολόγιο και πόσο μένει ακίνητο"
            >
              <PaybackSupplierTable rows={pb.suppliers.slice(0, 15)} />
            </ChartCard>
          )}
          <ChartCard
            title="ROI αποθέματος"
            description="Τελευταίοι 12 μήνες: κέρδος, απόθεμα σε κόστος, κέρδος ανά 1 € αποθέματος και ημέρες αποθέματος"
          >
            <Tabs defaultValue="suppliers">
              <TabsList>
                <TabsTrigger value="suppliers">Προμηθευτές</TabsTrigger>
                <TabsTrigger value="categories">Κατηγορίες</TabsTrigger>
                <TabsTrigger value="brands">Μάρκες</TabsTrigger>
              </TabsList>
              <TabsContent value="suppliers">
                <RoiTable rows={a.roi.suppliers} label="Προμηθευτής" />
              </TabsContent>
              <TabsContent value="categories">
                <RoiTable rows={a.roi.categories} label="Κατηγορία" />
              </TabsContent>
              <TabsContent value="brands">
                <RoiTable rows={a.roi.brands} label="Μάρκα" />
              </TabsContent>
            </Tabs>
          </ChartCard>
          {pb && (
            <>
              <div className="grid gap-5 xl:grid-cols-2">
                <ChartCard
                  title="Προϊόντα που αποσβένονται πιο γρήγορα"
                  description="Είδη αποθήκης (3+ αγορές): διάμεσος χρόνος ως την απόσβεση κάθε αγοράς"
                >
                  <PaybackItemTable rows={pb.fastest} mode="fast" />
                </ChartCard>
                <ChartCard
                  title="Προϊόντα που κρατούν μετρητά"
                  description="Αγορές που δεν έχουν αποσβεστεί μετά από 90+ ημέρες, κατά δεσμευμένο κόστος"
                >
                  <PaybackItemTable rows={pb.slowest} mode="slow" />
                </ChartCard>
              </div>
              <ChartCard
                title="Αγορές που επιβάρυναν το ταμείο"
                description="Τιμολόγια 90+ ημερών, κατά ποσό που μένει δεσμευμένο σε απούλητα τεμάχια"
              >
                <CashDragTable rows={pb.cashDrags} />
              </ChartCard>
            </>
          )}
          <div className="grid gap-5 xl:grid-cols-5">
            <ChartCard
              title="Μεγαλύτερες αυξήσεις τιμών αγοράς"
              description={`Μέση τιμή ${year} έναντι ${year - 1}, ταξινομημένες κατά επίπτωση`}
              className="xl:col-span-3"
            >
              <PriceTable
                rows={a.priceUp}
                empty="Καμία σημαντική αύξηση τιμής."
              />
            </ChartCard>
            <ChartCard
              title="Μειώσεις τιμών"
              description="Είδη που αγοράζετε φθηνότερα"
              className="xl:col-span-2"
            >
              <PriceTable
                rows={a.priceDown}
                empty="Καμία σημαντική μείωση τιμής."
              />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
