import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, ChartLine, ChartPie, FilePlus2, Lock, Rows3, Table2, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireDashboardTenant } from "@/lib/dashboards";
import { prisma } from "@/lib/prisma";
import type { ReportDefinition, ReportView } from "@/lib/report-types";
import { availableLibrary } from "@/lib/reports";

export const metadata: Metadata = { title: "Αναφορές" };

const VIEW_ICON: Record<ReportView, LucideIcon> = { pivot: Table2, table: Rows3, bar: BarChart3, line: ChartLine, area: ChartLine, pie: ChartPie };
const QUICK = [
  { key: "mtd", label: "Μήνας" },
  { key: "ytd", label: "Έτος" },
  { key: "12m", label: "12 μήνες" },
  { key: "last_year", label: "Πέρσι" },
];

export default async function ReportsPage({ params }: PageProps<"/dashboards/[tenantId]/reports">) {
  const { tenantId } = await params;
  const { user } = await requireDashboardTenant(tenantId, "reports");
  const [library, saved] = await Promise.all([
    availableLibrary(tenantId).catch(() => []),
    prisma.savedReport.findMany({
      where: { tenantId, OR: [{ userId: user.id }, { shared: true }] },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, description: true, shared: true, userId: true, updatedAt: true, definition: true },
    }),
  ]);
  const groups = [...new Set(library.map((r) => r.group))];
  const builder = `/dashboards/${tenantId}/reports/builder`;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Αναφορές</h1>
          <p className="text-xs text-muted-foreground">
            Έτοιμες αναφορές — διαλέξτε περίοδο και ανοίξτε τις· στον builder προσθέτετε κριτήρια (μάρκα, πελάτη, κατηγορία…), αλλάζετε γραμμές/στήλες,
            εμφάνιση (pivot, πίνακας, γράφημα) και εξάγετε σε Excel ή PDF.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href={builder}>
            <FilePlus2 /> Νέα αναφορά
          </Link>
        </Button>
      </div>

      {saved.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Αποθηκευμένες αναφορές</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {saved.map((r) => {
              const Icon = VIEW_ICON[(r.definition as ReportDefinition).view] ?? Table2;
              return (
                <Link key={r.id} href={`${builder}?id=${r.id}`} className="group rounded-xl border bg-card p-3 transition-shadow hover:shadow-md">
                  <div className="flex items-start gap-2">
                    <span className="rounded-md bg-primary/10 p-1.5 text-primary">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium group-hover:underline">{r.name}</div>
                      {r.description && <p className="line-clamp-2 text-xs text-muted-foreground">{r.description}</p>}
                      <p className="mt-1 flex items-center gap-1 text-2xs text-muted-foreground">
                        {r.shared ? <Users className="size-3" /> : <Lock className="size-3" />}
                        {r.shared ? (r.userId === user.id ? "Κοινή (δική σας)" : "Κοινή") : "Προσωπική"} · {r.updatedAt.toLocaleDateString("el-GR")}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {groups.map((g) => (
        <section key={g} className="space-y-2">
          <h2 className="text-sm font-semibold">{g}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {library
              .filter((r) => r.group === g)
              .map((r) => {
                const Icon = VIEW_ICON[r.definition.view];
                return (
                  <div key={r.key} className="flex flex-col rounded-xl border bg-card p-3">
                    <div className="flex items-start gap-2">
                      <span className="rounded-md bg-dg-red-50 p-1.5 text-dg-red-600 dark:bg-dg-red-900/40">
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link href={`${builder}?preset=${r.key}`} className="text-sm font-medium hover:underline">
                          {r.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{r.description}</p>
                      </div>
                    </div>
                    {r.definition.period && (
                      <div className="mt-auto flex flex-wrap items-center gap-1 pt-3">
                        <span className="mr-1 text-2xs text-muted-foreground">Περίοδος:</span>
                        {QUICK.map((q) => (
                          <Link
                            key={q.key}
                            href={`${builder}?preset=${r.key}&period=${q.key}`}
                            className="rounded-full border px-2 py-0.5 text-2xs hover:border-primary hover:bg-primary/5 hover:text-primary"
                          >
                            {q.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      ))}
    </>
  );
}
