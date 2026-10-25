import type { Metadata } from "next";
import { DataTable } from "@/components/dg/data-table";
import { FilterBar } from "@/components/dg/filter-bar";
import { fmtDateTime } from "@/components/dg/format";
import { PageHeader } from "@/components/dg/page-header";
import { Section } from "@/components/dg/section";
import { listAudit } from "@/lib/data/tenant";
import { requireTenantAdmin } from "@/lib/tenant";

export const metadata: Metadata = { title: "Αρχείο ενεργειών" };

export default async function AuditPage({ params, searchParams }: PageProps<"/t/[tenantId]/settings/audit">) {
  const { tenantId } = await params;
  const { q } = await searchParams;
  await requireTenantAdmin(tenantId);
  const rows = await listAudit(tenantId, typeof q === "string" && q ? q : undefined);
  return (
    <>
      <PageHeader eyebrow="Διαχείριση" title="Αρχείο ενεργειών" description="Ποιος έκανε τι και πότε. Δεν τροποποιείται." />
      <Section>
        <FilterBar q={typeof q === "string" ? q : undefined} placeholder="Αναζήτηση χρήστη, ενέργειας" />
        <DataTable
          rows={rows}
          rowKey={(a) => a.id}
          empty={<p className="text-sm text-muted-foreground">Καμία ενέργεια.</p>}
          columns={[
            { key: "t", header: "Ώρα", cell: (a) => <span className="tabular-nums">{fmtDateTime(a.at)}</span> },
            { key: "u", header: "Χρήστης", cell: (a) => a.actor },
            { key: "a", header: "Ενέργεια", cell: (a) => <code className="font-mono text-xs">{a.action}</code> },
            { key: "e", header: "Αντικείμενο", cell: (a) => a.entity },
          ]}
        />
      </Section>
    </>
  );
}
