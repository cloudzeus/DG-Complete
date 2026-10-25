import type { Metadata } from "next";
import { Crosshair, Flag, Scale, TrendingUp } from "lucide-react";
import { ComboChart, DonutChart } from "@/components/charts/bi-charts";
import { ChartCard, DashboardErrors, Kpi } from "@/components/dashboards/blocks";
import { BudgetEditor } from "@/components/finance/budget-editor";
import { CashScenarios } from "@/components/finance/cash-scenarios";
import { PlanningSettingsForm } from "@/components/finance/planning-settings";
import { requireDashboardTenant } from "@/lib/dashboards";
import { eurCompact, MONTHS_SHORT } from "@/lib/format";
import { DEFAULT_ASSUMPTIONS } from "@/lib/assumptions";
import { planning, type Planning } from "@/lib/planning";
import { can } from "@/lib/rbac";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Πρόβλεψη & στόχοι" };

const eur = (v: number) => `${Math.round(v).toLocaleString("el-GR")} €`;
const pct = (a: number, b: number) => (b ? `${a >= b ? "+" : ""}${Math.round(((a - b) / Math.abs(b)) * 100)}%` : "—");

export default async function PlanningPage({ params }: PageProps<"/dashboards/[tenantId]/planning">) {
  const { tenantId } = await params;
  const { user, access } = await requireDashboardTenant(tenantId, "planning");
  let p: Planning | null = null;
  let error: string | null = null;
  try {
    p = await planning(tenantId);
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Πρόβλεψη & στόχοι</h1>
        <p className="text-xs text-muted-foreground">Πού θα κλείσει η χρονιά, πόσο απέχετε από το σημείο νεκρού, πώς αντέχει το ταμείο σε δυσμενή σενάρια — και οι στόχοι σας.</p>
      </div>
      {error && <DashboardErrors errors={[error]} />}
      {p && <Body p={p} tenantId={tenantId} budget={access.services.has("budget")} edit={can(user, "tenant.dashboards.edit", tenantId)} />}
    </>
  );
}

function Body({ p, tenantId, budget, edit }: { p: Planning; tenantId: string; budget: boolean; edit: boolean }) {
  const t = p.totals;
  const be = p.breakEven;
  const hasBudget = budget && t.budget !== null;
  const curMonth = new Date().getMonth() + 1;
  const remaining = 12 - curMonth + 1;
  const neededPerMonth = hasBudget ? (t.budget! - t.actual) / Math.max(1, remaining) : null;
  const forecastPerMonth = (t.forecastYear - t.actual) / Math.max(1, remaining);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={`Πρόβλεψη κλεισίματος ${p.year}`} value={eurCompact(t.forecastYear)} hint={`${eurCompact(t.low)} – ${eurCompact(t.high)} · ${pct(t.forecastYear, t.lastYear)} έναντι πέρσι`} icon={TrendingUp} tone="blue" />
        <Kpi label="Μικτό κέρδος χρονιάς (πρόβλεψη)" value={eurCompact(t.marginYear)} hint={`${pct(t.marginYear, t.lastYearMargin)} έναντι πέρσι`} icon={Flag} tone="green" />
        <Kpi
          label="Στόχος χρονιάς"
          value={hasBudget ? `${Math.round((100 * t.forecastYear) / t.budget!)}%` : "—"}
          hint={hasBudget ? `πρόβλεψη έναντι στόχου ${eurCompact(t.budget!)}` : budget ? "ορίστε στόχους παρακάτω" : "με το module «Budget & στόχοι»"}
          icon={Crosshair}
          tone="violet"
        />
        <Kpi
          label="Σημείο νεκρού (τζίρος)"
          value={be.breakEvenRevenue ? eurCompact(be.breakEvenRevenue) : "—"}
          hint={be.safetyPct !== null ? (be.safetyPct >= 0 ? `περιθώριο ασφαλείας ${Math.round(be.safetyPct)}%` : `λείπουν ${Math.round(-be.safetyPct)}% πωλήσεων`) : "ορίστε τα σταθερά έξοδα"}
          icon={Scale}
          tone={be.safetyPct !== null && be.safetyPct < 0 ? "red" : "amber"}
        />
      </div>

      <ChartCard
        title={`Πού θα κλείσει το ${p.year}`}
        description={`Μπάρες: πραγματικές πωλήσεις και πρόβλεψη για τους υπόλοιπους μήνες (περσινός μήνας × ρυθμός φέτος ${Math.round(p.pace.used * 100)}%) · γραμμές: πέρσι${hasBudget ? " και στόχος" : ""}`}
      >
        <ComboChart
          data={p.months.map((m) => ({
            month: MONTHS_SHORT[m.month - 1],
            actual: m.month < curMonth ? Math.round(m.revenue ?? 0) : 0,
            forecast: m.month >= curMonth ? Math.round(m.forecast ?? 0) : 0,
            lastYear: Math.round(m.lastYear),
            ...(hasBudget ? { budget: Math.round(m.budget ?? 0) } : {}),
          }))}
          xKey="month"
          series={[
            { key: "actual", label: "Πραγματικές", color: "var(--chart-1)", type: "bar", stack: "r" },
            { key: "forecast", label: "Πρόβλεψη", color: "var(--chart-4)", type: "bar", stack: "r" },
            { key: "lastYear", label: `${p.year - 1}`, color: "var(--muted-foreground)", type: "line", dashed: true },
            ...(hasBudget ? [{ key: "budget", label: "Στόχος", color: "var(--chart-2)", type: "line" as const }] : []),
          ]}
        />
        {hasBudget && neededPerMonth !== null && (
          <p className={cn("mt-2 rounded-md px-3 py-2 text-sm", neededPerMonth > forecastPerMonth ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900")}>
            Για τον στόχο χρειάζονται <b>{eur(neededPerMonth)}</b> τον μήνα για τους υπόλοιπους {remaining} μήνες — η πρόβλεψη δίνει {eur(forecastPerMonth)}
            {neededPerMonth > forecastPerMonth ? ` (λείπουν ${eur((neededPerMonth - forecastPerMonth) * remaining)})` : " — ο στόχος πιάνεται"}.
          </p>
        )}
      </ChartCard>

      <div className="grid gap-5 lg:grid-cols-5">
        <ChartCard title="Σημείο νεκρού" description={be.source === "gl" ? "Σταθερά έξοδα 12 μηνών από τη Γενική Λογιστική ÷ μικτό περιθώριο" : "Σταθερά έξοδα που δηλώσατε ÷ μικτό περιθώριο"} className="lg:col-span-3">
          {be.breakEvenRevenue ? (
            <div className="space-y-4">
              <BreakEvenBar revenue={be.revenue12m} breakEven={be.breakEvenRevenue} />
              <p className="text-sm">
                Με μικτό περιθώριο <b>{Math.round((be.marginRatio ?? 0) * 1000) / 10}%</b> και σταθερά έξοδα <b>{eur(be.fixedYear ?? 0)}</b> τον χρόνο, η εταιρεία καλύπτει τα έξοδά της
                όταν πουλά <b>{eur(be.breakEvenRevenue)}</b> τον χρόνο ({eur(be.breakEvenRevenue / 12)} τον μήνα).{" "}
                {be.safetyPct! >= 0
                  ? `Οι σημερινές πωλήσεις μπορούν να πέσουν ${Math.round(be.safetyPct!)}% πριν μπει σε ζημία.`
                  : `Οι πωλήσεις 12 μηνών είναι ${Math.round(-be.safetyPct!)}% κάτω από αυτό — χρειάζεται +${eur(be.breakEvenRevenue - be.revenue12m)} ή μείωση εξόδων.`}{" "}
                Κάθε +1 μονάδα περιθωρίου κατεβάζει το σημείο νεκρού κατά ~{eur(be.breakEvenRevenue - (be.fixedYear ?? 0) / ((be.marginRatio ?? 0) + 0.01))}.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Δεν υπάρχουν έξοδα από Γενική Λογιστική — δηλώστε τα μηνιαία σταθερά έξοδα παρακάτω.</p>
          )}
        </ChartCard>
        <ChartCard title="Τα σταθερά έξοδα" description="12 μήνες" className="lg:col-span-2">
          {be.fixedParts.length ? <DonutChart data={be.fixedParts.map((x) => ({ name: x.name, value: Math.round(x.value) }))} centerLabel="σταθερά έξοδα" /> : <p className="text-sm text-muted-foreground">—</p>}
        </ChartCard>
      </div>

      <ChartCard title="Σενάρια ταμείου — 13 εβδομάδες" description={`Ταμείο σήμερα ${eur(p.cash.balance)}. Μετακινήστε τους μοχλούς για να δείτε πώς αντέχει το ταμείο αν οι πελάτες καθυστερήσουν ή πέσουν οι πωλήσεις.`}>
        <CashScenarios balance={p.cash.balance} weeks={p.cash.weeks} minCash={p.cash.minCash} />
      </ChartCard>

      {budget ? (
        edit && (
          <ChartCard title={`Στόχοι ${p.year}`} description="Πωλήσεις και μικτό κέρδος ανά μήνα — η πρόταση ξεκινά από πέρσι με την αύξηση που ορίζετε">
            <BudgetEditor tenantId={tenantId} year={p.year} initial={p.months.map((m) => ({ month: m.month, revenue: m.budget, margin: m.budgetMargin }))} />
          </ChartCard>
        )
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          <b>Budget & στόχοι:</b> ορίστε στόχους πωλήσεων και κέρδους ανά μήνα και δείτε πραγματικά έναντι στόχου και τι χρειάζεται για να τον πιάσετε —
          διαθέσιμο ως πρόσθετο module του πακέτου σας.
        </p>
      )}

      {edit && (
        <ChartCard title="Παράμετροι" description="Για το σημείο νεκρού, το όριο ταμείου των σεναρίων και τις εκτιμήσεις των αναλύσεων">
          <PlanningSettingsForm
            tenantId={tenantId}
            values={p.settings}
            needFixed={be.source !== "gl"}
            defaults={{ perDocument: DEFAULT_ASSUMPTIONS.perDocument, financingRatePct: DEFAULT_ASSUMPTIONS.financingRate * 100, lostSharePct: DEFAULT_ASSUMPTIONS.lostShare * 100 }}
          />
        </ChartCard>
      )}
    </div>
  );
}

/** Sales of the last 12 months against the break-even point. */
function BreakEvenBar({ revenue, breakEven }: { revenue: number; breakEven: number }) {
  const max = Math.max(revenue, breakEven) * 1.15;
  const r = (100 * revenue) / max;
  const b = (100 * breakEven) / max;
  const ok = revenue >= breakEven;
  const edge = (v: number) => (v > 70 ? "-translate-x-full" : v > 30 ? "-translate-x-1/2" : "");
  return (
    <div className="space-y-1">
      <div className="relative h-5 text-2xs">
        <span className={cn("absolute whitespace-nowrap", edge(b))} style={{ left: `${b}%` }}>
          σημείο νεκρού <b className="tabular-nums">{eur(breakEven)}</b> ▼
        </span>
      </div>
      <div className="relative h-9 overflow-hidden rounded-lg bg-muted">
        <div className="absolute inset-y-0 left-0 bg-red-100 dark:bg-red-950/40" style={{ width: `${b}%` }} />
        <div className={cn("absolute inset-y-2 left-0 rounded-r", ok ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${r}%` }} />
        <div className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: `${b}%` }} />
      </div>
      <div className="relative h-5 text-2xs">
        <span className={cn("absolute whitespace-nowrap", edge(r))} style={{ left: `${r}%` }}>
          ▲ πωλήσεις 12μ <b className="tabular-nums">{eur(revenue)}</b>
        </span>
      </div>
    </div>
  );
}
