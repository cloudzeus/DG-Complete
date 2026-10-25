import type { Metadata } from "next";
import { CubeTable, type ListColumn } from "@/components/dashboards/cube-table";
import { DashboardErrors } from "@/components/dashboards/blocks";
import { ListTabs } from "@/components/dashboards/list-tabs";
import { cubeLoad, num, type CubeQuery } from "@/lib/cube-client";
import { requireDashboardTenant } from "@/lib/dashboards";
import { eurCompact } from "@/lib/format";

export const metadata: Metadata = { title: "Αποθήκη & παραγγελίες" };

const I = (m: string) => `items.${m}`;
const ABC_TONE = { A: "bg-emerald-50 text-emerald-700", B: "bg-sky-50 text-sky-700", C: "bg-amber-50 text-amber-700", N: "bg-slate-100 text-slate-600" };

const TABS = {
  reorder: "Προτάσεις παραγγελίας",
  dead: "Νεκρό απόθεμα",
  slow: "Αργή κίνηση (> 180 ημ. κάλυψη)",
  all: "Όλο το απόθεμα",
} as const;
type Tab = keyof typeof TABS;

const ITEM: ListColumn[] = [
  { key: I("item_code"), label: "Κωδικός", size: 130 },
  { key: I("item_name"), label: "Είδος", grow: true },
  { key: I("category"), label: "Κατηγορία", size: 160 },
];

const COLUMNS: Record<Tab, ListColumn[]> = {
  reorder: [
    ...ITEM,
    { key: I("abc"), label: "ABC", format: "badge", tones: ABC_TONE, size: 60 },
    { key: I("supplier"), label: "Κύριος προμηθευτής", size: 200 },
    { key: I("stock"), label: "Απόθεμα", format: "num", size: 95 },
    { key: I("days_of_cover"), label: "Κάλυψη (ημ.)", format: "num", size: 100, warnBelow: 7 },
    { key: I("lead_days"), label: "Παράδοση (ημ.)", format: "int", size: 100 },
    { key: I("reorder_point"), label: "Σημείο αναπαρ.", format: "num", size: 110 },
    { key: I("order_qty"), label: "Πρόταση ποσότητας", format: "num", size: 120 },
    { key: I("unit_cost"), label: "Κόστος μον.", format: "eur", size: 105 },
    { key: I("revenue"), label: "Τζίρος 12μ", format: "eur" },
  ],
  dead: [
    ...ITEM,
    { key: I("brand"), label: "Μάρκα", size: 120 },
    { key: I("stock"), label: "Απόθεμα", format: "num", size: 95 },
    { key: I("unit_cost"), label: "Κόστος μον.", format: "eur", size: 105 },
    { key: I("stock_amount"), label: "Αξία αποθέματος", format: "eur" },
    { key: I("last_sale"), label: "Τελευταία πώληση", format: "date", size: 120 },
    { key: I("days_since_sale"), label: "Ημέρες χωρίς πώληση", format: "int", size: 130 },
    { key: I("supplier"), label: "Κύριος προμηθευτής", size: 200 },
  ],
  slow: [
    ...ITEM,
    { key: I("abc"), label: "ABC", format: "badge", tones: ABC_TONE, size: 60 },
    { key: I("stock"), label: "Απόθεμα", format: "num", size: 95 },
    { key: I("stock_amount"), label: "Αξία αποθέματος", format: "eur" },
    { key: I("days_of_cover"), label: "Κάλυψη (ημ.)", format: "int", size: 100 },
    { key: I("revenue"), label: "Τζίρος 12μ", format: "eur" },
    { key: I("growth_percent"), label: "Μεταβολή %", format: "pct", size: 100, warnBelow: 0 },
  ],
  all: [
    ...ITEM,
    { key: I("brand"), label: "Μάρκα", size: 120 },
    { key: I("abc"), label: "ABC", format: "badge", tones: ABC_TONE, size: 60 },
    { key: I("stock"), label: "Απόθεμα", format: "num", size: 95 },
    { key: I("stock_amount"), label: "Αξία", format: "eur" },
    { key: I("days_of_cover"), label: "Κάλυψη (ημ.)", format: "int", size: 100 },
    { key: I("revenue"), label: "Τζίρος 12μ", format: "eur" },
    { key: I("margin_percent"), label: "Περιθώριο %", format: "pct", size: 100 },
  ],
};

const QUERIES: Record<Tab, CubeQuery> = {
  reorder: {
    dimensions: COLUMNS.reorder.map((c) => c.key),
    filters: [{ member: I("order_qty"), operator: "gt", values: ["0"] }],
    order: [
      [I("abc"), "asc"],
      [I("days_of_cover"), "asc"],
    ],
    limit: 5000,
  },
  dead: {
    dimensions: COLUMNS.dead.map((c) => c.key),
    filters: [{ member: I("dead_stock"), operator: "equals", values: ["true"] }],
    order: { [I("stock_amount")]: "desc" },
    limit: 20000,
  },
  slow: {
    dimensions: COLUMNS.slow.map((c) => c.key),
    filters: [
      { member: I("days_of_cover"), operator: "gt", values: ["180"] },
      { member: I("stock_amount"), operator: "gt", values: ["0"] },
    ],
    order: { [I("stock_amount")]: "desc" },
    limit: 20000,
  },
  all: {
    dimensions: COLUMNS.all.map((c) => c.key),
    filters: [{ member: I("stock"), operator: "notEquals", values: ["0"] }],
    order: { [I("stock_amount")]: "desc" },
    limit: 50000,
  },
};

const NOTES: Record<Tab, string> = {
  reorder:
    "Είδη που το απόθεμά τους δεν καλύπτει τον χρόνο παράδοσης του κύριου προμηθευτή + 7 ημέρες. Η πρόταση καλύπτει τη ζήτηση για χρόνο παράδοσης + 30 ημέρες, με βάση τις πωλήσεις 12 μηνών (μόνο είδη με πωλήσεις τους τελευταίους 3 μήνες).",
  dead: "Είδη με απόθεμα στην κύρια αποθήκη χωρίς πώληση για περισσότερες από 180 ημέρες, ταξινομημένα κατά αξία. Υποψήφια για προωθήσεις, εκπτώσεις ή επιστροφή στον προμηθευτή.",
  slow: "Είδη που με τον τρέχοντα ρυθμό πωλήσεων το απόθεμά τους φτάνει για πάνω από 6 μήνες — δεσμευμένο κεφάλαιο.",
  all: "Όλα τα είδη με απόθεμα στην κύρια αποθήκη, με αξία, κάλυψη και κερδοφορία.",
};

export default async function StockPage({ params, searchParams }: PageProps<"/dashboards/[tenantId]/stock">) {
  const { tenantId } = await params;
  await requireDashboardTenant(tenantId, "stock");
  const sp = await searchParams;
  const tab: Tab = typeof sp.tab === "string" && sp.tab in TABS ? (sp.tab as Tab) : "reorder";

  let rows: Record<string, unknown>[] = [];
  let s: Record<string, unknown> = {};
  const errors: string[] = [];
  await Promise.all([
    cubeLoad(tenantId, QUERIES[tab]).then((r) => (rows = r), (e) => errors.push((e as Error).message)),
    cubeLoad(tenantId, { measures: [I("stock_value"), I("dead_stock_value"), I("dead_stock_items"), I("items_to_order"), I("suggested_order_value")] }).then(
      (r) => (s = r[0] ?? {}),
      (e) => errors.push((e as Error).message),
    ),
  ]);
  const n = (k: string) => num(s[I(k)] as number);

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Αποθήκη & παραγγελίες</h1>
        <p className="text-xs text-muted-foreground">
          Κύρια αποθήκη · αξία αποθέματος {eurCompact(n("stock_value"))} · νεκρό {eurCompact(n("dead_stock_value"))} ({n("dead_stock_items").toLocaleString("el-GR")}{" "}
          είδη) · {n("items_to_order").toLocaleString("el-GR")} είδη προς παραγγελία ({eurCompact(n("suggested_order_value"))})
        </p>
      </div>
      <ListTabs tabs={Object.entries(TABS).map(([key, label]) => ({ key, label }))} active={tab} basePath={`/dashboards/${tenantId}/stock`} query={{}} />
      <DashboardErrors errors={errors} />
      <p className="text-xs text-muted-foreground">{NOTES[tab]}</p>
      <CubeTable
        key={tab}
        tenantId={tenantId}
        rows={rows}
        columns={COLUMNS[tab]}
        storageKey={`stock-${tab}`}
        title={TABS[tab]}
        query={QUERIES[tab] as Record<string, unknown>}
        searchPlaceholder="Αναζήτηση είδους, κωδικού, προμηθευτή…"
        initialSort={tab === "reorder" ? undefined : { id: I("stock_amount"), desc: true }}
      />
    </>
  );
}
