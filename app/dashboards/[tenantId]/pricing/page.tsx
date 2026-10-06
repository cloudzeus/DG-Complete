import type { Metadata } from "next";
import { BadgePercent, PiggyBank, Tags, TrendingUp, Users } from "lucide-react";
import { DonutChart, RankingChart } from "@/components/charts/bi-charts";
import { ChartCard, Kpi } from "@/components/dashboards/blocks";
import { AiBrief } from "@/components/smart/ai-brief";
import { loadSmart, SmartError, SmartHeader } from "@/components/smart/smart-page";
import { SmartTable } from "@/components/smart/smart-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireDashboardTenant } from "@/lib/dashboards";
import { eurCompact } from "@/lib/format";
import { pricing } from "@/lib/smart/pricing";

export const metadata: Metadata = { title: "Τιμολόγηση & εκπτώσεις" };

export default async function PricingPage({ params }: PageProps<"/dashboards/[tenantId]/pricing">) {
  const { tenantId } = await params;
  await requireDashboardTenant(tenantId, "pricing");
  const { data: p, error } = await loadSmart(() => pricing(tenantId));

  return (
    <>
      <SmartHeader title="Τιμολόγηση & εκπτώσεις" icon={Tags}>
        Από το ιστορικό πωλήσεων του SoftOne: πόσο αντιδρά η ζήτηση κάθε είδους στην τιμή (ελαστικότητα), ποια τιμή αφήνει το μεγαλύτερο κέρδος, πού
        δίνονται εκπτώσεις πάνω από όσο δίνεται σε όμοιους πελάτες, και ποιες αυξήσεις κόστους δεν περάστηκαν στην τιμή. Οι προτάσεις εξάγονται σε Excel με
        κωδικό είδους και νέα τιμή χονδρικής (PRICEW) για εισαγωγή στο SoftOne.
      </SmartHeader>
      <SmartError error={error} />
      {p && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Επιπλέον κέρδος από τις τιμές" value={eurCompact(p.totalGain)} hint={`${p.suggestions.length} είδη · εκτίμηση/έτος`} icon={TrendingUp} tone="green" />
            <Kpi label="Εκπτώσεις 12 μηνών" value={eurCompact(p.discountTotal)} hint={`${p.discountPct}% της αξίας τιμοκαταλόγου`} icon={BadgePercent} tone="amber" />
            <Kpi label="Έκπτωση πάνω από τους όμοιους" value={eurCompact(p.excessTotal)} hint={`${p.customers.length} πελάτες`} icon={Users} tone="red" />
            <Kpi label="Αυξήσεις κόστους που δεν περάστηκαν" value={eurCompact(p.creepTotal)} hint={`${p.creep.length} είδη · χαμένο κέρδος/έτος`} icon={PiggyBank} tone="violet" />
          </div>

          <AiBrief tenantId={tenantId} kind="pricing" label="Σχέδιο τιμολογιακής πολιτικής με AI" />

          <Tabs defaultValue="prices">
            <TabsList className="flex-wrap">
              <TabsTrigger value="prices">Προτεινόμενες τιμές</TabsTrigger>
              <TabsTrigger value="discounts">Εκπτώσεις πελατών</TabsTrigger>
              <TabsTrigger value="creep">Αυξήσεις κόστους</TabsTrigger>
              <TabsTrigger value="categories">Κατηγορίες</TabsTrigger>
            </TabsList>

            <TabsContent value="prices" className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Ελαστικότητα: πόσο % αλλάζει η ποσότητα όταν η τιμή αλλάζει 1%, από τις μηνιαίες πωλήσεις 24 μηνών ({p.elasticityItems} είδη με αρκετή μεταβολή
                τιμής· τα υπόλοιπα παίρνουν τη διάμεσο της κατηγορίας τους και προτείνεται μόνο αύξηση σε είδη με περιθώριο κάτω από την κατηγορία). Η νέα τιμή
                είναι αυτή που μεγιστοποιεί το μικτό κέρδος σε ±10%. Εκτίμηση — δοκιμάστε σταδιακά.
              </p>
              <SmartTable
                tenantId={tenantId}
                title="Προτεινόμενες τιμές"
                idKey="mtrl"
                rows={p.suggestions}
                initialSort={{ key: "profitGain", desc: true }}
                searchPlaceholder="Είδος, κωδικός, μάρκα…"
                columns={[
                  { key: "code", label: "Κωδικός" },
                  { key: "name", label: "Είδος", wide: true },
                  { key: "brand", label: "Μάρκα" },
                  { key: "category", label: "Κατηγορία", excelOnly: true },
                  { key: "price", label: "Μέση τιμή", format: "num" },
                  { key: "cost", label: "Κόστος", format: "num" },
                  { key: "marginPct", label: "Περιθ.", format: "pct" },
                  { key: "elasticity", label: "Ελαστ.", format: "num" },
                  { key: "source", label: "Πηγή", excelOnly: true },
                  { key: "changePct", label: "Αλλαγή", format: "pct", signed: true },
                  { key: "newPrice", label: "Νέα τιμή", format: "num" },
                  { key: "pricew", label: "PRICEW", format: "num" },
                  { key: "newPricew", label: "Νέα PRICEW", format: "num" },
                  { key: "qty12", label: "Τεμ. 12μ", format: "int", excelOnly: true },
                  { key: "profitGain", label: "Κέρδος +", format: "eur" },
                ]}
              />
            </TabsContent>

            <TabsContent value="discounts" className="space-y-4">
              <div className="grid gap-5 lg:grid-cols-2">
                <ChartCard title="Ομάδες πελατών (k-means)" description="Ομαδοποίηση με βάση μέγεθος, έκπτωση, περιθώριο και συχνότητα αγορών">
                  <div className="space-y-2">
                    {p.clusters.map((c) => (
                      <div key={c.name} className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-xs">
                        <div>
                          <div className="font-semibold">{c.name}</div>
                          <div className="text-muted-foreground">
                            {c.customers} πελάτες · τζίρος {eurCompact(c.revenue)}
                          </div>
                        </div>
                        <div className="text-right tabular-nums">
                          <div>έκπτωση {c.discountPct}%</div>
                          <div className="text-muted-foreground">περιθώριο {c.marginPct}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ChartCard>
                <ChartCard title="Εκπτώσεις ανά μάρκα" description="Ποσό έκπτωσης 12 μηνών (τιμή καταλόγου − καθαρή αξία)">
                  <RankingChart data={p.brandDiscounts.slice(0, 10).map((b) => ({ name: b.name, value: b.discount }))} label="Έκπτωση" color="var(--chart-4)" />
                </ChartCard>
              </div>
              <p className="text-xs text-muted-foreground">
                Πελάτες με έκπτωση πάνω από τη διάμεσο των ομοίων τους σε μέγεθος — «επιπλέον» είναι η διαφορά επί της αξίας τιμοκαταλόγου.
              </p>
              <SmartTable
                tenantId={tenantId}
                title="Εκπτώσεις πελατών"
                idKey="trdr"
                rows={p.customers}
                initialSort={{ key: "excess", desc: true }}
                searchPlaceholder="Πελάτης…"
                columns={[
                  { key: "code", label: "Κωδικός" },
                  { key: "name", label: "Πελάτης", wide: true },
                  { key: "cluster", label: "Ομάδα" },
                  { key: "revenue", label: "Τζίρος", format: "eur" },
                  { key: "gross", label: "Αξία καταλόγου", format: "eur", excelOnly: true },
                  { key: "discount", label: "Έκπτωση", format: "eur" },
                  { key: "discountPct", label: "Έκπτ. %", format: "pct" },
                  { key: "peerPct", label: "Όμοιοι %", format: "pct" },
                  { key: "excess", label: "Επιπλέον", format: "eur" },
                  { key: "marginPct", label: "Περιθ.", format: "pct" },
                ]}
              />
            </TabsContent>

            <TabsContent value="creep" className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Κόστος αγοράς των τελευταίων 90 ημερών έναντι των 12 μηνών πριν, και η τιμή πώλησης στις ίδιες περιόδους. «Χαμένο κέρδος» = όσο θα κρατούσατε αν η
                τιμή ακολουθούσε το κόστος, × την ποσότητα έτους. Η στήλη «Νέα PRICEW» δίνει την τιμή χονδρικής που αποκαθιστά το περιθώριο.
              </p>
              <SmartTable
                tenantId={tenantId}
                title="Αυξήσεις κόστους"
                idKey="mtrl"
                rows={p.creep}
                initialSort={{ key: "lost", desc: true }}
                searchPlaceholder="Είδος, μάρκα…"
                columns={[
                  { key: "code", label: "Κωδικός" },
                  { key: "name", label: "Είδος", wide: true },
                  { key: "brand", label: "Μάρκα" },
                  { key: "costBefore", label: "Κόστος πριν", format: "num" },
                  { key: "costNow", label: "Κόστος τώρα", format: "num" },
                  { key: "costChangePct", label: "Κόστος", format: "pct", signed: true },
                  { key: "priceChangePct", label: "Τιμή", format: "pct", signed: true },
                  { key: "priceNow", label: "Τιμή τώρα", format: "num", excelOnly: true },
                  { key: "pricew", label: "PRICEW", format: "num" },
                  { key: "neededPricew", label: "Νέα PRICEW", format: "num" },
                  { key: "lost", label: "Χαμένο κέρδος", format: "eur" },
                ]}
              />
            </TabsContent>

            <TabsContent value="categories">
              <div className="grid gap-5 lg:grid-cols-2">
                <ChartCard title="Περιθώριο ανά κατηγορία" description="Μικτό περιθώριο των 1.500 μεγαλύτερων ειδών (τελευταίοι 6 μήνες)">
                  <RankingChart data={p.categories.slice(0, 12).map((c) => ({ name: c.name, value: c.marginPct }))} label="Περιθώριο" format="pct" color="var(--chart-3)" />
                </ChartCard>
                <ChartCard title="Τζίρος ανά κατηγορία" description="Μερίδιο στον τζίρο 12 μηνών">
                  <DonutChart data={p.categories.slice(0, 8).map((c) => ({ name: c.name, value: c.revenue }))} centerLabel="Τζίρος" />
                </ChartCard>
              </div>
              <div className="mt-4">
                <SmartTable
                  tenantId={tenantId}
                  title="Κατηγορίες"
                  idKey="name"
                  rows={p.categories}
                  initialSort={{ key: "revenue", desc: true }}
                  columns={[
                    { key: "name", label: "Κατηγορία", wide: true },
                    { key: "revenue", label: "Τζίρος", format: "eur" },
                    { key: "marginPct", label: "Περιθώριο", format: "pct" },
                    { key: "p25", label: "Κατώτερο 25%", format: "pct" },
                    { key: "below", label: "Είδη κάτω", format: "int" },
                    { key: "elasticity", label: "Ελαστικότητα", format: "num" },
                  ]}
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </>
  );
}
