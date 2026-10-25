import type { Metadata } from "next";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { DataTable } from "@/components/dg/data-table";
import { fmtDate, fmtDateTime } from "@/components/dg/format";
import { FormDialog } from "@/components/dg/form-dialog";
import { CheckboxGroup, FormRow, TextareaField, TextField } from "@/components/dg/fields";
import { PageHeader } from "@/components/dg/page-header";
import { Section } from "@/components/dg/section";
import { Tag } from "@/components/dg/status-badge";
import { Button } from "@/components/ui/button";
import { API_SCOPES } from "@/lib/labels";
import { createApiKeyAction, revokeApiKeyAction } from "@/lib/actions/tenant";
import { listApiKeys, listCollections } from "@/lib/data/tenant";
import { EmptyState } from "@/components/dg/empty-state";
import { requireTenantAdmin } from "@/lib/tenant";

export const metadata: Metadata = { title: "Κλειδιά API" };

export default async function ApiKeysPage({ params }: PageProps<"/t/[tenantId]/settings/api-keys">) {
  const { tenantId } = await params;
  await requireTenantAdmin(tenantId);
  const [apiKeys, collections] = await Promise.all([listApiKeys(tenantId), listCollections(tenantId)]);
  const colName = new Map(collections.map((c) => [c.id, c.name]));
  return (
    <>
      <PageHeader
        eyebrow="Διαχείριση"
        title="Κλειδιά API"
        description="Το κλειδί εμφανίζεται μία φορά κατά τη δημιουργία· αποθηκεύεται μόνο το hash του."
        actions={
          <FormDialog title="Νέο κλειδί API" action={createApiKeyAction.bind(null, tenantId)} submitLabel="Δημιουργία" size="lg" trigger={<Button size="sm"><Plus aria-hidden /> Νέο κλειδί</Button>}>
            <TextField name="name" label="Όνομα" required placeholder="π.χ. ERP παραγωγής" />
            <CheckboxGroup name="scopes" label="Δικαιώματα" required columns={2} defaultValues={["runs:write", "runs:read"]} options={API_SCOPES.map((s) => ({ value: s.key, label: s.label, hint: s.key }))} />
            <CheckboxGroup name="collections" label="Συλλογές" hint="Καμία επιλογή = όλες οι συλλογές." columns={2} options={collections.map((c) => ({ value: c.id, label: c.name }))} />
            <FormRow>
              <TextField name="expiresAt" label="Λήξη" type="date" hint="Κενό = χωρίς λήξη" />
              <TextareaField name="ipAllowlist" label="Επιτρεπτές IP" rows={2} mono placeholder="203.0.113.10/32" />
            </FormRow>
          </FormDialog>
        }
      />
      <Section>
        <DataTable
          rows={apiKeys}
          rowKey={(k) => k.id}
          empty={<EmptyState icon={KeyRound} title="Κανένα κλειδί" description="Δημιουργήστε κλειδί για να καλείτε μεθόδους από τις εφαρμογές σας." />}
          columns={[
            { key: "n", header: "Κλειδί", cell: (k) => <span className="inline-flex items-center gap-2"><KeyRound aria-hidden className="size-4 text-muted-foreground" /><span><span className="block font-medium">{k.name}</span><code className="font-mono text-2xs text-muted-foreground">{k.prefix}…</code></span></span> },
            { key: "s", header: "Δικαιώματα", cell: (k) => <span className="flex flex-wrap gap-1">{k.scopes.map((s) => <Tag key={s}>{s}</Tag>)}</span> },
            { key: "c", header: "Συλλογές", cell: (k) => k.collections.map((c) => colName.get(c) ?? "—").join(", ") || "Όλες" },
            { key: "u", header: "Τελευταία χρήση", cell: (k) => fmtDateTime(k.lastUsedAt) },
            { key: "e", header: "Λήξη", cell: (k) => (k.expiresAt ? fmtDate(k.expiresAt) : "Χωρίς") },
            {
              key: "x",
              header: "",
              align: "right",
              cell: (k) => (
                <FormDialog title="Ανάκληση κλειδιού" description={`Το «${k.name}» σταματά να λειτουργεί αμέσως. Δεν αναιρείται.`} action={revokeApiKeyAction.bind(null, tenantId, k.id)} destructive submitLabel="Ανάκληση" size="sm" trigger={<Button variant="ghost" size="icon" className="size-8 text-danger-500" aria-label={`Ανάκληση ${k.name}`}><Trash2 aria-hidden /></Button>} />
              ),
            },
          ]}
        />
      </Section>
    </>
  );
}
