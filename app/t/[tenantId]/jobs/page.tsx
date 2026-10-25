import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { DataTable } from "@/components/dg/data-table";
import { fmtDateTime } from "@/components/dg/format";
import { PageHeader } from "@/components/dg/page-header";
import { Progress } from "@/components/dg/progress";
import { Section } from "@/components/dg/section";
import { StatusBadge } from "@/components/dg/status-badge";
import { Button } from "@/components/ui/button";
import { JOB_STATUS } from "@/lib/labels";
import { listJobs } from "@/lib/data/tenant";
import { EmptyState } from "@/components/dg/empty-state";
import { ClipboardList } from "lucide-react";
import { requireTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Μαζικές εργασίες" };

export default async function JobsPage({ params }: PageProps<"/t/[tenantId]/jobs">) {
  const { tenantId } = await params;
  await requireTenant(tenantId);
  const base = `/t/${tenantId}/jobs`;
  const jobs = await listJobs(tenantId);
  return (
    <>
      <PageHeader
        eyebrow="Εκτέλεση"
        title="Μαζικές εργασίες"
        description="Εκτέλεση μιας μεθόδου για κάθε γραμμή ενός Excel / CSV."
        actions={
          <Button asChild size="sm">
            <Link href={`${base}/new`}>
              <Plus aria-hidden /> Νέα εργασία
            </Link>
          </Button>
        }
      />
      <Section>
        <DataTable
          rows={jobs}
          rowKey={(j) => j.id}
          empty={<EmptyState icon={ClipboardList} title="Καμία μαζική εργασία" description="Εκτελέστε μια μέθοδο για κάθε γραμμή ενός Excel / CSV." />}
          columns={[
            { key: "n", header: "Εργασία", cell: (j) => <Link href={`${base}/${j.id}`} className="group block"><span className="block font-medium group-hover:text-primary group-hover:underline">{j.name}</span><span className="block text-2xs text-muted-foreground">{j.methodName} · {j.file}</span></Link> },
            { key: "s", header: "Κατάσταση", cell: (j) => <StatusBadge status={j.status} map={JOB_STATUS} /> },
            { key: "p", header: "Πρόοδος", className: "md:w-64", cell: (j) => <Progress total={j.total} done={j.done} failed={j.failed} label={`Πρόοδος ${j.name}`} /> },
            { key: "t", header: "Δημιουργία", align: "right", cell: (j) => <span>{fmtDateTime(j.createdAt)}<span className="block text-2xs text-muted-foreground">{j.createdBy}</span></span> },
          ]}
        />
      </Section>
    </>
  );
}
