import type { Metadata } from "next";
import { Handshake, Percent, Truck, Wallet } from "lucide-react";
import { MultiLineChart } from "@/components/charts/bi-charts";
import { ChartCard, Kpi } from "@/components/dashboards/blocks";
import { loadSmart, SmartError, SmartHeader } from "@/components/smart/smart-page";
import { SmartTable } from "@/components/smart/smart-table";
import { requireDashboardTenant } from "@/lib/dashboards";
import { eurCompact } from "@/lib/format";
import { negotiation } from "@/lib/smart/negotiation";

export const metadata: Metadata = { title: "Διαπραγμάτευση προμηθευτών" };

export default async function NegotiationPage({ params }: PageProps<"/dashboards/[tenantId]/negotiation">) {
  const { tenantId } = await params;
  await requireDashboardTenant(tenantId, "negotiation");
  const { data: n, error } = await loadSmart(() => negotiation(tenantId));
  const top = n ? n.suppliers.slice(0, 6) : [];
  const months = n ? [...new Set(top.flatMap((s) => s.priceIndex.map((p) => p.month)))].sort() : [];

  return (
    <>
      <SmartHeader title="Διαπραγμάτευση προμηθευτών" icon={Handshake}>
        Για κάθε προμηθευτή: πώς κινούνται οι τιμές του στα ίδια είδη (δείκτης τιμών 24 μηνών και ετήσια τάση έναντι όλων των προμηθευτών σας), ποια είδη
        ακρίβυναν, πόσο αξιόπιστα παραδίδει, πόσο εξαρτάστε από αυτόν, σε πόσες ημέρες τον πληρώνετε και αν υπάρχουν εναλλακτικοί για τις ίδιες μάρκες. Πατήστε
        έναν προμηθευτή για φάκελο διαπραγμάτευσης από το AI.
      </SmartHeader>
      <SmartError error={error} />
      {n && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Αγορές 12 μηνών" value={eurCompact(n.spend12)} hint={`${n.suppliers.length} μεγαλύτεροι προμηθευτές`} icon={Wallet} tone="blue" />
            <Kpi label="Τάση τιμών (όλοι)" value={n.marketTrendPct === null ? "—" : `${n.marketTrendPct > 0 ? "+" : ""}${n.marketTrendPct}%`} hint="ανά έτος, ίδια είδη" icon={Percent} tone="amber" />
            <Kpi
              label="Ακριβαίνουν ταχύτερα"
              value={String(n.suppliers.filter((s) => s.priceTrendPct !== null && n.marketTrendPct !== null && s.priceTrendPct > n.marketTrendPct + 2).length)}
              hint="προμηθευτές πάνω από την τάση"
              icon={Percent}
              tone="red"
            />
            <Kpi label="Με ασταθείς παραδόσεις" value={String(n.suppliers.filter((s) => s.leadP90 && s.leadMedian && s.leadP90 > s.leadMedian * 2).length)} icon={Truck} tone="violet" />
          </div>
          {months.length > 2 && (
            <ChartCard title="Δείκτης τιμών των 6 μεγαλύτερων προμηθευτών" description="Ίδια είδη, μήνας προς μήνα (αρχή = 100)">
              <MultiLineChart
                data={months.map((m) => ({ x: m, ...Object.fromEntries(top.map((s, i) => [`s${i}`, s.priceIndex.find((p) => p.month === m)?.index ?? null])) }))}
                xKey="x"
                series={top.map((s, i) => ({ key: `s${i}`, label: s.name.slice(0, 28) }))}
                format="count"
              />
            </ChartCard>
          )}
          <SmartTable
            tenantId={tenantId}
            title="Διαπραγμάτευση προμηθευτών"
            idKey="trdr"
            rows={n.suppliers.map((s) => ({ ...s, details: [...s.levers, ...s.topRises.slice(0, 5).map((r) => `${r.name}: ${r.before} → ${r.now} € (+${r.changePct}%)`)] }))}
            detailKey="details"
            brief={{ kind: "negotiation", label: "Φάκελος διαπραγμάτευσης με AI" }}
            initialSort={{ key: "score", desc: true }}
            searchPlaceholder="Προμηθευτής…"
            columns={[
              { key: "code", label: "Κωδικός", excelOnly: true },
              { key: "name", label: "Προμηθευτής", wide: true },
              { key: "spend12", label: "Αγορές 12μ", format: "eur" },
              { key: "growthPct", label: "Μεταβολή", format: "pct", signed: true },
              { key: "sharePct", label: "Μερίδιο", format: "pct" },
              { key: "salesDependencyPct", label: "Εξάρτηση πωλήσεων", format: "pct" },
              { key: "priceTrendPct", label: "Τάση τιμών", format: "pct", signed: true },
              { key: "leadMedian", label: "Παράδοση (ημ.)", format: "int" },
              { key: "leadP90", label: "P90 παράδοσης", format: "int", excelOnly: true },
              { key: "payDays", label: "Πληρωμή (ημ.)", format: "int" },
              { key: "alternatives", label: "Εναλλακτικοί", format: "int" },
              { key: "score", label: "Περιθώριο διαπραγμάτευσης", format: "int" },
            ]}
          />
        </div>
      )}
    </>
  );
}
