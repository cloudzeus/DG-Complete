import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Table2 } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { StatusPill } from "@/components/admin/tone";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { buildLookups } from "@/lib/softone-lookups";
import { RecordsTable } from "./records-table";

const LIMIT = 10_000;

export async function generateMetadata({ params }: PageProps<"/admin/settings/sync/[id]">): Promise<Metadata> {
  const { id } = await params;
  const job = await prisma.syncJob.findUnique({ where: { id }, select: { name: true } });
  return { title: job?.name ?? "Δεδομένα" };
}

export default async function SyncRecordsPage({ params }: PageProps<"/admin/settings/sync/[id]">) {
  await requirePermission("platform.settings.manage");
  const { id } = await params;
  const job = await prisma.syncJob.findUnique({ where: { id } });
  if (!job) notFound();

  const fields = job.fields.split(",").filter(Boolean);
  let rows: Record<string, unknown>[];
  let total: number;
  if (job.type === "CUSTOMERS") {
    const customers = await prisma.s1Customer.findMany({ where: { connectionId: job.connectionId }, orderBy: { name: "asc" }, take: LIMIT });
    total = await prisma.s1Customer.count({ where: { connectionId: job.connectionId } });
    rows = customers.map((c) => ({
      TRDR: c.trdr,
      CODE: c.code,
      NAME: c.name,
      AFM: c.afm,
      EMAIL: c.email,
      PHONE01: c.phone,
      ADDRESS: c.address,
      CITY: c.city,
      ZIP: c.zip,
      ISACTIVE: c.isActive ? 1 : 0,
      UPDDATE: c.s1UpdatedAt?.toISOString() ?? null,
    }));
  } else {
    const records = await prisma.s1Record.findMany({ where: { jobId: job.id }, orderBy: { key: "asc" }, take: LIMIT, select: { data: true } });
    total = await prisma.s1Record.count({ where: { jobId: job.id } });
    rows = records.map((r) => r.data as Record<string, unknown>);
  }

  const lookups = job.type === "TABLE" ? await buildLookups(job) : {};

  return (
    <>
      <Link
        href="/admin/settings/sync"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Συγχρονισμοί
      </Link>
      <PageHeader
        eyebrow="SoftOne DGsoft"
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
          <RecordsTable jobId={job.id} table={job.table} fields={fields} keyField={job.keyField} rows={rows} lookups={lookups} />
        </CardContent>
      </Card>
    </>
  );
}
