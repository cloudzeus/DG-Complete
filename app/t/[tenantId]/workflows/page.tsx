import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { DataTable } from "@/components/dg/data-table";
import { FilterBar } from "@/components/dg/filter-bar";
import { fmtDateTime } from "@/components/dg/format";
import { FormDialog } from "@/components/dg/form-dialog";
import { SelectField, TextField } from "@/components/dg/fields";
import { PageHeader } from "@/components/dg/page-header";
import { Section } from "@/components/dg/section";
import { StatusBadge } from "@/components/dg/status-badge";
import { Button } from "@/components/ui/button";
import { VERSION_STATUS, type VersionStatus } from "@/lib/labels";
import { mockSubmit } from "@/lib/mock/actions";
import { recordings, targetName, targets, workflows } from "@/lib/mock/data";
import { requireTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Ροές" };

export default async function WorkflowsPage({ params, searchParams }: PageProps<"/t/[tenantId]/workflows">) {
  const { tenantId } = await params;
  const sp = await searchParams;
  await requireTenant(tenantId);
  const base = `/t/${tenantId}`;
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const rows = workflows.filter((w) => (!q || w.name.toLowerCase().includes(q.toLowerCase())) && (!status || w.status === status));

  return (
    <>
      <PageHeader
        eyebrow="Σχεδιασμός"
        title="Ροές"
        description="Κάθε ροή έχει εκδόσεις· μόνο δημοσιευμένες εκδόσεις εκτελούνται από μεθόδους."
        actions={
          <FormDialog
            title="Νέα ροή"
            action={mockSubmit.bind(null, tenantId, "newWorkflow")}
            submitLabel="Δημιουργία"
            trigger={
              <Button size="sm">
                <Plus aria-hidden /> Νέα ροή
              </Button>
            }
          >
            <TextField name="name" label="Όνομα" required />
            <SelectField name="targetId" label="Σύστημα‑στόχος" required placeholder="Επιλέξτε…" options={targets.map((t) => ({ value: t.id, label: t.name }))} />
            <SelectField name="recordingId" label="Από καταγραφή (προαιρετικό)" placeholder="Κενή ροή" options={recordings.filter((r) => r.status !== "RECORDING").map((r) => ({ value: r.id, label: r.name }))} />
          </FormDialog>
        }
      />
      <Section>
        <FilterBar
          q={q}
          placeholder="Αναζήτηση ροής"
          selects={[{ name: "status", label: "Κατάσταση", value: status, options: (Object.keys(VERSION_STATUS) as VersionStatus[]).map((k) => ({ value: k, label: VERSION_STATUS[k].label })) }]}
        />
        <DataTable
          caption="Ροές"
          rows={rows}
          rowKey={(w) => w.id}
          columns={[
            {
              key: "n",
              header: "Ροή",
              cell: (w) => (
                <Link href={`${base}/workflows/${w.id}`} className="group block">
                  <span className="block font-medium group-hover:text-primary group-hover:underline">{w.name}</span>
                  <span className="block text-2xs text-muted-foreground">{targetName(w.targetId)}</span>
                </Link>
              ),
            },
            { key: "v", header: "Έκδοση", cell: (w) => <span className="tabular-nums">v{w.version}</span> },
            { key: "s", header: "Κατάσταση", cell: (w) => <StatusBadge status={w.status} map={VERSION_STATUS} /> },
            { key: "m", header: "Μέθοδοι", align: "right", cell: (w) => w.methods },
            { key: "u", header: "Ενημέρωση", align: "right", cell: (w) => <span>{fmtDateTime(w.updatedAt)}<span className="block text-2xs text-muted-foreground">{w.updatedBy}</span></span> },
          ]}
        />
      </Section>
    </>
  );
}
