import type { Metadata } from "next";
import { Suspense } from "react";
import { Banknote, Landmark, PiggyBank, TrendingUp } from "lucide-react";
import { ComboChart, CumulativeChart, DonutChart, RankingChart, WaterfallChart } from "@/components/charts/bi-charts";
import { ChartCard, DashboardErrors, DashboardSkeleton, EmptyDashboard, Kpi } from "@/components/dashboards/blocks";
import { YearPicker } from "@/components/dashboards/dashboard-nav";
import { ExportButton } from "@/components/dashboards/export-button";
import { cubeLoad, cubeLoadAll, num, type CubeRow } from "@/lib/cube-client";
import { pickYear, requireDashboardTenant } from "@/lib/dashboards";
import { eurCompact, MONTHS_SHORT, pct, yoy } from "@/lib/format";

export const metadata: Metadata = { title: "Αποτελέσματα χρήσης" };

const M = (m: string) => `pnl.${m}`;

export default async function PnlDashboard({ params, searchParams }: PageProps<"/dashboards/[tenantId]/pnl">) {
  const { tenantId } = await params;
  await requireDashboardTenant(tenantId, "pnl");

  let years: number[] = [];
  try {
    const rows = await cubeLoad(tenantId, { dimensions: [M("fiscal_year")], measures: [M("lines")], order: { [M("fiscal_year")]: "desc" } });
    years = rows.map((r) => num(r[M("fiscal_year")])).filter(Boolean);
  } catch (err) {
    return <DashboardErrors errors={[(err as Error).message]} />;
  }
  if (!years.length) {
    return (
      <EmptyDashboard title="Δεν υπάρχουν ακόμα αποτελέσματα χρήσης">
        Ορίστε τη δομή αποτελεσμάτων του πελάτη (Διαχείριση → Πελάτης → Αποτελέσματα χρήσης) και ολοκληρώστε την άντληση
        δεδομένων.
      </EmptyDashboard>
    );
  }
  const year = pickYear((await searchParams).year, years);

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Αποτελέσματα χρήσης {year}</h1>
          <p className="text-xs text-muted-foreground">Από τη Γενική Λογιστική ή τα παραστατικά, με βάση τη δομή αποτελεσμάτων του πελάτη.</p>
        </div>
        <YearPicker years={years} year={year} />
      </div>
      <Suspense key={year} fallback={<DashboardSkeleton />}>
        <PnlBody tenantId={tenantId} year={year} hasPrevious={years.includes(year - 1)} />
      </Suspense>
    </>
  );
}

async function PnlBody({ tenantId, year, hasPrevious }: { tenantId: string; year: number; hasPrevious: boolean }) {
  const yearFilter = (ys: number[]) => ({ member: M("fiscal_year"), operator: "equals", values: ys.map(String) });
  const { data, errors } = await cubeLoadAll(tenantId, {
    monthly: {
      measures: ["revenue", "cogs", "gross_profit", "opex", "ebitda", "net_profit", "expenses"].map(M),
      dimensions: [M("fiscal_year"), M("period")],
      filters: [yearFilter([year, year - 1])],
    },
    lines: {
      measures: [M("amount")],
      dimensions: [M("line_name"), M("section"), M("section_sort"), M("sort_order")],
      filters: [yearFilter([year])],
    },
    accounts: {
      measures: [M("expenses")],
      dimensions: [M("account_name")],
      filters: [yearFilter([year]), { member: M("source"), operator: "equals", values: ["GL"] }, { member: M("expenses"), operator: "gt", values: ["0"] }],
      order: { [M("expenses")]: "desc" },
      limit: 10,
    },
  });

  // Monthly grid for this year and last year.
  const grid = (y: number) => {
    const out = Array.from({ length: 12 }, () => ({} as Record<string, number>));
    for (const r of data.monthly) {
      if (num(r[M("fiscal_year")]) !== y) continue;
      const p = num(r[M("period")]);
      if (p < 1 || p > 12) continue;
      for (const k of ["revenue", "cogs", "gross_profit", "opex", "ebitda", "net_profit", "expenses"]) out[p - 1][k] = num(r[M(k)]);
    }
    return out;
  };
  const cur = grid(year);
  const prev = grid(year - 1);
  const lastPeriod = cur.reduce((last, m, i) => (Object.keys(m).length ? i + 1 : last), 0) || 12;
  const sum = (g: Record<string, number>[], k: string, upTo = 12) => g.slice(0, upTo).reduce((a, m) => a + (m[k] ?? 0), 0);

  const kpi = (k: string) => ({ now: sum(cur, k), before: hasPrevious ? sum(prev, k, lastPeriod) : 0 });
  const revenue = kpi("revenue");
  const gross = kpi("gross_profit");
  const ebitda = kpi("ebitda");
  const net = kpi("net_profit");
  const ytdHint = hasPrevious ? `vs ${MONTHS_SHORT[0]}–${MONTHS_SHORT[lastPeriod - 1]} ${year - 1}` : undefined;
  const margin = (v: number) => (revenue.now ? pct((100 * v) / revenue.now) : "—");

  const monthly = MONTHS_SHORT.map((m, i) => ({
    month: m,
    revenue: cur[i].revenue ?? 0,
    expenses: cur[i].expenses ?? 0,
    ebitda: cur[i].ebitda ?? 0,
  }));
  const runningTotal = (g: Record<string, number>[]) => g.map((_, i) => sum(g, "net_profit", i + 1));
  const curRun = runningTotal(cur);
  const prevRun = runningTotal(prev);
  const cumulative = MONTHS_SHORT.map((m, i) => ({
    month: m,
    current: i < lastPeriod ? curRun[i] : null,
    previous: hasPrevious ? prevRun[i] : null,
  }));
  const marginTrend = MONTHS_SHORT.map((m, i) => ({
    month: m,
    current: i < lastPeriod && cur[i].revenue ? (100 * (cur[i].gross_profit ?? 0)) / cur[i].revenue : 0,
    previous: hasPrevious && prev[i].revenue ? (100 * (prev[i].gross_profit ?? 0)) / prev[i].revenue : 0,
  }));

  // Expense mix by P&L line (top 6 + rest).
  const expenseLines = data.lines
    .map((r) => ({ name: String(r[M("line_name")]), value: -num(r[M("amount")]), section: String(r[M("section")]) }))
    .filter((r) => r.value > 0 && r.section !== "REVENUE")
    .sort((x, y) => y.value - x.value);
  const mix = expenseLines.slice(0, 6);
  const rest = expenseLines.slice(6).reduce((s, r) => s + r.value, 0);
  if (rest > 0) mix.push({ name: "Λοιπά", value: rest, section: "" });

  // Revenue → net profit bridge by section.
  const bySection = (s: string) => data.lines.filter((r) => r[M("section")] === s).reduce((t, r) => t + num(r[M("amount")]), 0);
  const steps = [
    { name: "Κύκλος εργασιών", value: bySection("REVENUE"), total: true },
    { name: "Κόστος / αγορές", value: bySection("COGS") },
    { name: "Μικτό κέρδος", value: bySection("REVENUE") + bySection("COGS"), total: true },
    { name: "Λοιπά έσοδα", value: bySection("OTHER_INCOME") },
    { name: "Λειτουργικά έξοδα", value: bySection("OPEX") },
    { name: "EBITDA", value: ["REVENUE", "COGS", "OTHER_INCOME", "OPEX"].reduce((t, s) => t + bySection(s), 0), total: true },
    { name: "Αποσβέσεις", value: bySection("DEPRECIATION") },
    { name: "Χρηματοοικονομικά", value: bySection("FINANCIAL") },
    { name: "Έκτακτα", value: bySection("EXTRAORDINARY") + bySection("TAX") },
    { name: "Αποτέλεσμα", value: data.lines.reduce((t, r) => t + num(r[M("amount")]), 0), total: true },
  ].filter((s) => s.total || s.value !== 0);

  const accounts = data.accounts.map((r: CubeRow) => ({ name: String(r[M("account_name")] ?? "—"), value: num(r[M("expenses")]) }));

  return (
    <div className="space-y-5">
      <DashboardErrors errors={errors} />
      <div className="flex justify-end">
        <ExportButton
          tenantId={tenantId}
          title={`Αποτελέσματα χρήσης ${year}`}
          sheets={[
            {
              name: "Ανά γραμμή και μήνα",
              columns: [
                { key: "pnl.section_sort", label: "Σειρά ενότητας", format: "int" },
                { key: "pnl.section", label: "Ενότητα" },
                { key: "pnl.sort_order", label: "Σειρά γραμμής", format: "int" },
                { key: "pnl.line_name", label: "Γραμμή" },
                { key: "pnl.period", label: "Μήνας", format: "int" },
                { key: "pnl.amount", label: "Ποσό", format: "eur" },
              ],
              query: {
                measures: ["pnl.amount"],
                dimensions: ["pnl.section_sort", "pnl.section", "pnl.sort_order", "pnl.line_name", "pnl.period"],
                filters: [{ member: "pnl.fiscal_year", operator: "equals", values: [String(year)] }],
                order: [["pnl.section_sort", "asc"], ["pnl.sort_order", "asc"], ["pnl.period", "asc"]],
              },
            },
            {
              name: "Ανά λογαριασμό",
              columns: [
                { key: "pnl.line_name", label: "Γραμμή" },
                { key: "pnl.account_code", label: "Λογαριασμός" },
                { key: "pnl.account_name", label: "Περιγραφή" },
                { key: "pnl.amount", label: "Ποσό", format: "eur" },
              ],
              query: {
                measures: ["pnl.amount"],
                dimensions: ["pnl.line_name", "pnl.account_code", "pnl.account_name"],
                filters: [{ member: "pnl.fiscal_year", operator: "equals", values: [String(year)] }],
                order: { "pnl.account_code": "asc" },
              },
            },
          ]}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Κύκλος εργασιών" value={eurCompact(revenue.now)} change={yoy(revenue.now, revenue.before)} hint={ytdHint} icon={Banknote} tone="blue" spark={cur.slice(0, lastPeriod).map((m) => m.revenue ?? 0)} />
        <Kpi label="Μικτό κέρδος" value={eurCompact(gross.now)} change={yoy(gross.now, gross.before)} hint={`περιθώριο ${margin(gross.now)}`} icon={TrendingUp} tone="green" spark={cur.slice(0, lastPeriod).map((m) => m.gross_profit ?? 0)} />
        <Kpi label="EBITDA" value={eurCompact(ebitda.now)} change={yoy(ebitda.now, ebitda.before)} hint={`περιθώριο ${margin(ebitda.now)}`} icon={Landmark} tone="violet" spark={cur.slice(0, lastPeriod).map((m) => m.ebitda ?? 0)} />
        <Kpi label="Καθαρό αποτέλεσμα" value={eurCompact(net.now)} change={yoy(net.now, net.before)} hint={`περιθώριο ${margin(net.now)}`} icon={PiggyBank} tone={net.now >= 0 ? "teal" : "red"} spark={cumulative.slice(0, lastPeriod).map((m) => m.current ?? 0)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <ChartCard title="Έσοδα, έξοδα & EBITDA ανά μήνα" description={`Χρήση ${year}`} className="lg:col-span-3">
          <ComboChart
            data={monthly}
            xKey="month"
            zeroLine
            series={[
              { key: "revenue", label: "Έσοδα", color: "var(--chart-1)" },
              { key: "expenses", label: "Κόστη & έξοδα", color: "var(--chart-2)" },
              { key: "ebitda", label: "EBITDA", color: "var(--chart-3)", type: "line" },
            ]}
          />
        </ChartCard>
        <ChartCard title="Σωρευτικό αποτέλεσμα" description={hasPrevious ? `${year} έναντι ${year - 1}` : `${year}`} className="lg:col-span-2">
          <CumulativeChart
            data={cumulative}
            xKey="month"
            series={[
              { key: "current", label: String(year), color: "var(--chart-1)" },
              ...(hasPrevious ? [{ key: "previous", label: String(year - 1), color: "var(--chart-5)", dashed: true }] : []),
            ]}
          />
        </ChartCard>
      </div>

      <ChartCard title="Από τον τζίρο στο αποτέλεσμα" description="Γέφυρα αποτελεσμάτων ανά ενότητα — πράσινο αυξάνει, κόκκινο μειώνει το αποτέλεσμα.">
        <WaterfallChart steps={steps} />
      </ChartCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Κατανομή εξόδων" description={`Ανά γραμμή αποτελεσμάτων, ${year}`}>
          <DonutChart data={mix} centerLabel="έξοδα" />
        </ChartCard>
        <ChartCard title="Μικτό περιθώριο ανά μήνα" description={hasPrevious ? `% επί των εσόδων, ${year} έναντι ${year - 1}` : "% επί των εσόδων"}>
          <ComboChart
            data={marginTrend}
            xKey="month"
            format="pct"
            className="h-64"
            series={[
              { key: "current", label: String(year), color: "var(--chart-3)", type: "line" },
              ...(hasPrevious ? [{ key: "previous", label: String(year - 1), color: "var(--chart-5)", type: "line" as const, dashed: true }] : []),
            ]}
          />
        </ChartCard>
      </div>

      {accounts.length > 0 && (
        <ChartCard title="Μεγαλύτεροι λογαριασμοί εξόδων" description={`Top 10 λογαριασμοί Γενικής Λογιστικής, ${year}`}>
          <RankingChart data={accounts} label="Έξοδα" color="var(--chart-2)" />
        </ChartCard>
      )}
    </div>
  );
}
