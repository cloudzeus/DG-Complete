import type { Metadata } from "next";
import Link from "next/link";
import { MonitorCog } from "lucide-react";
import { DataTable } from "@/components/dg/data-table";
import { EmptyState } from "@/components/dg/empty-state";
import { FilterBar } from "@/components/dg/filter-bar";
import { fmtDateTime, fmtNum } from "@/components/dg/format";
import { PageHeader } from "@/components/dg/page-header";
import { Section } from "@/components/dg/section";
import { StatusBadge } from "@/components/dg/status-badge";
import { RowActions } from "@/components/dg/row-actions";
import { can } from "@/lib/rbac";
import { CreateTargetDialog, targetDelete } from "./shared";
import { listTargets } from "@/lib/data/tenant";
import { TARGET_HEALTH } from "@/lib/labels";
import { requireTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Συστήματα‑στόχοι" };

export default async function TargetsPage({ params, searchParams }: PageProps<"/t/[tenantId]/targets">) {
  const { tenantId } = await params;
  const { q } = await searchParams;
  const { user } = await requireTenant(tenantId);
  const canManage = can(user, "tenant.targets.manage", tenantId);
  const base = `/t/${tenantId}`;
  const rows = await listTargets(tenantId, typeof q === "string" ? q : undefined);

  return (
    <>
      <PageHeader eyebrow="Σχεδιασμός" title="Συστήματα‑στόχοι" description="Τα τρίτα web συστήματα, τα διαπιστευτήριά τους και τα όρια εκτέλεσης." actions={<CreateTargetDialog tenantId={tenantId} />} />
      <Section>
        <FilterBar q={typeof q === "string" ? q : undefined} placeholder="Αναζήτηση συστήματος" />
        <DataTable
          caption="Συστήματα‑στόχοι"
          rows={rows}
          rowKey={(t) => t.id}
          empty={<EmptyState icon={MonitorCog} title="Κανένα σύστημα" description="Προσθέστε το πρώτο σύστημα για να ξεκινήσετε καταγραφές." action={<CreateTargetDialog tenantId={tenantId} />} />}
          columns={[
            {
              key: "name",
              header: "Σύστημα",
              cell: (t) => (
                <Link href={`${base}/targets/${t.id}`} className="group block min-w-0">
                  <span className="block truncate font-medium group-hover:text-primary group-hover:underline">
                    {t.name}
                    {t.fromLibrary && <span className="ml-2 rounded-xs bg-sisyphus-50 px-1.5 py-0.5 text-2xs font-medium text-sisyphus-700">Από τη βιβλιοθήκη DG</span>}
                  </span>
                  <span className="block truncate font-mono text-2xs text-muted-foreground">{t.baseUrl}</span>
                </Link>
              ),
            },
            { key: "health", header: "Υγεία", cell: (t) => <StatusBadge status={t.health} map={TARGET_HEALTH} /> },
            { key: "sr", header: "Επιτυχία 7 ημ.", align: "right", cell: (t) => (t.successRate === null ? "—" : `${fmtNum(t.successRate, 1)}%`) },
            { key: "wf", header: "Ροές", align: "right", cell: (t) => t.workflows },
            { key: "cr", header: "Διαπιστευτήρια", align: "right", cell: (t) => t.credentials },
            { key: "last", header: "Τελευταία εκτέλεση", align: "right", cell: (t) => fmtDateTime(t.lastRunAt) },
            {
              key: "actions",
              header: "",
              align: "right",
              cell: (t) => (
                <RowActions
                  label={`Ενέργειες για ${t.name}`}
                  open={`${base}/targets/${t.id}`}
                  destroy={canManage ? targetDelete(tenantId, t) : undefined}
                />
              ),
            },
          ]}
        />
      </Section>
    </>
  );
}
