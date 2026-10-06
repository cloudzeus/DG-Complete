import type { Metadata } from "next";
import { AlarmClock, CalendarClock, HandCoins, PhoneCall, Wallet } from "lucide-react";
import { ComboChart, DonutChart } from "@/components/charts/bi-charts";
import { ChartCard, Kpi } from "@/components/dashboards/blocks";
import { AiBrief } from "@/components/smart/ai-brief";
import { loadSmart, SmartError, SmartHeader } from "@/components/smart/smart-page";
import { SmartTable } from "@/components/smart/smart-table";
import { requireDashboardTenant } from "@/lib/dashboards";
import { eurCompact } from "@/lib/format";
import { collections } from "@/lib/smart/collections";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Βοηθός εισπράξεων" };

const BAND_TONE: Record<string, string> = {
  "Πολύ υψηλός": "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  Υψηλός: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  Μέτριος: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  Χαμηλός: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
};

export default async function CollectionsPage({ params }: PageProps<"/dashboards/[tenantId]/collections">) {
  const { tenantId } = await params;
  await requireDashboardTenant(tenantId, "collections");
  const { data: c, error } = await loadSmart(() => collections(tenantId));
  const week = (iso: string) => new Date(iso).toLocaleDateString("el-GR", { day: "numeric", month: "numeric" });

  return (
    <>
      <SmartHeader title="Βοηθός εισπράξεων" icon={HandCoins}>
        Από τις καρτέλες πελατών του SoftOne (πληρωμές αντιστοιχισμένες στα παλαιότερα τιμολόγια): πότε αναμένεται να πληρώσει κάθε πελάτης με βάση τη δική
        του συνήθεια, βαθμός κινδύνου 0–100, ομάδες συμπεριφοράς πληρωμών (data mining), προτεινόμενο πιστωτικό όριο, και ποιον να πάρετε τηλέφωνο σήμερα — με
        έτοιμο email υπενθύμισης από το AI.
      </SmartHeader>
      <SmartError error={error} />
      {c && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Απαιτήσεις από πελάτες" value={eurCompact(c.receivables)} hint={`πληρώνουν σε ~${c.medianPayDays} ημέρες (διάμεσος)`} icon={Wallet} tone="blue" />
            <Kpi label="Ληξιπρόθεσμα" value={eurCompact(c.overdue)} hint={`> 90 ημ.: ${eurCompact(c.overdue90)}`} icon={AlarmClock} tone="red" />
            <Kpi label="Αναμένονται σε 30 ημέρες" value={eurCompact(c.expected30)} hint="πρόβλεψη από τη συνήθεια κάθε πελάτη" icon={CalendarClock} tone="green" />
            <Kpi label="Αναμένονται σε 90 ημέρες" value={eurCompact(c.expected90)} icon={CalendarClock} tone="teal" />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <ChartCard className="lg:col-span-2" title="Αναμενόμενες εισπράξεις 13 εβδομάδων" description="Τιμολόγια που λήγουν (κατά τη συνήθεια του πελάτη) και καθυστερημένα που αναμένονται τις επόμενες 4 εβδομάδες">
              <ComboChart
                data={c.weeks.map((w) => ({ x: week(w.week), expected: w.expected, late: w.late }))}
                xKey="x"
                series={[
                  { key: "expected", label: "Στην ώρα τους", color: "var(--chart-3)", stack: "a" },
                  { key: "late", label: "Καθυστερημένα", color: "var(--chart-4)", stack: "a" },
                ]}
              />
            </ChartCard>
            <ChartCard title="Υπόλοιπα ανά κίνδυνο" description="Πόσα χρήματα σε κάθε βαθμίδα κινδύνου">
              <DonutChart data={c.bands.filter((b) => b.balance > 0).map((b) => ({ name: `${b.band} (${b.customers})`, value: b.balance }))} centerLabel="Υπόλοιπο" />
            </ChartCard>
          </div>

          <ChartCard title="Ομάδες συμπεριφοράς πληρωμών (k-means)" description="Ομαδοποίηση με βάση ημέρες πληρωμής, ποσοστό ληξιπρόθεσμων, υπόλοιπο έναντι τζίρου και αύξηση υπολοίπου">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {c.behaviours.map((b) => (
                <div key={b.name} className="rounded-lg border p-3 text-xs">
                  <div className="text-sm font-semibold">{b.name}</div>
                  <div className="text-muted-foreground">{b.customers} πελάτες</div>
                  <div className="mt-1 tabular-nums">
                    υπόλοιπο {eurCompact(b.balance)} · πληρώνουν σε ~{b.payDays} ημ.
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>

          <ChartCard title="Ποιον να πάρετε τηλέφωνο σήμερα" description="Ληξιπρόθεσμο × κίνδυνος — πατήστε για το σενάριο κλήσης και το email υπενθύμισης με AI">
            <ul className="divide-y">
              {c.callList.slice(0, 12).map((x, i) => (
                <li key={x.trdr} className="py-2.5">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-2xs font-semibold">{i + 1}</span>
                      <PhoneCall className="size-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{x.name}</span>
                        <span className="block truncate text-2xs text-muted-foreground">{x.reason}</span>
                      </span>
                      <span className="text-right text-xs tabular-nums">
                        <span className="block font-semibold">{eurCompact(x.overdue)}</span>
                        <span className={cn("inline-block rounded px-1.5 text-2xs", BAND_TONE[x.riskBand])}>
                          κίνδυνος {x.risk}
                        </span>
                      </span>
                    </summary>
                    <div className="mt-2 pl-9">
                      <p className="mb-2 text-xs text-muted-foreground">
                        Υπόλοιπο {eurCompact(x.balance)} · συνήθως πληρώνει σε {x.payDays ?? "—"} ημέρες · τελευταία πληρωμή {x.lastPayment ? new Date(x.lastPayment).toLocaleDateString("el-GR") : "—"} ·
                        προτεινόμενο όριο {eurCompact(x.creditLimit)}
                      </p>
                      <AiBrief tenantId={tenantId} kind="collections" refId={x.trdr} label="Σενάριο κλήσης & email με AI" />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </ChartCard>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Όλοι οι πελάτες με υπόλοιπο</h2>
            <SmartTable
              tenantId={tenantId}
              title="Εισπράξεις πελατών"
              idKey="trdr"
              rows={c.customers.map((x) => ({ ...x, details: [x.reason, x.nextPayment ? `Επόμενη αναμενόμενη πληρωμή: ${new Date(x.nextPayment).toLocaleDateString("el-GR")}` : ""].filter(Boolean) }))}
              detailKey="details"
              brief={{ kind: "collections", label: "Σενάριο κλήσης & email με AI" }}
              initialSort={{ key: "priority", desc: true }}
              searchPlaceholder="Πελάτης, κωδικός…"
              columns={[
                { key: "code", label: "Κωδικός" },
                { key: "name", label: "Πελάτης", wide: true },
                { key: "balance", label: "Υπόλοιπο", format: "eur" },
                { key: "overdue", label: "Ληξιπρόθ.", format: "eur" },
                { key: "overdue90", label: "> 90 ημ.", format: "eur" },
                { key: "payDays", label: "Πληρώνει σε", format: "int" },
                { key: "risk", label: "Κίνδυνος", format: "int" },
                { key: "riskBand", label: "Βαθμίδα" },
                { key: "behaviour", label: "Συμπεριφορά" },
                { key: "creditLimit", label: "Προτ. όριο", format: "eur" },
                { key: "overLimit", label: "Πάνω από όριο", format: "eur", excelOnly: true },
                { key: "lastPayment", label: "Τελ. πληρωμή", format: "date", excelOnly: true },
                { key: "nextPayment", label: "Επόμενη πληρωμή", format: "date", excelOnly: true },
                { key: "reason", label: "Αιτία", excelOnly: true },
                { key: "priority", label: "Προτεραιότητα", format: "eur", excelOnly: true },
              ]}
            />
          </div>
        </div>
      )}
    </>
  );
}
