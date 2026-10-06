import type { Metadata } from "next";
import { RankingChart } from "@/components/charts/bi-charts";
import { ChartCard, DashboardErrors, Kpi } from "@/components/dashboards/blocks";
import { CubeTable, type ListColumn } from "@/components/dashboards/cube-table";
import { ListTabs } from "@/components/dashboards/list-tabs";
import { cubeLoadAll, num, type CubeQuery } from "@/lib/cube-client";
import { requireDashboardTenant } from "@/lib/dashboards";
import { eurCompact, pct } from "@/lib/format";
import { Clock, Percent, Truck, Wallet } from "lucide-react";

export const metadata: Metadata = { title: "Προμηθευτές" };

const S = (m: string) => `suppliers.${m}`;

const TABS = {
  scorecard: "Αξιολόγηση",
  prices: "Αυξήσεις τιμών",
  lead: "Χρόνοι παράδοσης",
  dependency: "Εξάρτηση",
} as const;
type Tab = keyof typeof TABS;

const NAME: ListColumn[] = [
  { key: S("supplier_code"), label: "Κωδικός", size: 110 },
  { key: S("supplier_name"), label: "Προμηθευτής", grow: true },
];

const COLUMNS: Record<Tab, ListColumn[]> = {
  scorecard: [
    ...NAME,
    { key: S("spend"), label: "Αγορές 12μ", format: "eur" },
    { key: S("spend_share"), label: "Μερίδιο %", format: "pct", size: 95 },
    { key: S("spend_growth"), label: "Μεταβολή %", format: "pct", size: 100 },
    { key: S("lead_days_median"), label: "Παράδοση (διάμεσος)", format: "num", size: 130 },
    { key: S("lead_days_p90"), label: "Παράδοση 90%", format: "num", size: 110, warnAbove: 30 },
    { key: S("price_change"), label: "Μεταβολή τιμών %", format: "pct", size: 120, warnAbove: 5 },
    { key: S("open_balance"), label: "Υπόλοιπο", format: "eur" },
    { key: S("payment_days"), label: "Τον πληρώνουμε σε (ημ.)", format: "int", size: 140 },
  ],
  prices: [
    ...NAME,
    { key: S("price_change"), label: "Μεταβολή τιμών %", format: "pct", size: 130, warnAbove: 5 },
    { key: S("spend"), label: "Αγορές 12μ", format: "eur" },
    { key: S("spend_share"), label: "Μερίδιο %", format: "pct", size: 95 },
    { key: S("spend_growth"), label: "Μεταβολή αγορών %", format: "pct", size: 130 },
  ],
  lead: [
    ...NAME,
    { key: S("orders_received"), label: "Παραγγελίες (24μ)", format: "int", size: 120 },
    { key: S("lead_days_avg"), label: "Μέσος (ημ.)", format: "num", size: 95 },
    { key: S("lead_days_median"), label: "Διάμεσος (ημ.)", format: "num", size: 105 },
    { key: S("lead_days_p90"), label: "90% (ημ.)", format: "num", size: 95, warnAbove: 30 },
    { key: S("lead_days_stddev"), label: "Διακύμανση", format: "num", size: 100, warnAbove: 15 },
    { key: S("spend"), label: "Αγορές 12μ", format: "eur" },
  ],
  dependency: [
    ...NAME,
    { key: S("spend_share"), label: "Μερίδιο %", format: "pct", size: 95 },
    { key: S("spend"), label: "Αγορές 12μ", format: "eur" },
    { key: S("spend_growth"), label: "Μεταβολή %", format: "pct", size: 100 },
    { key: S("open_balance"), label: "Υπόλοιπο", format: "eur" },
  ],
};

const QUERIES: Record<Tab, CubeQuery> = {
  scorecard: { dimensions: COLUMNS.scorecard.map((c) => c.key), filters: [{ member: S("spend"), operator: "gt", values: ["0"] }], order: { [S("spend")]: "desc" }, limit: 5000 },
  prices: {
    dimensions: COLUMNS.prices.map((c) => c.key),
    filters: [
      { member: S("price_change"), operator: "set" },
      { member: S("spend"), operator: "gt", values: ["1000"] },
    ],
    order: { [S("price_change")]: "desc" },
    limit: 2000,
  },
  lead: {
    dimensions: COLUMNS.lead.map((c) => c.key),
    filters: [{ member: S("orders_received"), operator: "gt", values: ["0"] }],
    order: { [S("lead_days_p90")]: "desc" },
    limit: 2000,
  },
  dependency: { dimensions: COLUMNS.dependency.map((c) => c.key), filters: [{ member: S("spend"), operator: "gt", values: ["0"] }], order: { [S("spend_share")]: "desc" }, limit: 100 },
};

const NOTES: Record<Tab, string> = {
  scorecard:
    "Όλοι οι προμηθευτές με αγορές τους τελευταίους 12 μήνες: όγκος, τάση, πόσο γρήγορα παραδίδουν, πώς κινούνται οι τιμές τους και πόσο γρήγορα τους πληρώνουμε.",
  prices:
    "Μεταβολή τιμής των ίδιων ειδών: τελευταίοι 12 μήνες έναντι των 12 προηγούμενων, σταθμισμένη με τις ποσότητες. Θετικό = ακρίβυναν.",
  lead: "Ημέρες από την παραγγελία έως την πρώτη παραλαβή. Το «90%» δείχνει τις χειρότερες περιπτώσεις — με αυτό σχεδιάζεται το απόθεμα ασφαλείας. Μεγάλη διακύμανση = αναξιόπιστος προμηθευτής.",
  dependency: "Πόσο εξαρτάται η επιχείρηση από κάθε προμηθευτή (μερίδιο στις αγορές 12 μηνών).",
};

export default async function SuppliersPage({ params, searchParams }: PageProps<"/dashboards/[tenantId]/suppliers">) {
  const { tenantId } = await params;
  await requireDashboardTenant(tenantId, "suppliers");
  const sp = await searchParams;
  const tab: Tab = typeof sp.tab === "string" && sp.tab in TABS ? (sp.tab as Tab) : "scorecard";

  const { data, errors } = await cubeLoadAll(tenantId, {
    rows: QUERIES[tab],
    totals: { measures: [S("count"), S("spend_12m"), S("avg_lead_days"), S("dpo"), S("balance")] },
    top: { dimensions: [S("supplier_name"), S("spend")], filters: [{ member: S("spend"), operator: "gt", values: ["0"] }], order: { [S("spend")]: "desc" }, limit: 10 },
  });
  const t = (k: string) => num(data.totals[0]?.[S(k)]);
  const top = data.top.map((r) => ({ name: String(r[S("supplier_name")]), value: num(r[S("spend")]) }));
  const top5Share = t("spend_12m") ? (100 * top.slice(0, 5).reduce((a, r) => a + r.value, 0)) / t("spend_12m") : 0;

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Προμηθευτές</h1>
        <p className="text-xs text-muted-foreground">Αξιολόγηση με βάση αγορές, χρόνους παράδοσης, τιμές και πληρωμές — τελευταίοι 12 μήνες.</p>
      </div>
      <DashboardErrors errors={errors} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Αγορές 12 μηνών" value={eurCompact(t("spend_12m"))} hint={`${t("count").toLocaleString("el-GR")} προμηθευτές`} icon={Truck} tone="amber" />
        <Kpi label="Μέσος χρόνος παράδοσης" value={`${t("avg_lead_days").toFixed(1)} ημ.`} hint="από παραγγελία σε παραλαβή" icon={Clock} tone="blue" />
        <Kpi label="Εξάρτηση από τους 5 μεγαλύτερους" value={pct(top5Share, 0)} hint="του όγκου αγορών" icon={Percent} tone="violet" />
        <Kpi label="Υπόλοιπο προμηθευτών" value={eurCompact(t("balance"))} hint={`τους πληρώνουμε σε ~${Math.round(t("dpo"))} ημέρες (DPO)`} icon={Wallet} tone="slate" />
      </div>
      {top.length > 0 && (
        <ChartCard title="Μεγαλύτεροι προμηθευτές" description="Αγορές τελευταίων 12 μηνών">
          <RankingChart data={top} label="Αγορές" color="var(--chart-5)" />
        </ChartCard>
      )}
      <ListTabs tabs={Object.entries(TABS).map(([key, label]) => ({ key, label }))} active={tab} basePath={`/dashboards/${tenantId}/suppliers`} query={{}} />
      <p className="text-xs text-muted-foreground">{NOTES[tab]}</p>
      <CubeTable
        key={tab}
        tenantId={tenantId}
        rows={data.rows}
        columns={COLUMNS[tab]}
        storageKey={`suppliers-${tab}`}
        title={`Προμηθευτές — ${TABS[tab]}`}
        query={QUERIES[tab] as Record<string, unknown>}
        searchPlaceholder="Αναζήτηση προμηθευτή, κωδικού…"
        initialSort={{
          id: tab === "prices" ? S("price_change") : tab === "lead" ? S("lead_days_p90") : tab === "dependency" ? S("spend_share") : S("spend"),
          desc: true,
        }}
      />
    </>
  );
}
