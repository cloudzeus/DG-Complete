import type { Metadata } from "next";
import { Banknote, CircleSlash, PackageX, ShieldCheck } from "lucide-react";
import { ComboChart, DonutChart, RankingChart } from "@/components/charts/bi-charts";
import { ScoreRadar } from "@/components/charts/insight-charts";
import { ChartCard, DashboardErrors, Kpi } from "@/components/dashboards/blocks";
import { ACTION, DeadTable, LostTable, ScoreTable } from "@/components/stock/health-tables";
import { requireDashboardTenant } from "@/lib/dashboards";
import { eurCompact } from "@/lib/format";
import { stockHealth, type StockHealth } from "@/lib/stock-health";

export const metadata: Metadata = { title: "Απόθεμα & προμηθευτές 360°" };

export default async function StockHealthPage({ params }: PageProps<"/dashboards/[tenantId]/stock-health">) {
  const { tenantId } = await params;
  await requireDashboardTenant(tenantId, "stock-health");
  let h: StockHealth | null = null;
  let error: string | null = null;
  try {
    h = await stockHealth(tenantId);
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Απόθεμα & προμηθευτές 360°</h1>
        <p className="text-xs text-muted-foreground">Πωλήσεις που χάνονται από ελλείψεις, τι να γίνει το νεκρό απόθεμα και πόσο καλός είναι κάθε προμηθευτής — σε έναν βαθμό.</p>
      </div>
      {error && <DashboardErrors errors={[error]} />}
      {h && <Body h={h} />}
    </>
  );
}

function Body({ h }: { h: StockHealth }) {
  const l = h.lost;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Επίπεδο εξυπηρέτησης" value={l.reliable && l.serviceLevel !== null ? `${Math.round(l.serviceLevel)}%` : "—"} hint={`ημέρες με απόθεμα στα είδη αποθήκης Α/Β, 180 ημ.${l.coveragePct < 50 ? ` · απόθεμα κρατάτε στο ${l.coveragePct}% των ειδών που πουλάτε` : ""}`} icon={ShieldCheck} tone="green" />
        <Kpi label="Χαμένες πωλήσεις (εκτίμηση)" value={l.reliable ? eurCompact(l.revenue) : "—"} hint={l.reliable ? `κέρδος ${eurCompact(l.margin)} · 180 ημέρες` : "ελλιπή δεδομένα αποθήκης"} icon={CircleSlash} tone="red" />
        <Kpi label="Νεκρό απόθεμα" value={eurCompact(h.dead.value)} hint={`${h.dead.byAction.reduce((a, x) => a + x.items, 0)} είδη (κόστος)`} icon={PackageX} tone="amber" />
        <Kpi label="Μετρητά από ρευστοποίηση" value={eurCompact(h.dead.freed)} hint="με το προτεινόμενο σχέδιο (εκτίμηση)" icon={Banknote} tone="teal" />
      </div>

      {l.reliable ? (
        <>
          <div className="grid gap-5 xl:grid-cols-5">
            <ChartCard title="Είδη χωρίς απόθεμα ανά εβδομάδα" description="Μέσος αριθμός ειδών Α/Β που ήταν εξαντλημένα κάθε ημέρα της εβδομάδας" className="xl:col-span-3">
              <ComboChart
                data={l.weekly.map((w) => ({ week: w.week, out: w.out }))}
                xKey="week"
                format="count"
                series={[{ key: "out", label: "Είδη χωρίς απόθεμα", color: "var(--chart-2)", type: "area" }]}
              />
            </ChartCard>
            <ChartCard title="Χαμένες πωλήσεις ανά προμηθευτή" description="Ποιανού τα είδη λείπουν συχνότερα" className="xl:col-span-2">
              <RankingChart data={l.bySupplier.map((x) => ({ name: x.name, value: Math.round(x.value) }))} label="Χαμένες πωλήσεις" color="var(--chart-2)" />
            </ChartCard>
          </div>
          <ChartCard
            title="Είδη με τις μεγαλύτερες χαμένες πωλήσεις"
            description={`Ημέρες χωρίς απόθεμα (και χωρίς πώληση) × ο χαμηλότερος ρυθμός πωλήσεων (με απόθεμα ή 12μήνου) × ${Math.round(l.lostShare * 100)}% (οι υπόλοιποι πελάτες περιμένουν ή παίρνουν άλλο είδος), μόνο για είδη που κρατάτε σε απόθεμα. Εξαιρούνται ${l.toOrder} είδη που πωλούνται κατά παραγγελία και ${l.incomplete} με ελλιπή κίνηση αποθήκης.`}
          >
            <LostTable rows={l.items} />
          </ChartCard>
        </>
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Οι χαμένες πωλήσεις δεν υπολογίζονται: απόθεμα υπάρχει μόνο για το {l.coveragePct}% των ειδών που πουλιούνται — μάλλον αντλούνται μόνο κάποιες αποθήκες. Ελέγξτε τις
          αποθήκες στις ρυθμίσεις άντλησης.
        </p>
      )}

      <div className="grid gap-5 xl:grid-cols-5">
        <ChartCard title="Σχέδιο για το νεκρό απόθεμα" description="Αξία ανά προτεινόμενη ενέργεια" className="xl:col-span-2">
          <DonutChart data={h.dead.byAction.filter((a) => a.value > 0).map((a) => ({ name: ACTION[a.action].label, value: Math.round(a.value) }))} className="sm:grid-cols-1" centerLabel="νεκρό απόθεμα" />
          <ul className="mt-3 space-y-1 text-xs">
            {h.dead.byAction.map((a) => (
              <li key={a.action} className="flex justify-between gap-2">
                <span>
                  {ACTION[a.action].label} · {a.items} είδη
                </span>
                <span className="tabular-nums">
                  → <b>{eurCompact(a.freed)}</b>
                </span>
              </li>
            ))}
          </ul>
        </ChartCard>
        <ChartCard title="Τα μεγαλύτερα ακίνητα είδη" description="Με την προτεινόμενη ενέργεια και τα μετρητά που εκτιμάται ότι επιστρέφουν" className="xl:col-span-3">
          <DeadTable rows={h.dead.items.slice(0, 15)} />
        </ChartCard>
      </div>

      {h.suppliers.length > 0 && (
        <>
          <ChartCard title="Σύγκριση προμηθευτών" description="Οι 5 μεγαλύτεροι σε 6 διαστάσεις (0–100, ψηλότερα = καλύτερα)">
            <ScoreRadar
              axes={[
                { key: "delivery", label: "Ταχύτητα παράδοσης" },
                { key: "reliability", label: "Αξιοπιστία παράδοσης" },
                { key: "price", label: "Σταθερότητα τιμών" },
                { key: "payback", label: "Απόσβεση αγορών" },
                { key: "idle", label: "Κίνηση αποθέματος" },
                { key: "roi", label: "ROI αποθέματος" },
              ]}
              series={h.suppliers.slice(0, 5).map((x) => ({ name: x.name.length > 28 ? `${x.name.slice(0, 27)}…` : x.name, values: x.dims }))}
            />
          </ChartCard>
          <ChartCard title="Βαθμός προμηθευτή 360°" description="Ταχύτητα 20% · αξιοπιστία 15% · τιμές 20% · απόσβεση 20% · κίνηση αποθέματος 15% · ROI 10%">
            <ScoreTable rows={h.suppliers} />
          </ChartCard>
        </>
      )}
    </div>
  );
}
