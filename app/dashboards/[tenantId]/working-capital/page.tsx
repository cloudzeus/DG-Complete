import type { Metadata } from "next";
import { CalendarClock, Clock, HandCoins, Package, Repeat, Wallet } from "lucide-react";
import { ComboChart, DonutChart, RankingChart, WaterfallChart } from "@/components/charts/bi-charts";
import { ChartCard, DashboardErrors, Kpi } from "@/components/dashboards/blocks";
import { CashLevers } from "@/components/finance/cash-levers";
import { Findings } from "@/components/purchases/purchase-analysis";
import { requireDashboardTenant } from "@/lib/dashboards";
import { eurCompact, MONTHS_SHORT } from "@/lib/format";
import { workingCapital, type WorkingCapital } from "@/lib/working-capital";

export const metadata: Metadata = { title: "Κεφάλαιο κίνησης" };

const days = (v: number | null) => (v === null ? "—" : `${Math.round(v).toLocaleString("el-GR")} ημ.`);
const diff = (a: number | null, b: number | null | undefined) => (a !== null && b !== null && b !== undefined ? a - b : null);
const monthLabel = (ym: string) => `${MONTHS_SHORT[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;

export default async function WorkingCapitalPage({ params }: PageProps<"/dashboards/[tenantId]/working-capital">) {
  const { tenantId } = await params;
  await requireDashboardTenant(tenantId, "working-capital");
  let w: WorkingCapital | null = null;
  let error: string | null = null;
  try {
    w = await workingCapital(tenantId);
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Κεφάλαιο κίνησης & κύκλος μετρητών</h1>
        <p className="text-xs text-muted-foreground">
          Πόσες ημέρες «κλειδώνονται» τα μετρητά από την αγορά του εμπορεύματος ως την είσπραξη από τον πελάτη, και πόσα χρήματα είναι δεμένα σε
          απόθεμα και πελάτες. Υπόλοιπα από τις καρτέλες πελατών/προμηθευτών· απόθεμα σε κόστος.
        </p>
      </div>
      {error && <DashboardErrors errors={[error]} />}
      {w && <Body w={w} />}
    </>
  );
}

function Body({ w }: { w: WorkingCapital }) {
  const n = w.now;
  const y = w.yearAgo;
  const hint = (v: number | null) => (v === null ? undefined : `${v > 0 ? "+" : ""}${Math.round(v)} ημ. έναντι πέρσι`);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Κύκλος μετατροπής μετρητών" value={days(n.ccc)} hint={hint(diff(n.ccc, y?.ccc))} icon={Repeat} tone="violet" spark={w.months.map((m) => m.ccc ?? 0)} />
        <Kpi label="Ημέρες αποθέματος" value={days(n.dio)} hint={hint(diff(n.dio, y?.dio))} icon={Package} tone="amber" spark={w.months.map((m) => m.dio ?? 0)} />
        <Kpi label="Ημέρες είσπραξης" value={days(n.dso)} hint={hint(diff(n.dso, y?.dso))} icon={HandCoins} tone="blue" spark={w.months.map((m) => m.dso ?? 0)} />
        <Kpi label="Ημέρες πληρωμής προμηθευτών" value={days(n.dpo)} hint={hint(diff(n.dpo, y?.dpo))} icon={CalendarClock} tone="teal" spark={w.months.map((m) => m.dpo ?? 0)} />
        <Kpi
          label="Κεφάλαιο κίνησης"
          value={eurCompact(n.workingCapital)}
          hint={y ? `${n.workingCapital - y.workingCapital >= 0 ? "+" : "−"}${eurCompact(Math.abs(n.workingCapital - y.workingCapital))} σε 12 μήνες` : undefined}
          icon={Wallet}
          tone="green"
          spark={w.months.map((m) => m.workingCapital)}
        />
      </div>

      <Findings items={w.findings} />

      <div className="grid gap-5 xl:grid-cols-5">
        <ChartCard
          title="Ο κύκλος των μετρητών ανά μήνα"
          description="Ημέρες αποθέματος + ημέρες είσπραξης − ημέρες πληρωμής προμηθευτών = ημέρες που χρηματοδοτείτε εσείς (γραμμή)"
          className="xl:col-span-3"
        >
          <ComboChart
            data={w.months.map((m) => ({
              month: monthLabel(m.month),
              dio: Math.round(m.dio ?? 0),
              dso: Math.round(m.dso ?? 0),
              dpo: -Math.round(m.dpo ?? 0),
              ccc: Math.round(m.ccc ?? 0),
            }))}
            xKey="month"
            format="count"
            zeroLine
            series={[
              { key: "dio", label: "Απόθεμα (ημ.)", color: "var(--chart-5)", type: "bar", stack: "c" },
              { key: "dso", label: "Είσπραξη (ημ.)", color: "var(--chart-1)", type: "bar", stack: "c" },
              { key: "dpo", label: "Πληρωμή προμηθευτών (ημ.)", color: "var(--chart-3)", type: "bar", stack: "c" },
              { key: "ccc", label: "Κύκλος μετρητών", color: "var(--chart-2)", type: "line" },
            ]}
          />
        </ChartCard>
        <ChartCard title="Από τι αποτελείται το κεφάλαιο κίνησης" description="Σήμερα, σε €" className="xl:col-span-2">
          <WaterfallChart
            steps={[
              { name: "Απόθεμα", value: n.inventory },
              { name: "Απαιτήσεις", value: n.receivables },
              { name: "Υποχρεώσεις", value: -n.payables },
              { name: "Κεφάλαιο κίνησης", value: n.workingCapital, total: true },
            ]}
            className="min-w-0"
          />
        </ChartCard>
      </div>

      <ChartCard title="Πόσα μετρητά αποδεσμεύονται αν…" description="Μετακινήστε τους μοχλούς: κάθε ημέρα αξίζει όσο ο σημερινός ημερήσιος ρυθμός κόστους πωλήσεων, τιμολόγησης και αγορών">
        <CashLevers perDay={w.perDay} current={{ dio: n.dio, dso: n.dso, dpo: n.dpo }} />
      </ChartCard>

      <ChartCard title="Απόθεμα, απαιτήσεις και υποχρεώσεις — 13 μήνες" description="Το απόθεμα και οι πελάτες δεσμεύουν μετρητά, οι προμηθευτές τα χρηματοδοτούν">
        <ComboChart
          data={w.months.map((m) => ({ month: monthLabel(m.month), inventory: Math.round(m.inventory), receivables: Math.round(m.receivables), payables: Math.round(m.payables) }))}
          xKey="month"
          series={[
            { key: "inventory", label: "Απόθεμα", color: "var(--chart-5)", type: "area" },
            { key: "receivables", label: "Απαιτήσεις από πελάτες", color: "var(--chart-1)", type: "area" },
            { key: "payables", label: "Υποχρεώσεις σε προμηθευτές", color: "var(--chart-3)", type: "line" },
          ]}
        />
      </ChartCard>

      <div className="grid gap-5 lg:grid-cols-3">
        <ChartCard title="Πελάτες με το μεγαλύτερο υπόλοιπο" description="Σήμερα" className="lg:col-span-2">
          <RankingChart data={w.customers.map((c) => ({ name: c.name, value: Math.round(c.value) }))} label="Υπόλοιπο" color="var(--chart-1)" />
        </ChartCard>
        <ChartCard title="Ληξιπρόθεσμα πελατών" description="Ανοιχτά τιμολόγια άνω των 30 ημερών">
          <DonutChart
            data={[
              { name: "31–60 ημ.", value: Math.round(w.overdue.d31_60) },
              { name: "61–90 ημ.", value: Math.round(w.overdue.d61_90) },
              { name: "90+ ημ.", value: Math.round(w.overdue.d90plus) },
            ].filter((x) => x.value > 0)}
            className="sm:grid-cols-1"
            centerLabel="ληξιπρόθεσμα"
          />
        </ChartCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Πού είναι δεμένο το απόθεμα" description="Κατηγορίες με τη μεγαλύτερη αξία αποθέματος (κόστος)">
          <RankingChart data={w.categories.map((c) => ({ name: c.name, value: Math.round(c.value) }))} label="Απόθεμα" color="var(--chart-5)" />
        </ChartCard>
        <ChartCard title="Προμηθευτές που σας πιστώνουν" description="Μεγαλύτερα υπόλοιπα προς προμηθευτές">
          <RankingChart data={w.suppliers.map((c) => ({ name: c.name, value: Math.round(c.value) }))} label="Υπόλοιπο" color="var(--chart-3)" />
        </ChartCard>
      </div>
      {!w.hasLedger && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="size-3.5" /> Δεν αντλούνται ακόμα οι καρτέλες πελατών/προμηθευτών — οι ημέρες είσπραξης και πληρωμής θα εμφανιστούν μετά την άντληση.
        </p>
      )}
    </div>
  );
}
