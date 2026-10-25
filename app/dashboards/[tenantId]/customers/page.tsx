import type { Metadata } from "next";
import { CubeTable, type ListColumn } from "@/components/dashboards/cube-table";
import { DashboardErrors } from "@/components/dashboards/blocks";
import { ListTabs } from "@/components/dashboards/list-tabs";
import { cubeLoad, num, type CubeQuery } from "@/lib/cube-client";
import { requireDashboardTenant } from "@/lib/dashboards";
import { eurCompact } from "@/lib/format";

export const metadata: Metadata = { title: "Πελάτες" };

const C = (m: string) => `customers.${m}`;

const RISK_TONE = { Υψηλός: "bg-red-50 text-red-700", Μέτριος: "bg-amber-50 text-amber-700", Χαμηλός: "bg-emerald-50 text-emerald-700" };
const GRADE_TONE = { Α: "bg-emerald-50 text-emerald-700", Β: "bg-sky-50 text-sky-700", Γ: "bg-amber-50 text-amber-700", Δ: "bg-red-50 text-red-700" };
const SEGMENT_TONE = {
  Champions: "bg-emerald-50 text-emerald-700",
  Πιστοί: "bg-teal-50 text-teal-700",
  "Δυνητικά πιστοί": "bg-sky-50 text-sky-700",
  Νέοι: "bg-violet-50 text-violet-700",
  "Χρειάζονται προσοχή": "bg-amber-50 text-amber-700",
  "Σε κίνδυνο": "bg-red-50 text-red-700",
  Αδρανείς: "bg-slate-100 text-slate-700",
  Χαμένοι: "bg-slate-200 text-slate-600",
};

const TABS = {
  churn: "Σταμάτησαν να αγοράζουν",
  risk: "Επισφαλείς / κακοί πληρωτές",
  top: "Μεγαλύτεροι πελάτες",
  all: "Όλοι οι πελάτες",
} as const;
type Tab = keyof typeof TABS;

const BASE: ListColumn[] = [
  { key: C("customer_code"), label: "Κωδικός", size: 110 },
  { key: C("customer_name"), label: "Πελάτης", grow: true, link: "/dashboards/__T__/customers/{customers.customer_code}" },
  { key: C("city"), label: "Πόλη", size: 120 },
];

const COLUMNS: Record<Tab, ListColumn[]> = {
  churn: [
    ...BASE,
    { key: C("churn_risk"), label: "Κίνδυνος", format: "badge", tones: RISK_TONE, size: 95 },
    { key: C("revenue_prev"), label: "Τζίρος προηγ. 12μ", format: "eur" },
    { key: C("revenue"), label: "Τζίρος 12μ", format: "eur" },
    { key: C("recency_days"), label: "Ημέρες χωρίς αγορά", format: "int", size: 120 },
    { key: C("avg_days_between"), label: "Συνήθως αγοράζει κάθε (ημ.)", format: "num", size: 140 },
    { key: C("last_purchase"), label: "Τελευταία αγορά", format: "date", size: 120 },
    { key: C("invoices_12m"), label: "Παραστατικά 12μ", format: "int", size: 110 },
    { key: C("open_balance"), label: "Υπόλοιπο", format: "eur" },
  ],
  risk: [
    ...BASE,
    { key: C("payment_grade"), label: "Βαθμός", format: "badge", tones: GRADE_TONE, size: 80 },
    { key: C("payment_score"), label: "Βαθμολογία", format: "int", size: 95, warnBelow: 40 },
    { key: C("open_balance"), label: "Υπόλοιπο", format: "eur" },
    { key: C("overdue_90_amount"), label: "Ανοιχτά > 90 ημ.", format: "eur", warnAbove: 0 },
    { key: C("payment_days"), label: "Ημέρες πληρωμής", format: "int", size: 110, warnAbove: 90 },
    { key: C("last_payment"), label: "Τελευταία πληρωμή", format: "date", size: 120 },
    { key: C("revenue"), label: "Τζίρος 12μ", format: "eur" },
    { key: C("segment"), label: "Κατηγορία", format: "badge", tones: SEGMENT_TONE, size: 140 },
  ],
  top: [
    ...BASE,
    { key: C("segment"), label: "Κατηγορία", format: "badge", tones: SEGMENT_TONE, size: 140 },
    { key: C("revenue"), label: "Τζίρος 12μ", format: "eur" },
    { key: C("growth_percent"), label: "Μεταβολή %", format: "pct", size: 100, warnBelow: 0 },
    { key: C("margin_percent"), label: "Περιθώριο %", format: "pct", size: 100, warnBelow: 8 },
    { key: C("invoices_12m"), label: "Παραστατικά", format: "int", size: 100 },
    { key: C("payment_grade"), label: "Πληρωμές", format: "badge", tones: GRADE_TONE, size: 85 },
    { key: C("open_balance"), label: "Υπόλοιπο", format: "eur" },
  ],
  all: [
    ...BASE,
    { key: C("segment"), label: "Κατηγορία RFM", format: "badge", tones: SEGMENT_TONE, size: 140 },
    { key: C("churn_risk"), label: "Κίνδυνος", format: "badge", tones: RISK_TONE, size: 95 },
    { key: C("payment_grade"), label: "Πληρωμές", format: "badge", tones: GRADE_TONE, size: 85 },
    { key: C("revenue"), label: "Τζίρος 12μ", format: "eur" },
    { key: C("revenue_prev"), label: "Προηγ. 12μ", format: "eur" },
    { key: C("margin_percent"), label: "Περιθώριο %", format: "pct", size: 100 },
    { key: C("recency_days"), label: "Ημέρες από αγορά", format: "int", size: 110 },
    { key: C("open_balance"), label: "Υπόλοιπο", format: "eur" },
  ],
};

const QUERIES: Record<Tab, CubeQuery> = {
  churn: {
    dimensions: COLUMNS.churn.map((c) => c.key),
    filters: [{ member: C("churn_risk"), operator: "equals", values: ["Υψηλός", "Μέτριος"] }],
    order: { [C("revenue_prev")]: "desc" },
    limit: 2000,
  },
  risk: {
    dimensions: COLUMNS.risk.map((c) => c.key),
    filters: [
      {
        or: [
          { member: C("payment_grade"), operator: "equals", values: ["Γ", "Δ"] },
          { member: C("overdue_90_amount"), operator: "gt", values: ["100"] },
        ],
      },
    ],
    order: { [C("overdue_90_amount")]: "desc" },
    limit: 2000,
  },
  top: {
    dimensions: COLUMNS.top.map((c) => c.key),
    filters: [{ member: C("revenue"), operator: "gt", values: ["0"] }],
    order: { [C("revenue")]: "desc" },
    limit: 500,
  },
  all: { dimensions: COLUMNS.all.map((c) => c.key), order: { [C("revenue")]: "desc" }, limit: 20000 },
};

const NOTES: Record<Tab, string> = {
  churn: "Πελάτες που αγόραζαν τακτικά και έχουν σταματήσει πολύ πέρα από τον συνηθισμένο τους ρυθμό, ταξινομημένοι με τον τζίρο που έκαναν πέρσι. Αξίζει τηλεφώνημα ή προσφορά επανενεργοποίησης.",
  risk: "Πελάτες με βαθμό πληρωμών Γ ή Δ ή με ανοιχτά πάνω από 90 ημέρες. Ο βαθμός βγαίνει από τις ημέρες πληρωμής και την παλαιότητα των ανοιχτών (Α ≥ 80, Β ≥ 60, Γ ≥ 40, Δ κάτω από 40).",
  top: "Οι μεγαλύτεροι πελάτες των τελευταίων 12 μηνών με την τάση, το περιθώριο και τη συμπεριφορά πληρωμών τους.",
  all: "Όλοι οι πελάτες με κατηγορία RFM, κίνδυνο απώλειας και βαθμό πληρωμών.",
};

export default async function CustomersPage({ params, searchParams }: PageProps<"/dashboards/[tenantId]/customers">) {
  const { tenantId } = await params;
  await requireDashboardTenant(tenantId, "customers");
  const sp = await searchParams;
  const tab: Tab = typeof sp.tab === "string" && sp.tab in TABS ? (sp.tab as Tab) : "churn";

  let rows: Record<string, unknown>[] = [];
  let summary: Record<string, unknown> = {};
  const errors: string[] = [];
  await Promise.all([
    cubeLoad(tenantId, QUERIES[tab]).then((r) => (rows = r), (e) => errors.push((e as Error).message)),
    cubeLoad(tenantId, { measures: [C("count"), C("balance"), C("overdue_90"), C("dso"), C("at_risk_revenue")] }).then(
      (r) => (summary = r[0] ?? {}),
      (e) => errors.push((e as Error).message),
    ),
  ]);

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Πελάτες</h1>
        <p className="text-xs text-muted-foreground">
          {num(summary[C("count")] as number).toLocaleString("el-GR")} πελάτες · υπόλοιπο {eurCompact(num(summary[C("balance")] as number))} · ανοιχτά &gt; 90 ημ.{" "}
          {eurCompact(num(summary[C("overdue_90")] as number))} · DSO {Math.round(num(summary[C("dso")] as number))} ημέρες · τζίρος σε κίνδυνο{" "}
          {eurCompact(num(summary[C("at_risk_revenue")] as number))}
        </p>
      </div>
      <ListTabs
        tabs={Object.entries(TABS).map(([key, label]) => ({ key, label }))}
        active={tab}
        basePath={`/dashboards/${tenantId}/customers`}
        query={{}}
      />
      <DashboardErrors errors={errors} />
      <p className="text-xs text-muted-foreground">{NOTES[tab]}</p>
      <CubeTable
        key={tab}
        tenantId={tenantId}
        rows={rows}
        columns={COLUMNS[tab].map((c) => (c.link ? { ...c, link: c.link.replace("__T__", tenantId) } : c))}
        storageKey={`customers-${tab}`}
        title={TABS[tab]}
        query={QUERIES[tab] as Record<string, unknown>}
        searchPlaceholder="Αναζήτηση πελάτη, κωδικού, πόλης…"
        initialSort={{ id: tab === "churn" ? C("revenue_prev") : tab === "risk" ? C("overdue_90_amount") : C("revenue"), desc: true }}
      />
    </>
  );
}
