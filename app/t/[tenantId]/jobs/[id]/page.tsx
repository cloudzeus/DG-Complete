import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download, RotateCcw, XCircle } from "lucide-react";
import { DataTable } from "@/components/dg/data-table";
import { fmtDateTime, fmtNum } from "@/components/dg/format";
import { FormDialog } from "@/components/dg/form-dialog";
import { TextareaField } from "@/components/dg/fields";
import { KpiTile } from "@/components/dg/kpi-tile";
import { PageHeader } from "@/components/dg/page-header";
import { Progress } from "@/components/dg/progress";
import { Grid, Section } from "@/components/dg/section";
import { StatusBadge } from "@/components/dg/status-badge";
import { Button } from "@/components/ui/button";
import { JOB_STATUS, RUN_STATUS } from "@/lib/labels";
import { mockSubmit } from "@/lib/mock/actions";
import { byId, jobs, methodOf, runs } from "@/lib/mock/data";
import { requireTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Μαζική εργασία" };

export default async function JobPage({ params }: PageProps<"/t/[tenantId]/jobs/[id]">) {
  const { tenantId, id } = await params;
  await requireTenant(tenantId);
  const job = byId(jobs, id);
  if (!job) notFound();
  const act = (f: Parameters<typeof mockSubmit>[1]) => mockSubmit.bind(null, tenantId, f);
  const items = runs.slice(0, 8).map((r, i) => ({ ...r, row: i + 2 }));

  return (
    <>
      <PageHeader
        crumbs={[{ href: `/t/${tenantId}/jobs`, label: "Μαζικές εργασίες" }]}
        title={job.name}
        description={`${methodOf(job.methodId)?.name} · ${job.file} · ${fmtDateTime(job.createdAt)}`}
        actions={
          <>
            <StatusBadge status={job.status} map={JOB_STATUS} />
            {job.failed > 0 && <FormDialog title="Επανάληψη αποτυχημένων" description={`${job.failed} γραμμές θα εκτελεστούν ξανά.`} action={act("retryFailed")} submitLabel="Επανάληψη" size="sm" trigger={<Button size="sm" variant="outline"><RotateCcw aria-hidden /> Επανάληψη αποτυχημένων</Button>} />}
            <Button size="sm" variant="outline"><Download aria-hidden /> Εξαγωγή Excel</Button>
            {job.status === "RUNNING" && (
              <FormDialog title="Ακύρωση εργασίας" description="Οι γραμμές σε ουρά δεν θα εκτελεστούν. Όσες τρέχουν τώρα ολοκληρώνονται." action={act("cancel")} destructive submitLabel="Ακύρωση εργασίας" size="sm" trigger={<Button size="sm" variant="outline" className="text-danger-500"><XCircle aria-hidden /> Ακύρωση</Button>}>
                <TextareaField name="reason" label="Αιτία (προαιρετικά)" rows={2} />
              </FormDialog>
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
        <KpiTile label="Σε αναμονή" value={fmtNum(job.total - job.done)} />
      </Grid>
      <Section title="Γραμμές" className="mt-4">
        <DataTable
          rows={items}
          rowKey={(r) => r.id}
          columns={[
            { key: "r", header: "Γραμμή", cell: (r) => <span className="tabular-nums">{r.row}</span> },
            { key: "ref", header: "externalRef", cell: (r) => <code className="font-mono text-xs">{r.externalRef ?? "—"}</code> },
            { key: "s", header: "Κατάσταση", cell: (r) => <StatusBadge status={r.status} map={RUN_STATUS} /> },
            { key: "e", header: "Σφάλμα", cell: (r) => <span className="text-xs text-muted-foreground">{r.error?.message ?? "—"}</span> },
          ]}
        />
      </Section>
    </>
  );
}
