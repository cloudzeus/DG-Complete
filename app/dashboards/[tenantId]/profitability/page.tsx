import type { Metadata } from "next";
import { BadgePercent, CircleAlert, Percent, TrendingUp } from "lucide-react";
import { ComboChart } from "@/components/charts/bi-charts";
import { ProfitBridge } from "@/components/charts/profit-bridge";
import { ChartCard, DashboardErrors, Kpi } from "@/components/dashboards/blocks";
import { DriverTable, LeakTable } from "@/components/finance/profit-tables";
import { Findings } from "@/components/purchases/purchase-analysis";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireDashboardTenant } from "@/lib/dashboards";
import { eurCompact } from "@/lib/format";
import { profitability, type Profitability } from "@/lib/profitability";

export const metadata: Metadata = { title: "Κερδοφορία" };

const d = (v: string) => new Date(v).toLocaleDateString("el-GR", { day: "numeric", month: "short" });

export default async function ProfitabilityPage({ params }: PageProps<"/dashboards/[tenantId]/profitability">) {
  const { tenantId } = await params;
  await requireDashboardTenant(tenantId, "profitability");
  let p: Profitability | null = null;
  let error: string | null = null;
  try {
    p = await profitability(tenantId);
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Κερδοφορία</h1>
        <p className="text-xs text-muted-foreground">
          Γιατί άλλαξε το μικτό κέρδος σε σχέση με πέρσι και πόσο δίνεται σε εκπτώσεις από την τιμή καταλόγου ή πουλιέται κάτω του κόστους.
          {p && ` Περίοδος ${d(p.period.from)} – σήμερα, έναντι της ίδιας περιόδου ${p.period.prevFrom.slice(0, 4)}.`}
        </p>
      </div>
      {error && <DashboardErrors errors={[error]} />}
      {p && <Body p={p} />}
    </>
  );
}

function Body({ p }: { p: Profitability }) {
  const change = p.marginPrev ? ((p.margin - p.marginPrev) / Math.abs(p.marginPrev)) * 100 : null;
  const pts = p.marginPct !== null && p.marginPctPrev !== null ? p.marginPct - p.marginPctPrev : null;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Μικτό κέρδος" value={eurCompact(p.margin)} change={change} hint={`πέρσι ${eurCompact(p.marginPrev)}`} icon={TrendingUp} tone="green" />
        <Kpi
          label="Περιθώριο"
          value={p.marginPct === null ? "—" : `${p.marginPct.toLocaleString("el-GR", { maximumFractionDigits: 1 })}%`}
          hint={pts === null ? undefined : `${pts > 0 ? "+" : ""}${pts.toLocaleString("el-GR", { maximumFractionDigits: 1 })} μον. έναντι πέρσι`}
          icon={Percent}
          tone="teal"
        />
        <Kpi
          label="Εκπτώσεις από τιμή καταλόγου"
          value={p.leak.available ? eurCompact(p.leak.leak) : "—"}
          hint={p.leak.available ? `${Math.round(p.leak.leakPct)}% της αξίας καταλόγου` : "δεν υπάρχει τιμή χονδρικής στα είδη"}
          icon={BadgePercent}
          tone="amber"
        />
        <Kpi label="Ζημία κάτω του κόστους" value={eurCompact(p.leak.belowCost)} hint={`${p.leak.belowCostLines.toLocaleString("el-GR")} γραμμές πώλησης`} icon={CircleAlert} tone="red" />
      </div>

      <Findings items={p.findings} />

      <ChartCard
        title="Από πού ήρθε η μεταβολή του κέρδους"
        description="Όγκος: περισσότερα/λιγότερα τεμάχια · Μίγμα: άλλα είδη με άλλο περιθώριο · Τιμές πώλησης και κόστος αγοράς στα ίδια είδη · Νέα είδη και είδη που δεν πουλήθηκαν φέτος · *Λοιπά: επιστροφές, πιστωτικά αξίας και λάθη κόστους στο SoftOne"
      >
        <ProfitBridge steps={p.steps} />
      </ChartCard>

      <div className="grid gap-5 xl:grid-cols-3">
        <ChartCard title="Αυξήσεις τιμών που βοήθησαν" description="Επίδραση στο κέρδος">
          <DriverTable rows={p.priceUp} empty="Καμία σημαντική αύξηση τιμής." />
        </ChartCard>
        <ChartCard title="Μειώσεις τιμών που κόστισαν" description="Επίδραση στο κέρδος">
          <DriverTable rows={p.priceDown} empty="Καμία σημαντική μείωση τιμής." />
        </ChartCard>
        <ChartCard title="Αυξήσεις κόστους που δεν μετακυλίστηκαν" description="Το κόστος αγοράς ανέβηκε περισσότερο από την τιμή πώλησης">
          <DriverTable rows={p.costNotPassed} empty="Οι αυξήσεις κόστους περάστηκαν στις τιμές." />
        </ChartCard>
      </div>

      {p.leak.available && (
        <>
          <ChartCard title="Τιμή καταλόγου έναντι τιμολόγησης ανά μάρκα" description="Μπάρες: αξία με τιμή καταλόγου και τιμολογημένη αξία · γραμμή: μέση έκπτωση %">
            <ComboChart
              data={p.leakByBrand.slice(0, 10).map((r) => ({ name: r.name.length > 14 ? `${r.name.slice(0, 13)}…` : r.name, list: Math.round(r.list), actual: Math.round(r.actual), pct: Math.round(r.leakPct) }))}
              xKey="name"
              series={[
                { key: "list", label: "Τιμή καταλόγου", color: "var(--chart-4)", type: "bar" },
                { key: "actual", label: "Τιμολογήθηκε", color: "var(--chart-1)", type: "bar" },
                { key: "pct", label: "Έκπτωση %", color: "var(--chart-2)", type: "line", rightAxis: "pct" },
              ]}
            />
          </ChartCard>
          <ChartCard title="Πού πάνε οι εκπτώσεις" description={`Από την τιμή χονδρικής καταλόγου · κάλυψη ${Math.round(p.leak.coveragePct)}% των πωλήσεων`}>
            <Tabs defaultValue="customers">
              <TabsList>
                <TabsTrigger value="customers">Πελάτες</TabsTrigger>
                <TabsTrigger value="categories">Κατηγορίες</TabsTrigger>
                <TabsTrigger value="brands">Μάρκες</TabsTrigger>
              </TabsList>
              <TabsContent value="customers">
                <LeakTable rows={p.leakByCustomer} label="Πελάτης" />
              </TabsContent>
              <TabsContent value="categories">
                <LeakTable rows={p.leakByCategory} label="Κατηγορία" />
              </TabsContent>
              <TabsContent value="brands">
                <LeakTable rows={p.leakByBrand} label="Μάρκα" />
              </TabsContent>
            </Tabs>
          </ChartCard>
        </>
      )}
    </div>
  );
}
