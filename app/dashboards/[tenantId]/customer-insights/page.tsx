import type { Metadata } from "next";
import { ComboChart, RankingChart } from "@/components/charts/bi-charts";
import { Heatmap, QuadrantBubbles } from "@/components/charts/insight-charts";
import { CreditTable, PeerTable, PlTable, RuleCards } from "@/components/customers/insight-blocks";
import { ChartCard, DashboardErrors } from "@/components/dashboards/blocks";
import { Findings } from "@/components/purchases/purchase-analysis";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { customerInsights, type CustomerInsights } from "@/lib/customer-insights";
import { requireDashboardTenant } from "@/lib/dashboards";

export const metadata: Metadata = { title: "Ανάλυση πελατών" };

const qLabel = (q: string) => `${q.slice(5)} ${q.slice(2, 4)}`;

export default async function CustomerInsightsPage({ params }: PageProps<"/dashboards/[tenantId]/customer-insights">) {
  const { tenantId } = await params;
  await requireDashboardTenant(tenantId, "customer-insights");
  let c: CustomerInsights | null = null;
  let error: string | null = null;
  try {
    c = await customerInsights(tenantId);
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Ανάλυση πελατών</h1>
        <p className="text-xs text-muted-foreground">
          Πόσοι πελάτες μένουν, πόσο αξίζουν, ποιοι πραγματικά αφήνουν κέρδος, ποιοι γίνονται επικίνδυνοι και τι μπορούν να αγοράσουν ακόμα.
        </p>
      </div>
      {error && <DashboardErrors errors={[error]} />}
      {c && <Body c={c} />}
    </>
  );
}

function Body({ c }: { c: CustomerInsights }) {
  const SERVE = c.assumptions;
  return (
    <div className="space-y-5">
      <Findings items={c.findings} />

      <div className="grid gap-5 xl:grid-cols-5">
        <ChartCard title="Διατήρηση πελατών ανά cohort" description="Από τους νέους πελάτες κάθε τριμήνου, τι % αγοράζει ξανά τα επόμενα τρίμηνα" className="xl:col-span-3">
          <Heatmap
            rows={c.cohorts.rows.map((r) => `${qLabel(r.cohort)} · ${r.size}`)}
            columns={c.cohorts.quarters}
            values={c.cohorts.rows.map((r) => r.values)}
            good={40}
            bad={5}
            unit="%"
          />
        </ChartCard>
        <ChartCard title="Νέοι και χαμένοι πελάτες ανά τρίμηνο" description="Μπάρες: νέοι (πάνω) και όσοι δεν ξαναγόρασαν (κάτω) · γραμμή: ενεργοί" className="xl:col-span-2">
          <ComboChart
            data={c.cohorts.flow.map((f) => ({ q: qLabel(f.quarter), new: f.new, lost: -f.lost, active: f.active }))}
            xKey="q"
            format="count"
            zeroLine
            series={[
              { key: "new", label: "Νέοι", color: "var(--chart-3)", type: "bar", stack: "f" },
              { key: "lost", label: "Χαμένοι", color: "var(--chart-2)", type: "bar", stack: "f" },
              { key: "active", label: "Ενεργοί", color: "var(--chart-1)", type: "line" },
            ]}
          />
        </ChartCard>
      </div>

      {c.clv.length > 0 && (
        <ChartCard
          title="Αξία πελάτη στον χρόνο ζωής του (CLV) ανά κατηγορία"
          description={`Μέσο ετήσιο μικτό κέρδος × αναμενόμενη διάρκεια σχέσης (${c.clv[0].lifetimeYears.toLocaleString("el-GR", { maximumFractionDigits: 1 })} έτη από τη διατήρηση) — πόσο αξίζει να «επενδύσετε» για να κρατήσετε κάθε πελάτη`}
        >
          <RankingChart data={c.clv.map((x) => ({ name: `${x.name} (${x.customers})`, value: Math.round(x.clv) }))} label="CLV" color="var(--chart-1)" />
        </ChartCard>
      )}

      <ChartCard
        title="Πραγματική κερδοφορία πελατών"
        description={`Οι 60 μεγαλύτεροι: τζίρος 12μ έναντι καθαρής συνεισφοράς % μετά το κόστος εξυπηρέτησης (${SERVE.perDocument} € ανά παραστατικό, χρηματοδότηση υπολοίπου ${Math.round(SERVE.financingRate * 100)}% τον χρόνο, ${Math.round(SERVE.returnsHandling * 100)}% των επιστροφών)`}
      >
        <QuadrantBubbles
          data={c.pl.bubbles}
          xLabel="Τζίρος 12μ"
          yLabel="Καθαρή συνεισφορά %"
          quadrants={["Μικροί αλλά κερδοφόροι", "Μεγάλοι και κερδοφόροι", "Μικροί, χαμηλή συνεισφορά", "Μεγάλοι αλλά δεν αποδίδουν"]}
          xUnit=" €"
          yUnit="%"
          sizeLabel="Συνεισφορά"
        />
      </ChartCard>
      <ChartCard title="Συνεισφορά ανά πελάτη" description="Μικτό κέρδος μείον κόστος εξυπηρέτησης, τελευταίοι 12 μήνες">
        <Tabs defaultValue="best">
          <TabsList>
            <TabsTrigger value="best">Οι πιο κερδοφόροι</TabsTrigger>
            <TabsTrigger value="worst">Ζημιογόνοι ({c.pl.lossMakers})</TabsTrigger>
          </TabsList>
          <TabsContent value="best">
            <PlTable rows={c.pl.best} />
          </TabsContent>
          <TabsContent value="worst">
            <PlTable rows={c.pl.worst} />
          </TabsContent>
        </Tabs>
      </ChartCard>

      <ChartCard title="Cross-sell: τι αγοράζουν μαζί" description="Κατηγορίες που αγοράζονται μαζί πολύ συχνότερα από το αναμενόμενο — και οι πελάτες που αγοράζουν μόνο τη μία">
        <RuleCards rules={c.rules} />
      </ChartCard>

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Τι αγοράζουν οι όμοιοί τους" description="Κατηγορίες που αγοράζει η πλειονότητα ενός κλάδου (ΚΑΔ) — πελάτες του κλάδου που δεν τις αγοράζουν">
          <PeerTable rows={c.peers} />
        </ChartCard>
        <ChartCard title="Πιστωτικός κίνδυνος που αυξάνεται" description="Υπόλοιπο που μεγάλωσε στο τρίμηνο ή ληξιπρόθεσμα 90+ ημερών με κακό βαθμό πληρωμής">
          <CreditTable rows={c.credit} />
        </ChartCard>
      </div>
    </div>
  );
}
