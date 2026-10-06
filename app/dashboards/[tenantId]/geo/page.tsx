import type { Metadata } from "next";
import { MapPinned, Store, Receipt, Users } from "lucide-react";
import { DashboardErrors, Kpi } from "@/components/dashboards/blocks";
import { CubeTable, type ListColumn } from "@/components/dashboards/cube-table";
import { PeriodPicker } from "@/components/dashboards/period-picker";
import { GeoFilters } from "@/components/geo/geo-filters";
import { SalesMap, type GeoPoint } from "@/components/geo/sales-map";
import { cubeLoadAll, num, type CubeFilter, type CubeQuery } from "@/lib/cube-client";
import { requireDashboardTenant } from "@/lib/dashboards";
import { eurCompact } from "@/lib/format";
import { geoStatus } from "@/lib/geo";
import { publicMapToken } from "@/lib/mapbox";
import { fmtDate, resolvePeriod } from "@/lib/period";

export const metadata: Metadata = { title: "Γεωγραφία πωλήσεων" };

const G = (m: string) => `geo_sales.${m}`;

const AREA_COLUMNS: ListColumn[] = [
  { key: G("city"), label: "Πόλη", grow: true },
  { key: G("postcode_area"), label: "ΤΚ (3 ψηφία)", size: 110 },
  { key: G("revenue"), label: "Τζίρος", format: "eur" },
  { key: G("documents"), label: "Παραστατικά", format: "int", size: 110 },
  { key: G("customers"), label: "Πελάτες", format: "int", size: 95 },
  { key: G("margin_pct"), label: "Περιθώριο %", format: "pct", size: 105 },
];

export default async function GeoPage({ params, searchParams }: PageProps<"/dashboards/[tenantId]/geo">) {
  const { tenantId } = await params;
  await requireDashboardTenant(tenantId, "geo");
  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const brand = typeof sp.brand === "string" ? sp.brand : "";
  const category = typeof sp.category === "string" ? sp.category : "";
  const td = [{ dimension: G("date"), dateRange: [period.from, period.to] as [string, string] }];
  const filters: CubeFilter[] = [
    ...(brand ? [{ member: G("brand"), operator: "equals", values: [brand] }] : []),
    ...(category ? [{ member: G("category"), operator: "equals", values: [category] }] : []),
  ];

  const areasQuery: CubeQuery = {
    measures: [G("revenue"), G("documents"), G("customers"), G("margin_pct")],
    dimensions: [G("city"), G("postcode_area")],
    timeDimensions: td,
    filters,
    order: { [G("revenue")]: "desc" },
    limit: 5000,
  };
  const [token, status, { data, errors }] = await Promise.all([
    publicMapToken(),
    geoStatus(tenantId).catch(() => null),
    cubeLoadAll(tenantId, {
      points: {
        measures: [G("revenue"), G("documents"), G("quantity")],
        dimensions: [G("trdr"), G("customer_name"), G("city"), G("lat"), G("lng")],
        timeDimensions: td,
        filters,
        limit: 20000,
      },
      byBrand: { measures: [G("revenue")], dimensions: [G("trdr"), G("brand")], timeDimensions: td, filters, limit: 50000 },
      brands: { measures: [G("revenue")], dimensions: [G("brand")], timeDimensions: td, order: { [G("revenue")]: "desc" }, limit: 40 },
      categories: { measures: [G("revenue")], dimensions: [G("category")], timeDimensions: td, order: { [G("revenue")]: "desc" }, limit: 40 },
      totals: { measures: [G("revenue"), G("documents"), G("customers")], timeDimensions: td, filters },
      areas: areasQuery,
    }),
  ]);

  // The brand each customer buys most (for the «Μάρκες» view).
  const top = new Map<number, { brand: string; revenue: number }>();
  for (const r of data.byBrand) {
    const id = num(r[G("trdr")]);
    const rev = num(r[G("revenue")]);
    if (!top.has(id) || rev > top.get(id)!.revenue) top.set(id, { brand: String(r[G("brand")]), revenue: rev });
  }
  const points: GeoPoint[] = data.points
    .map((r) => ({
      trdr: num(r[G("trdr")]),
      name: String(r[G("customer_name")] ?? "—"),
      city: String(r[G("city")] ?? "—"),
      lat: num(r[G("lat")]),
      lng: num(r[G("lng")]),
      revenue: num(r[G("revenue")]),
      documents: num(r[G("documents")]),
      quantity: num(r[G("quantity")]),
    }))
    .filter((p) => p.lat && p.lng && p.revenue > 0)
    .map((p) => ({ ...p, brand: top.get(p.trdr)?.brand ?? null }));
  const brands = data.brands.map((r) => String(r[G("brand")]));
  const categories = data.categories.map((r) => String(r[G("category")]));
  const t = data.totals[0] ?? {};
  const topArea = data.areas[0];

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Γεωγραφία πωλήσεων</h1>
          <p className="text-xs text-muted-foreground">
            {fmtDate(period.from)} – {fmtDate(period.to)}
            {brand && ` · μάρκα ${brand}`}
            {category && ` · κατηγορία ${category}`}
            {status && ` · στον χάρτη ${status.ok.toLocaleString("el-GR")} από ${status.total.toLocaleString("el-GR")} ενεργούς πελάτες`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <GeoFilters brands={brands} categories={categories} brand={brand} category={category} />
          <PeriodPicker preset={period.preset} from={period.from} to={period.to} label={period.label} />
        </div>
      </div>
      <DashboardErrors errors={errors} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Τζίρος στον χάρτη" value={eurCompact(num(t[G("revenue")]))} hint="πελάτες με γνωστή θέση" icon={MapPinned} tone="red" />
        <Kpi label="Παραστατικά" value={num(t[G("documents")]).toLocaleString("el-GR")} hint="συχνότητα αγορών" icon={Receipt} tone="blue" />
        <Kpi label="Πελάτες" value={num(t[G("customers")]).toLocaleString("el-GR")} hint="με αγορές στην περίοδο" icon={Users} tone="teal" />
        <Kpi
          label="Πρώτη περιοχή"
          value={topArea ? String(topArea[G("city")]) : "—"}
          hint={topArea ? eurCompact(num(topArea[G("revenue")])) : ""}
          icon={Store}
          tone="amber"
        />
      </div>

      {token ? (
        points.length ? (
          <SalesMap points={points} token={token} brands={brands} />
        ) : (
          <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            Δεν υπάρχουν ακόμα πελάτες στον χάρτη για αυτή την επιλογή. Το geocoding των διευθύνσεων γίνεται αυτόματα κάθε ώρα.
          </div>
        )
      ) : (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Ο χάρτης δεν είναι ενεργός ακόμα (Mapbox). Η DGsoft τον ενεργοποιεί από τις ρυθμίσεις της πλατφόρμας.
        </div>
      )}

      <CubeTable
        tenantId={tenantId}
        rows={data.areas}
        columns={AREA_COLUMNS}
        storageKey="geo-areas"
        title={`Πωλήσεις ανά περιοχή ${period.from} – ${period.to}`}
        query={areasQuery as Record<string, unknown>}
        searchPlaceholder="Αναζήτηση πόλης, ΤΚ…"
        initialSort={{ id: G("revenue"), desc: true }}
      />
    </>
  );
}
