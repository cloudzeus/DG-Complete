import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DataTable } from "@/components/dg/data-table";
import { DiffView } from "@/components/dg/diff-view";
import { fmtDateTime } from "@/components/dg/format";
import { PageHeader } from "@/components/dg/page-header";
import { Grid, Section } from "@/components/dg/section";
import { StatusBadge } from "@/components/dg/status-badge";
import { getWorkflow } from "@/lib/data/tenant";
import { VERSION_STATUS } from "@/lib/labels";
import { requireTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Εκδόσεις ροής" };

export default async function VersionsPage({ params }: PageProps<"/t/[tenantId]/workflows/[id]/versions">) {
  const { tenantId, id } = await params;
  await requireTenant(tenantId);
  const wf = await getWorkflow(tenantId, id);
  if (!wf) notFound();
  const base = `/t/${tenantId}/workflows`;
  const [latest, prev] = wf.versions;
  return (
    <>
      <PageHeader crumbs={[{ href: base, label: "Ροές" }, { href: `${base}/${wf.id}`, label: wf.name }]} title="Εκδόσεις" description="Οι δημοσιευμένες εκδόσεις είναι αμετάβλητες (checksum SHA‑256)." />
      <Grid cols={2}>
        <Section title="Ιστορικό">
          <DataTable
            rows={wf.versions}
            rowKey={(v) => v.id}
            columns={[
              { key: "v", header: "Έκδοση", cell: (v) => <span className="font-semibold tabular-nums">v{v.version}</span> },
              { key: "s", header: "Κατάσταση", cell: (v) => <StatusBadge status={v.status} map={VERSION_STATUS} /> },
              { key: "n", header: "Σημείωση", cell: (v) => <span>{v.note || "—"}<span className="block text-2xs text-muted-foreground">{v.author} · {fmtDateTime(v.createdAt)}</span></span> },
              { key: "c", header: "Checksum", cell: (v) => <code className="font-mono text-2xs">{v.checksum}</code>, hideOnMobile: true },
            ]}
          />
        </Section>
        <Section title="Διαφορές" description="Τελευταία έναντι προηγούμενης">
          {latest && <DiffView from={prev?.version ?? null} to={latest.version} before={prev?.definition ?? { steps: [] }} after={latest.definition} />}
        </Section>
      </Grid>
    </>
  );
}
