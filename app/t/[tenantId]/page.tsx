import type { Metadata } from "next";
import Link from "next/link";
import { Activity, CircleCheck, Hourglass, Timer } from "lucide-react";
import { StackedBars } from "@/components/dg/bar-chart";
import { DataTable } from "@/components/dg/data-table";
import { fmtDateTime, fmtNum } from "@/components/dg/format";
import { KpiTile } from "@/components/dg/kpi-tile";
import { PageHeader } from "@/components/dg/page-header";
import { Screenshot } from "@/components/dg/screenshot";
import { Grid, Section } from "@/components/dg/section";
import { StatusBadge } from "@/components/dg/status-badge";
import { Button } from "@/components/ui/button";
import { RUN_STATUS } from "@/lib/labels";
import { dashboardStats, listMethods, listRuns } from "@/lib/data/tenant";
import { requireTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Πίνακας ελέγχου" };

export default async function TenantDashboard({ params }: PageProps<"/t/[tenantId]">) {
  const { tenantId } = await params;
  const { tenant, access } = await requireTenant(tenantId);
  const base = `/t/${tenant.id}`;
  const [dashboard, methods, runs, failed] = await Promise.all([
    dashboardStats(tenant.id),
    listMethods(tenant.id),
    listRuns(tenant.id, { take: 6 }),
    listRuns(tenant.id, { status: "FAILED", take: 3 }),
  ]);
  const worst = methods.filter((m) => m.calls7d > 0).sort((a, b) => b.errorRate - a.errorRate).slice(0, 4);

  return (
    <>
      <PageHeader
        eyebrow="Επισκόπηση"
        title="Πίνακας ελέγχου"
        description={`${tenant.name} · ${access.planName ? `πακέτο ${access.planName}` : "χωρίς πακέτο"}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`${base}/runs`}>Όλες οι εκτελέσεις</Link>
          </Button>
        }
      />
      <Grid cols={4}>
        <KpiTile label="Εκτελέσεις σήμερα" value={fmtNum(dashboard.today)} hint="από 00:00" icon={Activity} />
        <KpiTile label="Ποσοστό επιτυχίας" value={dashboard.successRate === null ? "—" : `${fmtNum(dashboard.successRate, 1)}%`} hint="τελευταίες 24 ώρες" icon={CircleCheck} />
        <KpiTile label="Μέσος χρόνος" value={dashboard.avgSeconds === null ? "—" : `${fmtNum(dashboard.avgSeconds, 1)}″`} hint="ανά εκτέλεση" icon={Timer} />
        <KpiTile label="Σε ουρά" value={fmtNum(dashboard.queued)} hint="περιμένουν worker" icon={Hourglass} />
      </Grid>

      <div className="mt-4 grid gap-4 *:min-w-0 xl:grid-cols-3">
        <Section title="Εκτελέσεις 14 ημερών" description="Επιτυχίες και αποτυχίες ανά ημέρα" className="xl:col-span-2">
          <StackedBars label="Εκτελέσεις ανά ημέρα, τελευταίες 14 ημέρες" data={dashboard.series.map((d) => ({ label: d.day, succeeded: d.succeeded, failed: d.failed }))} />
        </Section>
        <Section title="Μέθοδοι με τα περισσότερα σφάλματα" description="Τελευταίες 7 ημέρες">
          {worst.length === 0 && <p className="text-sm text-muted-foreground">Καμία εκτέλεση μεθόδου τις τελευταίες 7 ημέρες.</p>}
          <ul className="divide-y divide-border/60">
            {worst.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <Link href={`${base}/collections/${m.collectionId}/methods/${m.id}`} className="min-w-0 hover:text-primary hover:underline">
                  <span className="block truncate text-sm font-medium">{m.name}</span>
                  <span className="block font-mono text-2xs text-muted-foreground">{m.key}</span>
                </Link>
                <span className={`shrink-0 text-sm font-semibold tabular-nums ${m.errorRate > 5 ? "text-danger-500" : ""}`}>{fmtNum(m.errorRate, 1)}%</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title="Πρόσφατες αποτυχίες" className="mt-4">
        {failed.length === 0 && <p className="text-sm text-muted-foreground">Καμία αποτυχία πρόσφατα.</p>}
        <div className="grid gap-4 *:min-w-0 md:grid-cols-3">
          {failed.map((r) => (
            <Link key={r.id} href={`${base}/runs/${r.id}`} className="group space-y-2 rounded-lg border border-border/70 p-3 transition-shadow duration-150 hover:shadow-fluent-4">
              <Screenshot alt={`Στιγμιότυπο σφάλματος — ${r.methodName}`} />
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium group-hover:text-primary">{r.methodName}</span>
                <StatusBadge status={r.status} map={RUN_STATUS} />
              </div>
              <p className="line-clamp-2 text-xs text-muted-foreground">{r.error?.message}</p>
              <p className="text-2xs text-muted-foreground tabular-nums">{fmtDateTime(r.createdAt)}</p>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="Τελευταίες εκτελέσεις" className="mt-4">
        <DataTable
          caption="Τελευταίες εκτελέσεις"
          rows={runs}
          rowKey={(r) => r.id}
          columns={[
            { key: "m", header: "Μέθοδος", cell: (r) => <Link className="font-medium hover:text-primary hover:underline" href={`${base}/runs/${r.id}`}>{r.methodName}</Link> },
            { key: "s", header: "Κατάσταση", cell: (r) => <StatusBadge status={r.status} map={RUN_STATUS} /> },
            { key: "ref", header: "externalRef", cell: (r) => <span className="font-mono text-xs">{r.externalRef ?? "—"}</span> },
            { key: "t", header: "Ώρα", align: "right", cell: (r) => fmtDateTime(r.createdAt) },
          ]}
        />
      </Section>
    </>
  );
}
