import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Table2 } from "lucide-react";
import { RecordsTable } from "@/app/admin/settings/sync/[id]/records-table";
import { PageHeader } from "@/components/admin/page-header";
import { StatusPill } from "@/components/admin/tone";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { buildWarehouseLookups } from "@/lib/warehouse-lookups";
import { readRows } from "@/lib/warehouse-writer";

export const metadata: Metadata = { title: "Δεδομένα" };

const LIMIT = 10_000;

export default async function TenantDataPage({ params }: PageProps<"/admin/tenants/[id]/data/[jobId]">) {
  const { id, jobId } = await params;
  await requirePermission("tenants.read");
  const job = await prisma.syncJob.findFirst({
    where: { id: jobId, destination: "WAREHOUSE", connection: { tenantId: id } },
    include: { connection: { select: { tenant: { select: { name: true } } } } },
  });
  if (!job || !job.targetTable) notFound();

  const fields = Object.keys((job.columns ?? {}) as Record<string, string>);
  const [{ rows, total }, lookups] = await Promise.all([
    readRows(id, job.targetTable, LIMIT),
    buildWarehouseLookups(id, job.targetTable, fields),
  ]);
  // Warehouse columns are lower-case; the viewer works with SoftOne field names.
  const data = rows.map((r) => Object.fromEntries(fields.map((f) => [f, r[f.toLowerCase()] instanceof Date ? (r[f.toLowerCase()] as Date).toISOString() : r[f.toLowerCase()]])));

  return (
    <>
      <Link href={`/admin/tenants/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {job.connection.tenant?.name ?? "Tenant"}
      </Link>
      <PageHeader
        eyebrow="Αποθήκη δεδομένων tenant"
        title={job.name}
        description={`${total.toLocaleString("el-GR")} εγγραφές${total > LIMIT ? ` · εμφανίζονται οι πρώτες ${LIMIT.toLocaleString("el-GR")}` : ""}`}
        icon={Table2}
        tone="violet"
        actions={
          job.lastRunAt ? (
            <StatusPill tone={job.lastStatus === "FAILED" ? "red" : "green"}>
              Συγχρ. {job.lastRunAt.toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short" })}
            </StatusPill>
          ) : null
        }
      />
      <Card>
        <CardContent>
          <RecordsTable jobId={job.id} table={job.table} fields={fields} keyField={job.keyField} rows={data} lookups={lookups} />
        </CardContent>
      </Card>
    </>
  );
}
