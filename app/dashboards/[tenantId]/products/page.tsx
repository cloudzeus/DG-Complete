import type { Metadata } from "next";
import { CubeTable, type ListColumn } from "@/components/dashboards/cube-table";
import { DashboardErrors } from "@/components/dashboards/blocks";
import { ListTabs } from "@/components/dashboards/list-tabs";
import { PeriodPicker } from "@/components/dashboards/period-picker";
import { cubeLoad, type CubeQuery } from "@/lib/cube-client";
import { requireDashboardTenant } from "@/lib/dashboards";
import { fmtDate, resolvePeriod } from "@/lib/period";

export const metadata: Metadata = { title: "Προϊόντα" };

const S = (m: string) => `sales_lines.${m}`;

const TABS = {
  sales: { label: "Περισσότερες πωλήσεις", order: { [S("revenue")]: "desc" as const } },
  profit: { label: "Περισσότερο κέρδος", order: { [S("margin")]: "desc" as const } },
  "low-margin": { label: "Χαμηλό ή αρνητικό περιθώριο", order: { [S("revenue")]: "desc" as const } },
  categories: { label: "Κατηγορίες", order: { [S("revenue")]: "desc" as const } },
  brands: { label: "Μάρκες", order: { [S("revenue")]: "desc" as const } },
};
type Tab = keyof typeof TABS;

const ITEM_COLUMNS: ListColumn[] = [
  { key: S("item_code"), label: "Κωδικός", size: 130 },
  { key: S("item_name"), label: "Είδος", grow: true },
  { key: S("category"), label: "Κατηγορία", size: 170 },
  { key: S("brand"), label: "Μάρκα", size: 120 },
  { key: S("revenue"), label: "Τζίρος", format: "eur" },
  { key: S("margin"), label: "Μικτό κέρδος", format: "eur" },
  { key: S("margin_pct"), label: "Περιθώριο %", format: "pct", size: 105, warnBelow: 8 },
  { key: S("quantity"), label: "Ποσότητα", format: "num", size: 100 },
  { key: S("avg_price"), label: "Μέση τιμή", format: "eur", size: 110 },
  { key: S("customers"), label: "Πελάτες", format: "int", size: 90 },
];

const GROUP_COLUMNS = (dim: string, label: string): ListColumn[] => [
  { key: S(dim), label, grow: true },
  { key: S("revenue"), label: "Τζίρος", format: "eur" },
  { key: S("margin"), label: "Μικτό κέρδος", format: "eur" },
  { key: S("margin_pct"), label: "Περιθώριο %", format: "pct", warnBelow: 8 },
  { key: S("items"), label: "Είδη", format: "int" },
  { key: S("customers"), label: "Πελάτες", format: "int" },
];

export default async function ProductsPage({ params, searchParams }: PageProps<"/dashboards/[tenantId]/products">) {
  const { tenantId } = await params;
  await requireDashboardTenant(tenantId);
  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const tab: Tab = typeof sp.tab === "string" && sp.tab in TABS ? (sp.tab as Tab) : "sales";
  const td = [{ dimension: S("date"), dateRange: [period.from, period.to] as [string, string] }];

  const measures = [S("revenue"), S("margin"), S("margin_pct"), S("quantity"), S("avg_price"), S("customers")];
  const query: CubeQuery =
    tab === "categories" || tab === "brands"
      ? {
          measures: [S("revenue"), S("margin"), S("margin_pct"), S("items"), S("customers")],
          dimensions: [S(tab === "categories" ? "category" : "brand")],
          timeDimensions: td,
          order: TABS[tab].order,
          limit: 2000,
        }
      : {
          measures,
          dimensions: [S("item_code"), S("item_name"), S("category"), S("brand")],
          timeDimensions: td,
          filters:
            tab === "low-margin"
              ? [
                  { member: S("margin_pct"), operator: "lt", values: ["8"] },
                  { member: S("revenue"), operator: "gt", values: ["200"] },
                ]
              : tab === "profit"
                ? [{ member: S("margin"), operator: "gt", values: ["0"] }]
                : [{ member: S("revenue"), operator: "gt", values: ["0"] }],
          order: TABS[tab].order,
          limit: 1000,
        };

  let rows: Record<string, unknown>[] = [];
  let error: string | null = null;
  try {
    rows = await cubeLoad(tenantId, query);
  } catch (e) {
    error = (e as Error).message;
  }
  const columns = tab === "categories" ? GROUP_COLUMNS("category", "Κατηγορία") : tab === "brands" ? GROUP_COLUMNS("brand", "Μάρκα") : ITEM_COLUMNS;
  const title = `${TABS[tab].label} ${period.from} – ${period.to}`;

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Προϊόντα</h1>
          <p className="text-xs text-muted-foreground">
            Πωλήσεις, κέρδος και περιθώριο ανά είδος · {fmtDate(period.from)} – {fmtDate(period.to)}. Το κέρδος υπολογίζεται με το κόστος
            είδους της χρήσης.
          </p>
        </div>
        <PeriodPicker preset={period.preset} from={period.from} to={period.to} label={period.label} />
      </div>
      <ListTabs
        tabs={Object.entries(TABS).map(([key, t]) => ({ key, label: t.label }))}
        active={tab}
        basePath={`/dashboards/${tenantId}/products`}
        query={{ period: period.preset, from: period.preset === "custom" ? period.from : undefined, to: period.preset === "custom" ? period.to : undefined }}
      />
      {error && <DashboardErrors errors={[error]} />}
      {tab === "low-margin" && (
        <p className="text-xs text-muted-foreground">
          Είδη με περιθώριο κάτω από 8% και τζίρο πάνω από 200 € στην περίοδο. Αρνητικό περιθώριο σημαίνει πώληση κάτω του κόστους — ή λάθος
          κόστος στο SoftOne.
        </p>
      )}
      <CubeTable
        key={tab}
        tenantId={tenantId}
        rows={rows}
        columns={columns}
        storageKey={`products-${tab}`}
        title={title}
        query={query as Record<string, unknown>}
        searchPlaceholder="Αναζήτηση είδους, κωδικού, κατηγορίας…"
        emptyMessage="Δεν βρέθηκαν είδη για την περίοδο."
        initialSort={{ id: tab === "profit" ? S("margin") : S("revenue"), desc: true }}
      />
    </>
  );
}
