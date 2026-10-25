import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RotateCcw, XCircle } from "lucide-react";
import { DataTable } from "@/components/dg/data-table";
import { fmtDateTime, fmtNum } from "@/components/dg/format";
import { FormDialog } from "@/components/dg/form-dialog";
import { KpiTile } from "@/components/dg/kpi-tile";
import { PageHeader } from "@/components/dg/page-header";
import { Progress } from "@/components/dg/progress";
import { Grid, Section } from "@/components/dg/section";
import { StatusBadge } from "@/components/dg/status-badge";
import { Button } from "@/components/ui/button";
import { cancelJobAction, retryFailedJobAction } from "@/lib/actions/tenant";
import { getJob, listRuns } from "@/lib/data/tenant";
import { JOB_STATUS, RUN_STATUS } from "@/lib/labels";
import { can } from "@/lib/rbac";
import { requireTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Μαζική εργασία" };

export default async function JobPage({ params }: PageProps<"/t/[tenantId]/jobs/[id]">) {
  const { tenantId, id } = await params;
  const { user } = await requireTenant(tenantId);
  const job = await getJob(tenantId, id);
  if (!job) notFound();
  const items = await listRuns(tenantId, { jobId: job.id, take: 200 });
  const canRetry = can(user, "tenant.runs.retry", tenantId);

  return (
    <>
      <PageHeader
        crumbs={[{ href: `/t/${tenantId}/jobs`, label: "Μαζικές εργασίες" }]}
        title={job.name}
        description={`${job.methodName} · ${job.file} · ${fmtDateTime(job.createdAt)}`}
        actions={
          <>
            <StatusBadge status={job.status} map={JOB_STATUS} />
            {canRetry && job.failed > 0 && <FormDialog title="Επανάληψη αποτυχημένων" description={`${job.failed} γραμμές θα εκτελεστούν ξανά (χρεώνονται όσες πετύχουν).`} action={retryFailedJobAction.bind(null, tenantId, job.id)} submitLabel="Επανάληψη" size="sm" trigger={<Button size="sm" variant="outline"><RotateCcw aria-hidden /> Επανάληψη αποτυχημένων</Button>} />}
            {canRetry && (job.status === "RUNNING" || job.status === "PENDING") && (
              <FormDialog title="Ακύρωση εργασίας" description="Οι γραμμές σε ουρά δεν θα εκτελεστούν. Όσες τρέχουν τώρα ολοκληρώνονται." action={cancelJobAction.bind(null, tenantId, job.id)} destructive submitLabel="Ακύρωση εργασίας" size="sm" trigger={<Button size="sm" variant="outline" className="text-danger-500"><XCircle aria-hidden /> Ακύρωση</Button>} />
            )}
          </>
        }
      />
      <Section className="mb-4">
        <div aria-live="polite">
          <Progress total={job.total} done={job.done} failed={job.failed} label={`Πρόοδος ${job.name}`} />
        </div>
      </Section>
      <Grid cols={4}>
        <KpiTile label="Σύνολο" value={fmtNum(job.total)} />
        <KpiTile label="Ολοκληρώθηκαν" value={fmtNum(job.done - job.failed)} />
        <KpiTile label="Αποτυχίες" value={fmtNum(job.failed)} />
        <KpiTile label="Σε αναμονή" value={fmtNum(Math.max(job.total - job.done, 0))} />
      </Grid>
      <Section title="Γραμμές" className="mt-4">
        <DataTable
          rows={items}
          rowKey={(r) => r.id}
          empty={<p className="text-sm text-muted-foreground">Οι γραμμές εμφανίζονται όταν ο worker διαβάσει το αρχείο.</p>}
          columns={[
            { key: "r", header: "Γραμμή", cell: (r) => <Link href={`/t/${tenantId}/runs/${r.id}`} className="text-primary tabular-nums hover:underline">{(r.itemIndex ?? 0) + 2}</Link> },
            { key: "ref", header: "externalRef", cell: (r) => <code className="font-mono text-xs">{r.externalRef ?? "—"}</code> },
            { key: "s", header: "Κατάσταση", cell: (r) => <StatusBadge status={r.status} map={RUN_STATUS} /> },
            { key: "e", header: "Σφάλμα", cell: (r) => <span className="text-xs text-muted-foreground">{r.error?.message ?? "—"}</span> },
          ]}
        />
      </Section>
    </>
  );
}
