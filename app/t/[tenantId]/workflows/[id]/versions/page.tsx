import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DataTable } from "@/components/dg/data-table";
import { fmtDateTime } from "@/components/dg/format";
import { PageHeader } from "@/components/dg/page-header";
import { Grid, Section } from "@/components/dg/section";
import { DiffView } from "@/components/dg/diff-view";
import { StatusBadge } from "@/components/dg/status-badge";
import { VERSION_STATUS } from "@/lib/labels";
import { byId, versions, workflows } from "@/lib/mock/data";
import { requireTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Εκδόσεις ροής" };

export default async function VersionsPage({ params }: PageProps<"/t/[tenantId]/workflows/[id]/versions">) {
  const { tenantId, id } = await params;
  await requireTenant(tenantId);
  const wf = byId(workflows, id);
  if (!wf) notFound();
  const base = `/t/${tenantId}/workflows`;
  return (
    <>
      <PageHeader crumbs={[{ href: base, label: "Ροές" }, { href: `${base}/${wf.id}`, label: wf.name }]} title="Εκδόσεις" description="Οι δημοσιευμένες εκδόσεις είναι αμετάβλητες (checksum SHA‑256)." />
      <Grid cols={2}>
        <Section title="Ιστορικό">
          <DataTable
            rows={versions}
            rowKey={(v) => String(v.version)}
            columns={[
              { key: "v", header: "Έκδοση", cell: (v) => <span className="font-semibold tabular-nums">v{v.version}</span> },
              { key: "s", header: "Κατάσταση", cell: (v) => <StatusBadge status={v.status} map={VERSION_STATUS} /> },
              { key: "n", header: "Σημείωση", cell: (v) => <span>{v.note}<span className="block text-2xs text-muted-foreground">{v.author} · {fmtDateTime(v.createdAt)}</span></span> },
              { key: "c", header: "Checksum", cell: (v) => <code className="font-mono text-2xs">{v.checksum}</code>, hideOnMobile: true },
            ]}
          />
        </Section>
        <Section title="Διαφορές" description="Τελευταία έναντι προηγούμενης">
          <DiffView from={3} to={4} />
        </Section>
      </Grid>
    </>
  );
}
