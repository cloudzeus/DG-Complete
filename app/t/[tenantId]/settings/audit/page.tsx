import type { Metadata } from "next";
import { DataTable } from "@/components/dg/data-table";
import { FilterBar } from "@/components/dg/filter-bar";
import { fmtDateTime } from "@/components/dg/format";
import { PageHeader } from "@/components/dg/page-header";
import { Section } from "@/components/dg/section";
import { auditLog } from "@/lib/mock/data";
import { requireTenantAdmin } from "@/lib/tenant";

export const metadata: Metadata = { title: "Αρχείο ενεργειών" };

export default async function AuditPage({ params, searchParams }: PageProps<"/t/[tenantId]/settings/audit">) {
  const { tenantId } = await params;
  const { q } = await searchParams;
  await requireTenantAdmin(tenantId);
  const query = typeof q === "string" ? q.toLowerCase() : "";
  const rows = auditLog.filter((a) => !query || `${a.actor} ${a.action} ${a.entity}`.toLowerCase().includes(query));
  return (
    <>
      <PageHeader eyebrow="Διαχείριση" title="Αρχείο ενεργειών" description="Ποιος έκανε τι και πότε. Δεν τροποποιείται." />
      <Section>
        <FilterBar q={typeof q === "string" ? q : undefined} placeholder="Αναζήτηση χρήστη, ενέργειας" />
        <DataTable
          rows={rows}
          rowKey={(a) => a.id}
          columns={[
            { key: "t", header: "Ώρα", cell: (a) => <span className="tabular-nums">{fmtDateTime(a.at)}</span> },
            { key: "u", header: "Χρήστης", cell: (a) => a.actor },
            { key: "a", header: "Ενέργεια", cell: (a) => <span className="font-medium">{a.action}</span> },
            { key: "e", header: "Αντικείμενο", cell: (a) => a.entity },
          ]}
        />
      </Section>
    </>
  );
}
