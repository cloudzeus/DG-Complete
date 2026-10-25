import type { Metadata } from "next";
import { HeartHandshake, TrendingDown, UserMinus, UserX } from "lucide-react";
import { DonutChart, RankingChart } from "@/components/charts/bi-charts";
import { ChartCard, Kpi } from "@/components/dashboards/blocks";
import { loadSmart, SmartError, SmartHeader } from "@/components/smart/smart-page";
import { SmartTable } from "@/components/smart/smart-table";
import { requireDashboardTenant } from "@/lib/dashboards";
import { eurCompact } from "@/lib/format";
import { winback } from "@/lib/smart/winback";

export const metadata: Metadata = { title: "Επαναπροσέλκυση πελατών" };

export default async function WinbackPage({ params }: PageProps<"/dashboards/[tenantId]/winback">) {
  const { tenantId } = await params;
  await requireDashboardTenant(tenantId, "winback");
  const { data: w, error } = await loadSmart(() => winback(tenantId));
  const stage = (s: string) => w?.stages.find((x) => x.stage === s);

  return (
    <>
      <SmartHeader title="Επαναπροσέλκυση πελατών" icon={HeartHandshake}>
        Η πιθανότητα να έχει χαθεί κάθε πελάτης, από το πόσο έχει ξεπεράσει τον δικό του ρυθμό αγορών και την πορεία του τζίρου του· η αξία που κινδυνεύει, οι
        μάρκες που σταμάτησε να αγοράζει, και οι μάρκες που αγοράζουν οι όμοιοί του (ίδια κύρια κατηγορία) αλλά όχι εκείνος. Πατήστε έναν πελάτη για πρόταση και
        έτοιμο email από το AI.
      </SmartHeader>
      <SmartError error={error} />
      {w && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Αξία σε κίνδυνο" value={eurCompact(w.valueAtRisk)} hint={`${w.customers.length} πελάτες · τζίρος έτους × πιθανότητα`} icon={TrendingDown} tone="red" />
            <Kpi label="Σε κίνδυνο" value={String(stage("Σε κίνδυνο")?.customers ?? 0)} hint={eurCompact(stage("Σε κίνδυνο")?.value ?? 0)} icon={UserMinus} tone="amber" />
            <Kpi label="Χάνονται" value={String(stage("Χάνεται")?.customers ?? 0)} hint={eurCompact(stage("Χάνεται")?.value ?? 0)} icon={UserMinus} tone="violet" />
            <Kpi label="Χαμένοι (< 2 έτη)" value={String(stage("Χαμένος")?.customers ?? 0)} hint={eurCompact(stage("Χαμένος")?.value ?? 0)} icon={UserX} tone="slate" />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard title="Αξία σε κίνδυνο ανά στάδιο" description="Σε κίνδυνο: 35–55% · Χάνεται: 55–80% · Χαμένος: πάνω από 80%">
              <DonutChart data={w.stages.filter((s) => s.value > 0).map((s) => ({ name: `${s.stage} (${s.customers})`, value: s.value }))} centerLabel="Σε κίνδυνο" />
            </ChartCard>
            <ChartCard title="Μάρκες που σταμάτησαν να αγοράζουν" description="Αξία της προηγούμενης χρονιάς που δεν επαναλήφθηκε τους τελευταίους 6 μήνες">
              <RankingChart data={w.stoppedBrands.slice(0, 10).map((b) => ({ name: `${b.brand} (${b.customers})`, value: b.value }))} label="Αξία" color="var(--chart-2)" />
            </ChartCard>
          </div>
          <SmartTable
            tenantId={tenantId}
            title="Επαναπροσέλκυση πελατών"
            idKey="trdr"
            rows={w.customers.map((c) => ({
              ...c,
              stopped: c.stoppedBrands.map((b) => b.brand).join(", "),
              peers: c.peerBrands.map((b) => `${b.brand} (${b.share}%)`).join(", "),
              details: [
                c.stoppedBrands.length ? `Σταμάτησε: ${c.stoppedBrands.map((b) => `${b.brand} (${Math.round(b.before).toLocaleString("el-GR")} € πέρσι)`).join(", ")}` : "",
                c.peerBrands.length ? `Οι όμοιοί του (${c.topCategory}) αγοράζουν: ${c.peerBrands.map((b) => `${b.brand} — ${b.share}% αυτών`).join(", ")}` : "",
                `Τελευταία αγορά πριν από ${c.recency} ημέρες${c.usualGap ? ` · συνήθως κάθε ${c.usualGap}` : ""}`,
              ].filter(Boolean),
            }))}
            detailKey="details"
            brief={{ kind: "winback", label: "Πρόταση & email με AI" }}
            initialSort={{ key: "valueAtRisk", desc: true }}
            searchPlaceholder="Πελάτης, μάρκα…"
            columns={[
              { key: "code", label: "Κωδικός" },
              { key: "name", label: "Πελάτης", wide: true },
              { key: "stage", label: "Στάδιο" },
              { key: "probability", label: "Πιθανότητα", format: "pct" },
              { key: "revenuePrev", label: "Πέρσι", format: "eur" },
              { key: "revenue12", label: "12 μήνες", format: "eur" },
              { key: "recency", label: "Ημέρες", format: "int" },
              { key: "valueAtRisk", label: "Σε κίνδυνο", format: "eur" },
              { key: "stopped", label: "Μάρκες που σταμάτησε" },
              { key: "peers", label: "Αγοράζουν οι όμοιοι", excelOnly: true },
              { key: "topCategory", label: "Κύρια κατηγορία", excelOnly: true },
            ]}
          />
        </div>
      )}
    </>
  );
}
