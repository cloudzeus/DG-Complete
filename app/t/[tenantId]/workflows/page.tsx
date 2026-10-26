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
import { deleteWorkflowAction, newWorkflowAction } from "@/lib/actions/tenant";
import { RowActions } from "@/components/dg/row-actions";
import { can } from "@/lib/rbac";
import { listRecordings, listWorkflows, targetOptions } from "@/lib/data/tenant";
import { EmptyState } from "@/components/dg/empty-state";
import { Waypoints } from "lucide-react";
import { requireTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Ροές" };

export default async function WorkflowsPage({ params, searchParams }: PageProps<"/t/[tenantId]/workflows">) {
  const { tenantId } = await params;
  const sp = await searchParams;
  const { user } = await requireTenant(tenantId);
  const canEdit = can(user, "tenant.workflows.edit", tenantId);
  const base = `/t/${tenantId}`;
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const [rows, targets, recordings] = await Promise.all([listWorkflows(tenantId, { q, status }), targetOptions(tenantId), listRecordings(tenantId)]);
  const convertible = recordings.filter((r) => !r.workflowId && r.status !== "RECORDING" && r.status !== "DISCARDED");

  return (
    <>
      <PageHeader
        eyebrow="Σχεδιασμός"
        title="Ροές"
        description="Κάθε ροή έχει εκδόσεις· μόνο δημοσιευμένες εκδόσεις εκτελούνται από μεθόδους."
        actions={
          <FormDialog
            title="Νέα ροή"
            action={newWorkflowAction.bind(null, tenantId)}
            submitLabel="Δημιουργία"
            trigger={
              <Button size="sm">
                <Plus aria-hidden /> Νέα ροή
              </Button>
            }
          >
            <TextField name="name" label="Όνομα" required />
            <SelectField name="targetId" label="Σύστημα‑στόχος" required placeholder="Επιλέξτε…" options={targets} />
            <SelectField name="recordingId" label="Από καταγραφή (προαιρετικό)" placeholder="Κενή ροή" defaultValue={from} options={convertible.map((r) => ({ value: r.id, label: `${r.name} · ${r.target}` }))} />
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
          empty={<EmptyState icon={Waypoints} title="Καμία ροή" description="Δημιουργήστε ροή από μια καταγραφή ή κενή." />}
          columns={[
            {
              key: "n",
              header: "Ροή",
              cell: (w) => (
                <Link href={`${base}/workflows/${w.id}`} className="group block">
                  <span className="block font-medium group-hover:text-primary group-hover:underline">{w.name}</span>
                  <span className="block text-2xs text-muted-foreground">{w.target}</span>
                </Link>
              ),
            },
            { key: "v", header: "Έκδοση", cell: (w) => <span className="tabular-nums">v{w.version}</span> },
            { key: "s", header: "Κατάσταση", cell: (w) => <StatusBadge status={w.status} map={VERSION_STATUS} /> },
            { key: "m", header: "Μέθοδοι", align: "right", cell: (w) => w.methods },
            { key: "u", header: "Ενημέρωση", align: "right", cell: (w) => <span>{fmtDateTime(w.updatedAt)}<span className="block text-2xs text-muted-foreground">{w.updatedBy}</span></span> },
            {
              key: "actions",
              header: "",
              align: "right",
              cell: (w) => (
                <RowActions
                  label={`Ενέργειες για ${w.name}`}
                  open={`${base}/workflows/${w.id}`}
                  destroy={canEdit ? workflowDelete(tenantId, w) : undefined}
                />
              ),
            },
          ]}
        />
      </Section>
    </>
  );
}

function workflowDelete(tenantId: string, w: { id: string; name: string; methods: number }) {
  return {
    title: `Διαγραφή «${w.name}»`,
    description: `Θα διαγραφούν όλες οι εκδόσεις${w.methods ? `, ${w.methods} μέθοδοι API` : ""} και οι εκτελέσεις της ροής. Η ενέργεια δεν αναιρείται.`,
    action: deleteWorkflowAction.bind(null, tenantId, w.id),
    submitLabel: "Οριστική διαγραφή",
  };
}
