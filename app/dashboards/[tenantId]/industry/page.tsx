import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Factory, Percent, TrendingUp, Users } from "lucide-react";
import { ComboChart, RankingChart } from "@/components/charts/bi-charts";
import { ChartCard, DashboardErrors, Kpi } from "@/components/dashboards/blocks";
import { CubeTable, type ListColumn } from "@/components/dashboards/cube-table";
import { KimonText } from "@/components/kimon/kimon-text";
import { cubeLoadAll, num, type CubeQuery } from "@/lib/cube-client";
import { requireDashboardTenant } from "@/lib/dashboards";
import { eurCompact, eurFull, MONTHS_SHORT, pct } from "@/lib/format";
import type { Segment } from "@/lib/industry";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { ProfileButton } from "./profile-button";

export const metadata: Metadata = { title: "Κλάδοι πελατών" };

// Customers by industry segment (main ΚΑΔ → AI segments): which segments buy what, when, how much
// per customer — and an AI profile per segment to decide whom to target.

const I = (m: string) => `industry_sales.${m}`;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default async function IndustryPage({ params, searchParams }: PageProps<"/dashboards/[tenantId]/industry">) {
  const { tenantId } = await params;
  await requireDashboardTenant(tenantId, "industry");
  const sp = await searchParams;
  const seg = await prisma.industrySegmentation.findUnique({ where: { tenantId } });
  const segments = (seg?.segments ?? []) as Segment[];
  const key = typeof sp.segment === "string" && segments.some((s) => s.key === sp.segment) ? sp.segment : null;

  if (!segments.length) {
    return (
      <>
        <h1 className="text-xl font-semibold tracking-tight">Κλάδοι πελατών</h1>
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Οι κλάδοι δεν έχουν δημιουργηθεί ακόμα: χρειάζεται πρώτα η άντληση των ΚΑΔ των πελατών από το μητρώο και μετά η κατηγοριοποίηση με
          AI. Η DGsoft τα ενεργοποιεί για εσάς.
        </div>
      </>
    );
  }

  const now = new Date();
  const today = iso(now);
  const y1 = iso(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() + 1));
  const y2 = iso(new Date(now.getFullYear() - 2, now.getMonth(), now.getDate() + 1));
  const y1end = iso(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()));
  const td = (a: string, b: string) => [{ dimension: I("date"), dateRange: [a, b] as [string, string] }];
  const name = new Map(segments.map((s) => [s.key, s]));

  if (!key) {
    // ── Overview: every segment side by side.
    const { data, errors } = await cubeLoadAll(tenantId, {
      now: { measures: [I("revenue"), I("customers"), I("revenue_per_customer"), I("margin_pct"), I("documents")], dimensions: [I("segment_key")], timeDimensions: td(y1, today), limit: 100 },
      prev: { measures: [I("revenue")], dimensions: [I("segment_key")], timeDimensions: td(y2, y1end), limit: 100 },
      total: { measures: [I("revenue"), I("customers"), I("revenue_per_customer")], timeDimensions: td(y1, today) },
    });
    const total = num(data.total[0]?.[I("revenue")]);
    const prev = new Map(data.prev.map((r) => [String(r[I("segment_key")]), num(r[I("revenue")])]));
    const rows = data.now
      .map((r) => {
        const k = String(r[I("segment_key")]);
        const revenue = num(r[I("revenue")]);
        const before = prev.get(k) ?? 0;
        return {
          key: k,
          name: name.get(k)?.name ?? (k === "unknown" ? "Χωρίς ΚΑΔ" : k),
          description: name.get(k)?.description ?? "",
          revenue,
          customers: num(r[I("customers")]),
          perCustomer: num(r[I("revenue_per_customer")]),
          margin: num(r[I("margin_pct")]),
          growth: before ? ((revenue - before) / before) * 100 : null,
          share: total ? (100 * revenue) / total : 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
    const avg = num(data.total[0]?.[I("revenue_per_customer")]);
    const known = rows.filter((r) => r.key !== "unknown");
    const best = [...known].sort((a, b) => b.perCustomer - a.perCustomer)[0];
    const fastest = [...known].filter((r) => r.growth !== null && r.revenue > 0.02 * total).sort((a, b) => (b.growth ?? 0) - (a.growth ?? 0))[0];

    return (
      <>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Κλάδοι πελατών</h1>
          <p className="text-xs text-muted-foreground">
            Τελευταίοι 12 μήνες · κλάδοι από τον κύριο ΚΑΔ κάθε πελάτη, προσαρμοσμένοι στην επιχείρησή σας · {segments.length} κλάδοι
          </p>
        </div>
        <DashboardErrors errors={errors} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Κλάδοι" value={String(known.length)} hint={`${num(data.total[0]?.[I("customers")]).toLocaleString("el-GR")} πελάτες με αγορές`} icon={Factory} tone="violet" />
          <Kpi label="Μέσος τζίρος / πελάτη" value={eurCompact(avg)} hint="όλοι οι κλάδοι" icon={Users} tone="blue" />
          <Kpi
            label="Πιο «αξιόλογος» πελάτης"
            value={best?.name ?? "—"}
            hint={best ? `${eurCompact(best.perCustomer)} ανά πελάτη (${best.perCustomer > avg ? "+" : ""}${pct(((best.perCustomer - avg) / (avg || 1)) * 100, 0)})` : ""}
            icon={TrendingUp}
            tone="green"
          />
          <Kpi label="Ταχύτερη ανάπτυξη" value={fastest?.name ?? "—"} hint={fastest?.growth != null ? `+${pct(fastest.growth, 0)} από πέρσι` : ""} icon={Percent} tone="amber" />
        </div>

        <ChartCard title="Τζίρος ανά κλάδο" description="Τελευταίοι 12 μήνες">
          <RankingChart data={rows.map((r) => ({ name: r.name, value: r.revenue }))} label="Τζίρος" color="var(--chart-5)" />
        </ChartCard>

        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Κλάδος</th>
                <th className="px-3 py-2 text-right font-medium">Πελάτες</th>
                <th className="px-3 py-2 text-right font-medium">Τζίρος 12μ</th>
                <th className="px-3 py-2 text-right font-medium">Μερίδιο</th>
                <th className="px-3 py-2 text-right font-medium">Ανά πελάτη</th>
                <th className="px-3 py-2 text-right font-medium">Περιθώριο</th>
                <th className="px-3 py-2 text-right font-medium">Μεταβολή</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t align-top">
                  <td className="max-w-md px-3 py-2">
                    {r.key === "unknown" ? (
                      <span className="font-medium text-muted-foreground">{r.name}</span>
                    ) : (
                      <Link href={`/dashboards/${tenantId}/industry?segment=${r.key}`} className="font-medium text-primary underline-offset-4 hover:underline">
                        {r.name}
                      </Link>
                    )}
                    {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.customers.toLocaleString("el-GR")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{eurCompact(r.revenue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(r.share, 1)}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", r.perCustomer > avg * 1.2 && "font-semibold text-emerald-700")}>{eurCompact(r.perCustomer)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(r.margin, 1)}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", r.growth === null ? "text-muted-foreground" : r.growth >= 0 ? "text-emerald-700" : "text-red-600")}>
                    {r.growth === null ? "νέος" : `${r.growth >= 0 ? "+" : ""}${pct(r.growth, 0)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  // ── One segment in depth.
  const segment = name.get(key)!;
  const f = [{ member: I("segment_key"), operator: "equals", values: [key] }];
  const customersQuery: CubeQuery = {
    measures: [I("revenue"), I("documents"), I("margin_pct")],
    dimensions: [I("customer_code"), I("customer_name"), I("city"), I("main_kad_descr")],
    timeDimensions: td(y1, today),
    filters: f,
    order: { [I("revenue")]: "desc" },
    limit: 500,
  };
  const { data, errors } = await cubeLoadAll(tenantId, {
    totals: { measures: [I("revenue"), I("customers"), I("revenue_per_customer"), I("margin_pct"), I("documents")], timeDimensions: td(y1, today), filters: f },
    prev: { measures: [I("revenue")], timeDimensions: td(y2, y1end), filters: f },
    all: { measures: [I("revenue"), I("revenue_per_customer"), I("margin_pct")], timeDimensions: td(y1, today) },
    months: { measures: [I("revenue")], timeDimensions: [{ dimension: I("date"), granularity: "month", dateRange: [iso(new Date(now.getFullYear() - 2, now.getMonth() + 1, 1)), today] }], filters: f },
    allMonths: { measures: [I("revenue")], timeDimensions: [{ dimension: I("date"), granularity: "month", dateRange: [iso(new Date(now.getFullYear() - 2, now.getMonth() + 1, 1)), today] }] },
    categories: { measures: [I("revenue")], dimensions: [I("category")], timeDimensions: td(y1, today), filters: f, order: { [I("revenue")]: "desc" }, limit: 10 },
    brands: { measures: [I("revenue")], dimensions: [I("brand")], timeDimensions: td(y1, today), filters: f, order: { [I("revenue")]: "desc" }, limit: 10 },
    kads: { measures: [I("customers"), I("revenue")], dimensions: [I("main_kad_descr")], timeDimensions: td(y1, today), filters: f, order: { [I("revenue")]: "desc" }, limit: 10 },
    customers: customersQuery,
  });
  const t = data.totals[0] ?? {};
  const a = data.all[0] ?? {};
  const revenue = num(t[I("revenue")]);
  const before = num(data.prev[0]?.[I("revenue")]);
  const perCustomer = num(t[I("revenue_per_customer")]);
  const avgPer = num(a[I("revenue_per_customer")]);
  // Seasonality: the segment's share of each month vs its share of the whole period (index, 100 = normal).
  const allByMonth = new Map(data.allMonths.map((r) => [String(r[`${I("date")}.month`]).slice(0, 7), num(r[I("revenue")])]));
  const segTotal = data.months.reduce((s, r) => s + num(r[I("revenue")]), 0);
  const allTotal = [...allByMonth.values()].reduce((s, v) => s + v, 0);
  const chart = data.months.map((r) => {
    const m = String(r[`${I("date")}.month`]).slice(0, 7);
    const d = new Date(`${m}-01T12:00:00Z`);
    const v = num(r[I("revenue")]);
    const share = (allByMonth.get(m) ?? 0) ? v / (allByMonth.get(m) ?? 1) : 0;
    return { month: `${MONTHS_SHORT[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`, revenue: v, index: segTotal && allTotal ? Math.round((100 * share) / (segTotal / allTotal)) : 0 };
  });
  const profile = ((seg?.profiles ?? {}) as Record<string, { text: string; at: string }>)[key];

  return (
    <>
      <div className="space-y-1">
        <Link href={`/dashboards/${tenantId}/industry`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Όλοι οι κλάδοι
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">{segment.name}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{segment.description}</p>
      </div>
      <DashboardErrors errors={errors} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Τζίρος 12 μηνών"
          value={eurCompact(revenue)}
          hint={before ? `${revenue >= before ? "+" : ""}${pct(((revenue - before) / before) * 100, 0)} από πέρσι · ${pct((100 * revenue) / (num(a[I("revenue")]) || 1), 1)} του συνόλου` : ""}
          icon={TrendingUp}
          tone={revenue >= before ? "green" : "red"}
        />
        <Kpi label="Πελάτες" value={num(t[I("customers")]).toLocaleString("el-GR")} hint={`${num(t[I("documents")]).toLocaleString("el-GR")} παραστατικά`} icon={Users} tone="blue" />
        <Kpi
          label="Μέσος τζίρος / πελάτη"
          value={eurCompact(perCustomer)}
          hint={`σύνολο: ${eurCompact(avgPer)} (${perCustomer >= avgPer ? "+" : ""}${pct(((perCustomer - avgPer) / (avgPer || 1)) * 100, 0)})`}
          icon={Factory}
          tone="violet"
        />
        <Kpi label="Περιθώριο" value={pct(num(t[I("margin_pct")]), 1)} hint={`σύνολο: ${pct(num(a[I("margin_pct")]), 1)}`} icon={Percent} tone="amber" />
      </div>

      <ChartCard title="Προφίλ κλάδου" description="Γραμμένο από τον Κίμωνα με βάση τα στοιχεία της σελίδας">
        {profile ? (
          <div className="space-y-3">
            <KimonText text={profile.text} />
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{new Date(profile.at).toLocaleString("el-GR")}</span>
              <ProfileButton tenantId={tenantId} segment={key} again />
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>Ποιοι είναι, τι αγοράζουν, πότε, πόσο αξίζουν και πώς να τους προσεγγίσετε.</span>
            <ProfileButton tenantId={tenantId} segment={key} again={false} />
          </div>
        )}
      </ChartCard>

      <ChartCard title="Εποχικότητα" description="Τζίρος του κλάδου ανά μήνα · δείκτης 100 = το συνηθισμένο μερίδιο του κλάδου, πάνω = μήνας αιχμής">
        <ComboChart
          data={chart}
          xKey="month"
          series={[
            { key: "revenue", label: "Τζίρος", color: "var(--chart-5)" },
            { key: "index", label: "Δείκτης εποχικότητας", color: "var(--chart-2)", type: "line", rightAxis: "count" },
          ]}
        />
      </ChartCard>

      <div className="grid gap-5 lg:grid-cols-3">
        <ChartCard title="Τι αγοράζουν" description="Κατηγορίες, 12 μήνες">
          <RankingChart data={data.categories.map((r) => ({ name: String(r[I("category")]), value: num(r[I("revenue")]) }))} label="Τζίρος" />
        </ChartCard>
        <ChartCard title="Μάρκες" description="12 μήνες">
          <RankingChart data={data.brands.map((r) => ({ name: String(r[I("brand")]), value: num(r[I("revenue")]) }))} label="Τζίρος" color="var(--chart-3)" />
        </ChartCard>
        <ChartCard title="Δραστηριότητες" description="Κύριοι ΚΑΔ του κλάδου">
          <ul className="space-y-1.5 text-sm">
            {data.kads.map((r) => (
              <li key={String(r[I("main_kad_descr")])} className="flex justify-between gap-2">
                <span className="line-clamp-2">{String(r[I("main_kad_descr")])}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {num(r[I("customers")])} πελ. · {eurCompact(num(r[I("revenue")]))}
                </span>
              </li>
            ))}
          </ul>
        </ChartCard>
      </div>

      <CubeTable
        tenantId={tenantId}
        rows={data.customers}
        columns={
          [
            { key: I("customer_code"), label: "Κωδικός", size: 110 },
            { key: I("customer_name"), label: "Πελάτης", grow: true, link: `/dashboards/${tenantId}/customers/{${I("customer_code")}}` },
            { key: I("city"), label: "Πόλη", size: 120 },
            { key: I("main_kad_descr"), label: "Δραστηριότητα", size: 260 },
            { key: I("revenue"), label: "Τζίρος 12μ", format: "eur" },
            { key: I("documents"), label: "Παραστατικά", format: "int", size: 105 },
            { key: I("margin_pct"), label: "Περιθώριο %", format: "pct", size: 100 },
          ] satisfies ListColumn[]
        }
        storageKey="industry-customers"
        title={`Πελάτες — ${segment.name}`}
        query={customersQuery as Record<string, unknown>}
        searchPlaceholder="Αναζήτηση πελάτη, δραστηριότητας…"
        initialSort={{ id: I("revenue"), desc: true }}
      />
      <p className="text-xs text-muted-foreground">Μέσος τζίρος συνόλου: {eurFull(avgPer)} ανά πελάτη.</p>
    </>
  );
}
