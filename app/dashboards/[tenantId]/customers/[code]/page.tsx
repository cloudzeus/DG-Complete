import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, Receipt, TrendingUp, Wallet } from "lucide-react";
import { Sparkline } from "@/components/charts/bi-charts";
import { ChartCard, DashboardErrors, Kpi } from "@/components/dashboards/blocks";
import { CubeTable, type ListColumn } from "@/components/dashboards/cube-table";
import { cubeLoadAll, num, type CubeQuery } from "@/lib/cube-client";
import { requireDashboardTenant } from "@/lib/dashboards";
import { customerActivity } from "@/lib/kad";
import { eurCompact, eurFull, MONTHS_SHORT, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Προφίλ πελάτη" };

// Customer profile: who they are (segment, risk, payments) and what they buy — monthly purchases
// per brand over 24 months, brand and category mix this year vs last, top products.

const S = (m: string) => `sales_lines.${m}`;
const C = (m: string) => `customers.${m}`;

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default async function CustomerProfilePage({ params }: PageProps<"/dashboards/[tenantId]/customers/[code]">) {
  const { tenantId, code: raw } = await params;
  const { access } = await requireDashboardTenant(tenantId, "customers");
  const code = decodeURIComponent(raw);
  const activity = access.services.has("industry") ? await customerActivity(tenantId, code).catch(() => null) : null;

  const now = new Date();
  const today = iso(now);
  const from24 = iso(new Date(now.getFullYear(), now.getMonth() - 23, 1));
  const from12 = iso(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() + 1));
  const from24d = iso(new Date(now.getFullYear() - 2, now.getMonth(), now.getDate() + 1));
  const to12prev = iso(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()));
  const who = [{ member: S("customer_code"), operator: "equals", values: [code] }];
  const range = (a: string, b: string) => [{ dimension: S("date"), dateRange: [a, b] as [string, string] }];

  const productsQuery: CubeQuery = {
    measures: [S("revenue"), S("quantity"), S("documents"), S("margin_pct")],
    dimensions: [S("item_code"), S("item_name"), S("brand")],
    timeDimensions: range(from12, today),
    filters: who,
    order: { [S("revenue")]: "desc" },
    limit: 200,
  };

  const { data, errors } = await cubeLoadAll(tenantId, {
    profile: {
      dimensions: [
        C("customer_name"),
        C("city"),
        C("segment"),
        C("churn_risk"),
        C("payment_grade"),
        C("payment_days"),
        C("open_balance"),
        C("overdue_90_amount"),
        C("revenue"),
        C("revenue_prev"),
        C("growth_percent"),
        C("margin_percent"),
        C("invoices_12m"),
        C("avg_days_between"),
        C("last_purchase"),
        C("expected_next_purchase"),
        C("recency_days"),
      ],
      filters: [{ member: C("customer_code"), operator: "equals", values: [code] }],
      limit: 1,
    },
    monthlyBrand: {
      measures: [S("revenue")],
      dimensions: [S("brand")],
      timeDimensions: [{ dimension: S("date"), granularity: "month", dateRange: [from24, today] }],
      filters: who,
      limit: 5000,
    },
    brandsNow: { measures: [S("revenue"), S("quantity"), S("documents")], dimensions: [S("brand")], timeDimensions: range(from12, today), filters: who, limit: 500 },
    brandsPrev: { measures: [S("revenue")], dimensions: [S("brand")], timeDimensions: range(from24d, to12prev), filters: who, limit: 500 },
    categories: {
      measures: [S("revenue"), S("margin_pct")],
      dimensions: [S("category")],
      timeDimensions: range(from12, today),
      filters: who,
      order: { [S("revenue")]: "desc" },
      limit: 12,
    },
    products: productsQuery,
  });
  const p = data.profile[0];
  if (!p && !data.brandsNow.length && !data.monthlyBrand.length) notFound();

  // 24 calendar months, oldest first.
  const months = Array.from({ length: 24 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - 23 + i, 1));
  const keyOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
  const byBrand = new Map<string, number[]>();
  for (const r of data.monthlyBrand) {
    const d = new Date(String(r[`${S("date")}.month`]));
    const i = months.findIndex((m) => keyOf(m) === keyOf(d));
    if (i < 0) continue;
    const b = String(r[S("brand")]);
    const arr = byBrand.get(b) ?? Array(24).fill(0);
    arr[i] += num(r[S("revenue")]);
    byBrand.set(b, arr);
  }
  const ranked = [...byBrand.entries()].sort((a, b) => b[1].reduce((x, y) => x + y, 0) - a[1].reduce((x, y) => x + y, 0));

  // Brand mix: last 12 months vs the 12 before, share and trend.
  const prev = new Map(data.brandsPrev.map((r) => [String(r[S("brand")]), num(r[S("revenue")])]));
  const totalNow = data.brandsNow.reduce((t, r) => t + num(r[S("revenue")]), 0);
  const brandNames = new Set([...data.brandsNow.map((r) => String(r[S("brand")])), ...prev.keys()]);
  const mix = [...brandNames]
    .map((b) => {
      const r = data.brandsNow.find((x) => String(x[S("brand")]) === b);
      const now12 = num(r?.[S("revenue")]);
      const before = prev.get(b) ?? 0;
      return {
        brand: b,
        now12,
        before,
        change: before > 0 ? ((now12 - before) / before) * 100 : null,
        share: totalNow ? (100 * now12) / totalNow : 0,
        docs: num(r?.[S("documents")]),
        trend: byBrand.get(b)?.slice(12) ?? [],
      };
    })
    .filter((x) => x.now12 > 0 || x.before > 0)
    .sort((a, b) => b.now12 - a.now12 || b.before - a.before);
  const growing = mix.filter((m) => m.change !== null && m.change >= 25 && m.now12 > 0.05 * totalNow).slice(0, 3);
  const dropped = mix.filter((m) => m.before > 0 && m.now12 <= 0).sort((a, b) => b.before - a.before).slice(0, 3);
  const falling = mix.filter((m) => m.change !== null && m.change <= -40 && m.now12 > 0).sort((a, b) => b.before - a.before).slice(0, 3);

  const productColumns: ListColumn[] = [
    { key: S("item_code"), label: "Κωδικός", size: 120 },
    { key: S("item_name"), label: "Είδος", grow: true },
    { key: S("brand"), label: "Μάρκα", size: 120 },
    { key: S("revenue"), label: "Τζίρος 12μ", format: "eur" },
    { key: S("quantity"), label: "Ποσότητα", format: "num", size: 95 },
    { key: S("documents"), label: "Φορές", format: "int", size: 80 },
    { key: S("margin_pct"), label: "Περιθώριο %", format: "pct", size: 100 },
  ];

  const name = String(p?.[C("customer_name")] ?? code);
  const growth = num(p?.[C("growth_percent")]);

  return (
    <>
      <div className="space-y-1">
        <Link href={`/dashboards/${tenantId}/customers`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Πελάτες
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">{name}</h1>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>
            {code}
            {p?.[C("city")] ? ` · ${p[C("city")]}` : ""}
          </span>
          {p?.[C("segment")] && <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">{String(p[C("segment")])}</span>}
          {p?.[C("churn_risk")] && p[C("churn_risk")] !== "Χαμηλός" && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">Κίνδυνος απώλειας: {String(p[C("churn_risk")])}</span>
          )}
          {p?.[C("payment_grade")] && <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">Πληρωμές: {String(p[C("payment_grade")])}</span>}
        </div>
      </div>
      <DashboardErrors errors={errors} />

      {activity && (
        <div className="rounded-xl border bg-card p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Δραστηριότητα:</span>
            <span>
              {activity.mainKadDescr ?? "—"} <span className="text-xs text-muted-foreground">({activity.mainKad})</span>
            </span>
            {activity.segment && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">Κλάδος: {activity.segment}</span>}
            {activity.active === false && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Ανενεργό ΑΦΜ</span>}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            ΑΦΜ {activity.afm}
            {activity.legal && ` · ${activity.legal}`}
            {activity.title && ` · διακριτικός τίτλος «${activity.title}»`}
          </div>
          {activity.kads.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-primary">{activity.kads.length} δευτερεύουσες δραστηριότητες</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                {activity.kads.map((k) => (
                  <li key={k.code}>
                    {k.descr} ({k.code})
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Τζίρος 12 μηνών"
          value={eurCompact(num(p?.[C("revenue")]))}
          hint={p?.[C("growth_percent")] !== null && p?.[C("growth_percent")] !== undefined ? `${growth >= 0 ? "+" : ""}${pct(growth, 0)} από πέρσι` : "πέρσι: —"}
          icon={TrendingUp}
          tone={growth >= 0 ? "green" : "red"}
        />
        <Kpi
          label="Συχνότητα αγορών"
          value={`${num(p?.[C("invoices_12m")]).toLocaleString("el-GR")} παραστατικά`}
          hint={p?.[C("avg_days_between")] ? `συνήθως κάθε ${Math.round(num(p[C("avg_days_between")]))} ημέρες` : ""}
          icon={Receipt}
          tone="blue"
        />
        <Kpi
          label="Τελευταία αγορά"
          value={p?.[C("last_purchase")] ? new Date(String(p[C("last_purchase")])).toLocaleDateString("el-GR") : "—"}
          hint={
            p?.[C("expected_next_purchase")] ? `αναμενόμενη επόμενη ${new Date(String(p[C("expected_next_purchase")])).toLocaleDateString("el-GR")}` : ""
          }
          icon={CalendarClock}
          tone="violet"
        />
        <Kpi
          label="Υπόλοιπο"
          value={eurCompact(num(p?.[C("open_balance")]))}
          hint={`> 90 ημ.: ${eurCompact(num(p?.[C("overdue_90_amount")]))}${num(p?.[C("payment_days")]) > 0 ? ` · πληρώνει σε ~${Math.round(num(p?.[C("payment_days")]))} ημ.` : ""}`}
          icon={Wallet}
          tone={num(p?.[C("overdue_90_amount")]) > 0 ? "red" : "slate"}
        />
      </div>

      {(growing.length > 0 || falling.length > 0 || dropped.length > 0) && (
        <div className="rounded-xl border bg-card p-4 text-sm">
          <div className="mb-2 font-medium">Τι αλλάζει στις αγορές του</div>
          <ul className="space-y-1">
            {growing.map((m) => (
              <li key={`g-${m.brand}`}>
                <span className="font-medium text-emerald-700">↑ {m.brand}</span>: {eurFull(m.now12)} τους τελευταίους 12 μήνες ({m.change !== null ? `+${Math.round(m.change)}%` : ""}) —
                αγοράζει περισσότερο.
              </li>
            ))}
            {falling.map((m) => (
              <li key={`f-${m.brand}`}>
                <span className="font-medium text-amber-700">↓ {m.brand}</span>: από {eurFull(m.before)} σε {eurFull(m.now12)} ({Math.round(m.change ?? 0)}%) — ευκαιρία
                για επικοινωνία ή προσφορά.
              </li>
            ))}
            {dropped.map((m) => (
              <li key={`d-${m.brand}`}>
                <span className="font-medium text-red-700">✕ {m.brand}</span>: αγόραζε {eurFull(m.before)} τον προηγούμενο χρόνο και τίποτα φέτος — ίσως αγοράζει
                από αλλού.
              </li>
            ))}
          </ul>
        </div>
      )}

      <ChartCard
        title="Τι αγόρασε, ποιον μήνα"
        description="Τελευταίοι 24 μήνες · κάθε κελί = αγορές της μάρκας τον μήνα (πιο σκούρο = μεγαλύτερο ποσό, κόκκινο = επιστροφή) · κενό = καμία αγορά"
      >
        <BrandMonthGrid
          months={months.map((m) => `${MONTHS_SHORT[m.getMonth()]} ${String(m.getFullYear()).slice(2)}`)}
          rows={[
            ...ranked.slice(0, 10).map(([b, arr]) => ({ label: b, values: arr })),
            ...(ranked.length > 10 ? [{ label: `Άλλες ${ranked.length - 10} μάρκες`, values: months.map((_, i) => ranked.slice(10).reduce((t, [, arr]) => t + arr[i], 0)) }] : []),
          ]}
        />
      </ChartCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Μάρκες — φέτος έναντι πέρσι" description="Τελευταίοι 12 μήνες έναντι των 12 προηγούμενων">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b text-left">
                  <th className="py-2 pr-2 font-medium">Μάρκα</th>
                  <th className="py-2 pr-2 font-medium">Τάση 12μ</th>
                  <th className="py-2 pr-2 text-right font-medium">12μ</th>
                  <th className="py-2 pr-2 text-right font-medium">Πέρσι</th>
                  <th className="py-2 pr-2 text-right font-medium">Μεταβολή</th>
                  <th className="py-2 text-right font-medium">Μερίδιο</th>
                </tr>
              </thead>
              <tbody>
                {mix.slice(0, 15).map((m) => (
                  <tr key={m.brand} className="border-b last:border-0">
                    <td className="max-w-40 truncate py-1.5 pr-2 font-medium">{m.brand}</td>
                    <td className="w-24 py-1.5 pr-2">{m.trend.some((v) => v > 0) && <Sparkline values={m.trend} className="h-6 w-20" />}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{eurCompact(m.now12)}</td>
                    <td className="py-1.5 pr-2 text-right text-muted-foreground tabular-nums">{eurCompact(m.before)}</td>
                    <td
                      className={cn(
                        "py-1.5 pr-2 text-right font-medium tabular-nums",
                        m.change === null ? "text-muted-foreground" : m.change >= 0 ? "text-emerald-700" : "text-red-600",
                      )}
                    >
                      {m.change === null ? (m.now12 > 0 ? "νέα" : "—") : `${m.change >= 0 ? "+" : ""}${Math.round(m.change)}%`}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{pct(m.share, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
        <ChartCard title="Κατηγορίες" description="Τελευταίοι 12 μήνες">
          <ul className="space-y-2 text-sm">
            {data.categories.map((r) => {
              const v = num(r[S("revenue")]);
              const max = num(data.categories[0]?.[S("revenue")]) || 1;
              return (
                <li key={String(r[S("category")])}>
                  <div className="flex justify-between gap-2">
                    <span className="truncate">{String(r[S("category")])}</span>
                    <span className="shrink-0 tabular-nums">
                      {eurCompact(v)} <span className="text-xs text-muted-foreground">· {pct(num(r[S("margin_pct")]), 0)}</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${Math.max(2, (100 * v) / max)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </ChartCard>
      </div>

      <CubeTable
        tenantId={tenantId}
        rows={data.products}
        columns={productColumns}
        storageKey="customer-products"
        title={`Προϊόντα που αγοράζει ${name}`}
        query={productsQuery as Record<string, unknown>}
        searchPlaceholder="Αναζήτηση είδους, μάρκας…"
        initialSort={{ id: S("revenue"), desc: true }}
      />
    </>
  );
}

/** Brand × month grid: shading by amount, yearly totals at the end, a total row at the bottom. */
function BrandMonthGrid({ months, rows }: { months: string[]; rows: { label: string; values: number[] }[] }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">Καμία αγορά τους τελευταίους 24 μήνες.</p>;
  const total = months.map((_, i) => rows.reduce((t, r) => t + r.values[i], 0));
  const max = Math.max(1, ...rows.flatMap((r) => r.values.map(Math.abs)));
  const sum = (v: number[], a: number, b: number) => v.slice(a, b).reduce((t, x) => t + x, 0);
  const cell = (v: number, strong: boolean, yearStart: boolean) => {
    const edge = yearStart && "border-l-2 border-foreground/20";
    if (Math.abs(v) < 0.5) return <td className={cn("h-7 min-w-11 rounded-sm bg-muted/40", edge)} />;
    const t = Math.min(1, Math.abs(v) / max);
    const bg = v < 0 ? `rgba(220, 38, 38, ${0.15 + 0.5 * t})` : `rgba(37, 99, 235, ${0.12 + 0.75 * t})`;
    return (
      <td className={cn("h-7 min-w-11 rounded-sm px-1 text-center tabular-nums", t > 0.55 && v > 0 ? "text-white" : "text-foreground", strong && "font-semibold", edge)} style={{ background: bg }} title={eurFull(v)}>
        {eurCompact(v).replace(" €", "")}
      </td>
    );
  };
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-2xs">
        <thead>
          <tr className="text-muted-foreground">
            <th />
            {months.map((m, i) => (
              <th key={m} className={cn("px-0.5 pb-1 font-medium whitespace-nowrap", i === 12 && "border-l-2 border-foreground/20")}>
                {m}
              </th>
            ))}
            <th className="border-l-2 border-foreground/20 px-1.5 pb-1 font-semibold whitespace-nowrap">Προηγ. 12μ</th>
            <th className="px-1.5 pb-1 font-semibold whitespace-nowrap">Τελευτ. 12μ</th>
          </tr>
        </thead>
        <tbody>
          {[...rows, { label: "Σύνολο", values: total }].map((r, ri) => {
            const isTotal = ri === rows.length;
            const a = sum(r.values, 0, 12);
            const b = sum(r.values, 12, 24);
            return (
              <tr key={r.label} className={cn(isTotal && "font-semibold")}>
                <th className={cn("sticky left-0 max-w-40 truncate bg-card pr-2 text-left text-xs font-medium", isTotal && "font-semibold")} title={r.label}>
                  {r.label}
                </th>
                {r.values.map((v, i) => (
                  <Fragment key={i}>{cell(v, isTotal, i === 12)}</Fragment>
                ))}
                <td className="border-l-2 border-foreground/20 px-1.5 text-right tabular-nums">{Math.abs(a) < 0.5 ? "—" : eurCompact(a)}</td>
                <td className="px-1.5 text-right tabular-nums">
                  {Math.abs(b) < 0.5 ? "—" : eurCompact(b)}
                  {Math.abs(a) >= 0.5 && (
                    <span className={cn("ml-1", b >= a ? "text-emerald-700" : "text-red-600")}>{`${b >= a ? "+" : "−"}${Math.abs(Math.round(((b - a) / Math.abs(a)) * 100))}%`}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
