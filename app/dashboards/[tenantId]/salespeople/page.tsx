import type { Metadata } from "next";
import { BadgeCheck, BadgePercent, Banknote, UserPlus } from "lucide-react";
import { MultiLineChart, RankingChart } from "@/components/charts/bi-charts";
import { ChartCard, Kpi } from "@/components/dashboards/blocks";
import { loadSmart, SmartError, SmartHeader } from "@/components/smart/smart-page";
import { SmartTable } from "@/components/smart/smart-table";
import { requireDashboardTenant } from "@/lib/dashboards";
import { eurCompact } from "@/lib/format";
import { usersPerformance } from "@/lib/smart/users";

export const metadata: Metadata = { title: "Απόδοση χρηστών" };

export default async function UsersPerformancePage({ params }: PageProps<"/dashboards/[tenantId]/salespeople">) {
  const { tenantId } = await params;
  await requireDashboardTenant(tenantId, "salespeople");
  const { data: u, error } = await loadSmart(() => usersPerformance(tenantId));
  const total = u ? u.users.reduce((a, x) => ({ rev: a.rev + x.revenue, list: a.list + x.listValue, disc: a.disc + x.discount, nc: a.nc + x.newCustomers }), { rev: 0, list: 0, disc: 0, nc: 0 }) : null;
  const monthLabel = (m: string) => new Date(`${m}-01`).toLocaleDateString("el-GR", { month: "short", year: "2-digit" });

  return (
    <>
      <SmartHeader title="Απόδοση χρηστών" icon={BadgeCheck}>
        Για κάθε χρήστη του SoftOne που καταχωρεί παραστατικά πωλήσεων (τελευταίοι 12 μήνες): τζίρος, μικτό περιθώριο, εκπτώσεις — ποσό και ποσοστό επί της
        αξίας τιμοκαταλόγου (τιμή × ποσότητα έναντι καθαρής αξίας γραμμής) — πελάτες και νέοι πελάτες, στυλ πώλησης (data mining) και αξιολόγηση με AI. Στο
        τέλος οι εκπτώσεις κάθε χρήστη ανά πελάτη.
      </SmartHeader>
      <SmartError error={error} />
      {u && !u.available && (
        <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Δεν υπάρχει ακόμα ο χρήστης καταχώρησης στα συγχρονισμένα παραστατικά. Θα εμφανιστεί μετά την επόμενη πλήρη ενημέρωση των παραστατικών πωλήσεων.
        </p>
      )}
      {u?.available && total && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Τζίρος 12 μηνών" value={eurCompact(total.rev)} hint={`${u.users.length} χρήστες`} icon={Banknote} tone="blue" />
            <Kpi label="Εκπτώσεις" value={eurCompact(total.disc)} hint={`${total.list ? ((total.disc / total.list) * 100).toFixed(1) : 0}% επί της τιμής πώλησης`} icon={BadgePercent} tone="amber" />
            <Kpi label="Νέοι πελάτες" value={String(total.nc)} hint="πρώτη αγορά στους 12 μήνες" icon={UserPlus} tone="green" />
            <Kpi label="Στυλ πώλησης" value={String(u.styles.length)} hint={u.styles.map((s) => s.name).join(" · ") || "—"} icon={BadgeCheck} tone="violet" />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard title="Εκπτώσεις ανά χρήστη" description="Ποσό έκπτωσης 12 μηνών">
              <RankingChart data={u.users.filter((x) => x.discount > 0).slice(0, 12).map((x) => ({ name: `${x.name} (${x.discountPct}%)`, value: x.discount }))} label="Έκπτωση" color="var(--chart-4)" />
            </ChartCard>
            <ChartCard title="Τζίρος ανά μήνα — 6 μεγαλύτεροι" description="Τελευταίοι 12 μήνες">
              <MultiLineChart
                data={u.monthly.map((m) => ({ ...m, month: monthLabel(String(m.month)) }))}
                xKey="month"
                series={u.topUsers.map((k) => ({ key: k, label: u.users.find((x) => `u${x.user}` === k)?.name ?? k }))}
                format="eur"
              />
            </ChartCard>
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Χρήστες</h2>
            <SmartTable
              tenantId={tenantId}
              title="Απόδοση χρηστών"
              idKey="user"
              rows={u.users}
              brief={{ kind: "user", label: "Αξιολόγηση & coaching με AI" }}
              initialSort={{ key: "revenue", desc: true }}
              searchPlaceholder="Χρήστης…"
              columns={[
                { key: "name", label: "Χρήστης", wide: true },
                { key: "revenue", label: "Τζίρος", format: "eur" },
                { key: "growthPct", label: "Μεταβολή", format: "pct", signed: true },
                { key: "marginPct", label: "Περιθώριο", format: "pct" },
                { key: "listValue", label: "Αξία καταλόγου", format: "eur" },
                { key: "discount", label: "Έκπτωση €", format: "eur" },
                { key: "discountPct", label: "Έκπτωση %", format: "pct" },
                { key: "discountLines", label: "Γραμμές με έκπτωση", format: "int", excelOnly: true },
                { key: "lines", label: "Γραμμές", format: "int", excelOnly: true },
                { key: "documents", label: "Παραστατικά", format: "int" },
                { key: "avgDocument", label: "Μέση αξία", format: "eur" },
                { key: "customers", label: "Πελάτες", format: "int" },
                { key: "newCustomers", label: "Νέοι", format: "int" },
                { key: "style", label: "Στυλ" },
                { key: "margin", label: "Μικτό κέρδος", format: "eur", excelOnly: true },
                { key: "revenuePrev", label: "Τζίρος πέρσι", format: "eur", excelOnly: true },
              ]}
            />
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Εκπτώσεις ανά χρήστη και πελάτη</h2>
            <SmartTable
              tenantId={tenantId}
              title="Εκπτώσεις χρηστών ανά πελάτη"
              idKey="key"
              rows={u.pairs.map((p) => ({ ...p, key: `${p.user}-${p.trdr}` }))}
              initialSort={{ key: "discount", desc: true }}
              searchPlaceholder="Χρήστης ή πελάτης…"
              columns={[
                { key: "userName", label: "Χρήστης" },
                { key: "customer", label: "Πελάτης", wide: true },
                { key: "listValue", label: "Αξία καταλόγου", format: "eur" },
                { key: "net", label: "Καθαρή αξία", format: "eur" },
                { key: "discount", label: "Έκπτωση €", format: "eur" },
                { key: "discountPct", label: "Έκπτωση %", format: "pct" },
                { key: "lines", label: "Γραμμές", format: "int" },
              ]}
            />
          </div>
        </div>
      )}
    </>
  );
}
