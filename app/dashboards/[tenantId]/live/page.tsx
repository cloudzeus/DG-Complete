import type { Metadata } from "next";
import { Clock, Receipt, ShoppingBag, TrendingUp, Users } from "lucide-react";
import { ComboChart, RankingChart } from "@/components/charts/bi-charts";
import { AutoRefresh } from "@/components/dashboards/auto-refresh";
import { ChartCard, DashboardErrors, Kpi } from "@/components/dashboards/blocks";
import { cubeLoadAll, num } from "@/lib/cube-client";
import { requireDashboardTenant } from "@/lib/dashboards";
import { eurCompact, eurFull, pct } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Σήμερα (live)" };
export const dynamic = "force-dynamic";

// Today, hour by hour: sales as they are entered in SoftOne (synced every 15 minutes), compared
// with the same weekday last week and the average of the last 4 same weekdays — up to this hour.
// Products and brands of the day come from the sales lines.

const S = (m: string) => `sales.${m}`;
const L = (m: string) => `sales_lines.${m}`;

/** Athens wall clock: the date (YYYY-MM-DD), weekday and hour now. */
function athensNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, hour: Number(parts.hour) };
}
const shift = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export default async function LivePage({ params }: PageProps<"/dashboards/[tenantId]/live">) {
  const { tenantId } = await params;
  await requireDashboardTenant(tenantId, "live");
  const { date: today, hour: nowHour } = athensNow();
  const lastWeek = shift(today, -7);
  const day = (d: string) => [{ dimension: S("date"), dateRange: [d, d] as [string, string] }];
  const lday = (d: string) => [{ dimension: L("date"), dateRange: [d, d] as [string, string] }];

  const [{ data, errors }, lastSync] = await Promise.all([
    cubeLoadAll(tenantId, {
      todayHours: { measures: [S("net"), S("invoices"), S("customers")], dimensions: [S("hour")], timeDimensions: day(today) },
      lastWeekHours: { measures: [S("net"), S("invoices")], dimensions: [S("hour")], timeDimensions: day(lastWeek) },
      // The 4 previous same weekdays, by day and hour.
      history: {
        measures: [S("net")],
        dimensions: [S("hour")],
        timeDimensions: [{ dimension: S("date"), granularity: "day", dateRange: [shift(today, -28), shift(today, -7)] }],
        limit: 5000,
      },
      latest: {
        measures: [S("net")],
        dimensions: [S("entry_time"), S("customer_name"), S("series_name")],
        timeDimensions: day(today),
        order: { [S("entry_time")]: "desc" },
        limit: 12,
      },
      products: {
        measures: [L("revenue"), L("quantity")],
        dimensions: [L("item_name")],
        timeDimensions: lday(today),
        order: { [L("revenue")]: "desc" },
        limit: 8,
      },
      brands: { measures: [L("revenue")], dimensions: [L("brand")], timeDimensions: lday(today), order: { [L("revenue")]: "desc" }, limit: 8 },
    }),
    prisma.syncRun.findFirst({
      where: { status: "SUCCESS", job: { name: "Παραστατικά πωλήσεων", connection: { tenantId } } },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    }),
  ]);

  const hours = Array.from({ length: 24 }, (_, h) => h);
  const at = (rows: typeof data.todayHours, h: number, m: string) => num(rows.find((r) => num(r[S("hour")]) === h)?.[S(m)]);
  // Average of the same weekday over the previous 4 weeks (days with the same ISO weekday as today).
  const sameDays = new Set([7, 14, 21, 28].map((d) => shift(today, -d)));
  const avg = hours.map((h) => {
    const rows = data.history.filter((r) => num(r[S("hour")]) === h && sameDays.has(String(r[`${S("date")}.day`]).slice(0, 10)));
    return rows.reduce((t, r) => t + num(r[S("net")]), 0) / 4;
  });

  // Business hours shown: from the first hour with sales (any series) to the last, at least 7–21.
  const active = hours.filter((h) => at(data.todayHours, h, "net") || at(data.lastWeekHours, h, "net") || avg[h]);
  const first = Math.min(7, ...active);
  const last = Math.max(21, ...active);
  const chart = hours
    .filter((h) => h >= first && h <= last)
    .map((h) => ({
      hour: `${String(h).padStart(2, "0")}:00`,
      today: h <= nowHour ? at(data.todayHours, h, "net") : 0,
      lastWeek: at(data.lastWeekHours, h, "net"),
      avg: Math.round(avg[h]),
    }));

  // Up to the current hour: like-for-like comparison of the day so far.
  const upTo = (vals: (h: number) => number) => hours.filter((h) => h <= nowHour).reduce((t, h) => t + vals(h), 0);
  const todayNet = upTo((h) => at(data.todayHours, h, "net"));
  const lastWeekNet = upTo((h) => at(data.lastWeekHours, h, "net"));
  const avgNet = upTo((h) => avg[h]);
  const invoices = upTo((h) => at(data.todayHours, h, "invoices"));
  const lastWeekInvoices = upTo((h) => at(data.lastWeekHours, h, "invoices"));
  const customers = data.todayHours.reduce((t, r) => t + num(r[S("customers")]), 0);
  const delta = (a: number, b: number) => (b ? `${a >= b ? "+" : ""}${pct(((a - b) / Math.abs(b)) * 100, 0)}` : "—");
  const best = chart.reduce((m, c) => (c.today > m.today ? c : m), chart[0] ?? { hour: "—", today: 0 });

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Σήμερα</h1>
          <p className="text-xs text-muted-foreground">
            {new Date(`${today}T12:00:00Z`).toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long" })} · έως τις{" "}
            {String(nowHour).padStart(2, "0")}:59 · σύγκριση με {new Date(`${lastWeek}T12:00:00Z`).toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "short" })}{" "}
            την ίδια ώρα
            {lastSync?.finishedAt &&
              ` · δεδομένα SoftOne έως ${lastSync.finishedAt.toLocaleTimeString("el-GR", { timeZone: "Europe/Athens", hour: "2-digit", minute: "2-digit" })}`}
          </p>
        </div>
        <AutoRefresh seconds={60} renderedAt={new Date().toISOString()} />
      </div>
      <DashboardErrors errors={errors} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Πωλήσεις σήμερα"
          value={eurCompact(todayNet)}
          hint={`${delta(todayNet, lastWeekNet)} από την περασμένη εβδομάδα · ${delta(todayNet, avgNet)} από τον μέσο όρο`}
          icon={TrendingUp}
          tone={todayNet >= lastWeekNet ? "green" : "red"}
        />
        <Kpi label="Παραστατικά" value={invoices.toLocaleString("el-GR")} hint={`την περασμένη εβδομάδα: ${lastWeekInvoices.toLocaleString("el-GR")}`} icon={Receipt} tone="blue" />
        <Kpi label="Πελάτες" value={customers.toLocaleString("el-GR")} hint={invoices ? `μέσο παραστατικό ${eurCompact(todayNet / invoices)}` : "—"} icon={Users} tone="teal" />
        <Kpi label="Καλύτερη ώρα" value={best?.today ? best.hour : "—"} hint={best?.today ? eurFull(best.today) : "καμία πώληση ακόμα"} icon={Clock} tone="amber" />
      </div>

      <ChartCard title="Πωλήσεις ανά ώρα" description="Σήμερα έναντι της ίδιας ημέρας την περασμένη εβδομάδα και του μέσου όρου των 4 προηγούμενων ίδιων ημερών">
        <ComboChart
          data={chart}
          xKey="hour"
          series={[
            { key: "today", label: "Σήμερα", color: "var(--chart-1)" },
            { key: "lastWeek", label: "Περασμένη εβδομάδα", color: "var(--chart-2)", type: "line", dashed: true },
            { key: "avg", label: "Μέσος όρος 4 εβδομάδων", color: "var(--chart-4)", type: "line" },
          ]}
        />
      </ChartCard>

      <div className="grid gap-5 lg:grid-cols-3">
        <ChartCard title="Τελευταία παραστατικά" description="Με τη σειρά που καταχωρήθηκαν">
          {data.latest.length === 0 ? (
            <p className="text-sm text-muted-foreground">Κανένα παραστατικό ακόμα σήμερα.</p>
          ) : (
            <ul className="divide-y text-sm">
              {data.latest.map((r, i) => (
                <li key={i} className="flex items-center gap-3 py-1.5">
                  <span className="w-11 shrink-0 text-xs text-muted-foreground tabular-nums">
                    {String(r[S("entry_time")] ?? "").slice(11, 16)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{String(r[S("customer_name")] ?? "—")}</span>
                    <span className="block truncate text-2xs text-muted-foreground">{String(r[S("series_name")] ?? "")}</span>
                  </span>
                  <span className={`shrink-0 tabular-nums ${num(r[S("net")]) < 0 ? "text-red-600" : ""}`}>{eurFull(num(r[S("net")]))}</span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
        <ChartCard title="Προϊόντα σήμερα" description="Κατά τζίρο">
          {data.products.length ? (
            <RankingChart data={data.products.map((r) => ({ name: String(r[L("item_name")] ?? "—"), value: num(r[L("revenue")]) }))} label="Τζίρος" />
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShoppingBag className="size-4" /> Δεν υπάρχουν ακόμα γραμμές για σήμερα.
            </p>
          )}
        </ChartCard>
        <ChartCard title="Μάρκες σήμερα" description="Κατά τζίρο">
          {data.brands.length ? (
            <RankingChart data={data.brands.map((r) => ({ name: String(r[L("brand")] ?? "—"), value: num(r[L("revenue")]) }))} label="Τζίρος" color="var(--chart-3)" />
          ) : (
            <p className="text-sm text-muted-foreground">Δεν υπάρχουν ακόμα πωλήσεις σήμερα.</p>
          )}
        </ChartCard>
      </div>
      <p className="text-xs text-muted-foreground">
        Τα παραστατικά έρχονται από το SoftOne κάθε 15 λεπτά· οι γραμμές ειδών (προϊόντα, μάρκες) μπορεί να ακολουθούν με λίγα λεπτά καθυστέρηση. Η
        σελίδα ανανεώνεται μόνη της κάθε λεπτό.
      </p>
    </>
  );
}
