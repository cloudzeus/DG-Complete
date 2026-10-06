import type { Metadata } from "next";
import { ArrowDownToLine, ArrowUpFromLine, Landmark, Waves } from "lucide-react";
import { ComboChart, CumulativeChart } from "@/components/charts/bi-charts";
import { ChartCard, DashboardErrors, Kpi } from "@/components/dashboards/blocks";
import { CubeTable, type ListColumn } from "@/components/dashboards/cube-table";
import { ListTabs } from "@/components/dashboards/list-tabs";
import { cubeLoadAll, num, type CubeQuery } from "@/lib/cube-client";
import { requireDashboardTenant } from "@/lib/dashboards";
import { eurCompact } from "@/lib/format";

export const metadata: Metadata = { title: "Ταμειακά" };

const O = (m: string) => `open_items.${m}`;

const TABS = {
  receivables: "Ανοιχτά πελατών",
  payables: "Ανοιχτά προμηθευτών",
} as const;
type Tab = keyof typeof TABS;

const COLUMNS: ListColumn[] = [
  { key: O("partner_name"), label: "Συναλλασσόμενος", grow: true },
  { key: O("doc_date"), label: "Ημ/νία παραστατικού (μήνας)", format: "date", size: 150 },
  { key: O("age_days"), label: "Ηλικία (ημ.)", format: "int", size: 100, warnAbove: 90 },
  { key: O("expected_date"), label: "Αναμενόμενη πληρωμή", format: "date", size: 140 },
  { key: O("amount"), label: "Ανοιχτό ποσό", format: "eur" },
];

const query = (kind: "R" | "P"): CubeQuery => ({
  measures: [O("amount")],
  dimensions: [O("partner_name"), O("doc_date"), O("age_days"), O("expected_date")],
  filters: [
    { member: O("kind"), operator: "equals", values: [kind] },
    { member: O("amount"), operator: "gt", values: ["0"] },
  ],
  order: { [O("amount")]: "desc" },
  limit: 20000,
});

export default async function CashPage({ params, searchParams }: PageProps<"/dashboards/[tenantId]/cash">) {
  const { tenantId } = await params;
  await requireDashboardTenant(tenantId);
  const sp = await searchParams;
  const tab: Tab = typeof sp.tab === "string" && sp.tab in TABS ? (sp.tab as Tab) : "receivables";
  const listQuery = query(tab === "receivables" ? "R" : "P");

  const { data, errors } = await cubeLoadAll(tenantId, {
    forecast: {
      measures: ["cash_forecast.inflow", "cash_forecast.outflow", "cash_forecast.net"],
      dimensions: ["cash_forecast.week", "cash_forecast.week_start"],
      order: { "cash_forecast.week": "asc" },
    },
    monthly: { measures: ["cash.inflow", "cash.outflow", "cash.balance"], dimensions: ["cash.month"], order: { "cash.month": "asc" } },
    balances: { measures: [O("amount"), O("count")], dimensions: [O("kind")] },
    rows: listQuery,
  });

  const weeks = data.forecast.map((r) => ({
    week: Number(r["cash_forecast.week"]) === 0 ? "Τώρα" : new Date(String(r["cash_forecast.week_start"])).toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit" }),
    inflow: num(r["cash_forecast.inflow"]),
    outflow: -num(r["cash_forecast.outflow"]),
    net: num(r["cash_forecast.net"]),
  }));
  const cash = data.monthly.length ? num(data.monthly[data.monthly.length - 1]["cash.balance"]) : 0;
  const running = weeks.reduce<number[]>((acc, w, i) => [...acc, (i ? acc[i - 1] : cash) + w.net], []);
  const projection = weeks.map((w, i) => ({ week: w.week, balance: running[i] }));
  const net4 = weeks.slice(0, 4).reduce((t, w) => t + w.net, 0);
  const minPoint = projection.reduce((m, p) => (p.balance < m.balance ? p : m), projection[0] ?? { week: "", balance: cash });
  const months = data.monthly.slice(-24).map((r) => ({
    month: new Date(String(r["cash.month"])).toLocaleDateString("el-GR", { month: "short", year: "2-digit" }),
    inflow: num(r["cash.inflow"]),
    outflow: -num(r["cash.outflow"]),
    balance: num(r["cash.balance"]),
  }));
  const bal = (k: "R" | "P") => num(data.balances.find((r) => r[O("kind")] === k)?.[O("amount")]);

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Ταμειακά</h1>
        <p className="text-xs text-muted-foreground">
          Ταμείο & τράπεζες από τη Γενική Λογιστική και πρόβλεψη 13 εβδομάδων από τα ανοιχτά πελατών και προμηθευτών, με τον ρυθμό πληρωμής
          του καθενός.
        </p>
      </div>
      <DashboardErrors errors={errors} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Ταμείο & τράπεζες" value={eurCompact(cash)} hint="τελευταίο υπόλοιπο" icon={Landmark} tone="blue" spark={months.map((m) => m.balance)} />
        <Kpi label="Ροή επόμενων 4 εβδομάδων" value={`${net4 >= 0 ? "+" : ""}${eurCompact(net4)}`} hint={`χαμηλότερο σημείο ${eurCompact(minPoint?.balance ?? cash)}`} icon={Waves} tone={net4 >= 0 ? "green" : "red"} />
        <Kpi label="Απαιτήσεις από πελάτες" value={eurCompact(bal("R"))} hint="ανοιχτά προς είσπραξη" icon={ArrowDownToLine} tone="teal" />
        <Kpi label="Υποχρεώσεις σε προμηθευτές" value={eurCompact(bal("P"))} hint="ανοιχτά προς πληρωμή" icon={ArrowUpFromLine} tone="amber" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Πρόβλεψη εισπράξεων & πληρωμών" description="Ανά εβδομάδα — «Τώρα» περιλαμβάνει και τα ήδη εκπρόθεσμα">
          <ComboChart
            data={weeks}
            xKey="week"
            zeroLine
            series={[
              { key: "inflow", label: "Εισπράξεις", color: "var(--chart-3)", stack: "f" },
              { key: "outflow", label: "Πληρωμές", color: "var(--chart-2)", stack: "f" },
              { key: "net", label: "Καθαρή ροή", color: "var(--chart-1)", type: "line" },
            ]}
          />
        </ChartCard>
        <ChartCard title="Προβλεπόμενο υπόλοιπο ταμείου" description="Τρέχον υπόλοιπο + αναμενόμενη καθαρή ροή ανά εβδομάδα">
          <CumulativeChart data={projection} xKey="week" className="h-72" series={[{ key: "balance", label: "Υπόλοιπο", color: "var(--chart-1)" }]} />
        </ChartCard>
      </div>

      {months.length > 0 && (
        <ChartCard title="Κίνηση ταμείου & τραπεζών" description="Εισροές, εκροές και υπόλοιπο ανά μήνα (τελευταίοι 24 μήνες)">
          <ComboChart
            data={months}
            xKey="month"
            zeroLine
            series={[
              { key: "inflow", label: "Εισροές", color: "var(--chart-3)" },
              { key: "outflow", label: "Εκροές", color: "var(--chart-2)" },
              { key: "balance", label: "Υπόλοιπο", color: "var(--chart-1)", type: "line" },
            ]}
          />
        </ChartCard>
      )}

      <ListTabs tabs={Object.entries(TABS).map(([key, label]) => ({ key, label }))} active={tab} basePath={`/dashboards/${tenantId}/cash`} query={{}} />
      <p className="text-xs text-muted-foreground">
        Ανοιχτά ποσά ανά συναλλασσόμενο και μήνα παραστατικού (οι πληρωμές αντιστοιχίζονται στα παλαιότερα ανοιχτά). Η αναμενόμενη πληρωμή
        βγαίνει από τον μέσο χρόνο πληρωμής του καθενός.
      </p>
      <CubeTable
        key={tab}
        tenantId={tenantId}
        rows={data.rows}
        columns={COLUMNS}
        storageKey={`cash-${tab}`}
        title={TABS[tab]}
        query={listQuery as Record<string, unknown>}
        searchPlaceholder="Αναζήτηση συναλλασσόμενου…"
        initialSort={{ id: O("amount"), desc: true }}
      />
    </>
  );
}
