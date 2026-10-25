import type { Metadata } from "next";
import { Plus, Send } from "lucide-react";
import { DataTable } from "@/components/dg/data-table";
import { fmtDateTime } from "@/components/dg/format";
import { FormDialog } from "@/components/dg/form-dialog";
import { CheckboxGroup, TextField } from "@/components/dg/fields";
import { PageHeader } from "@/components/dg/page-header";
import { Section } from "@/components/dg/section";
import { Tag } from "@/components/dg/status-badge";
import { Button } from "@/components/ui/button";
import { WEBHOOK_EVENTS } from "@/lib/labels";
import { createWebhookAction, redeliverAction } from "@/lib/actions/tenant";
import { listWebhooks } from "@/lib/data/tenant";
import { requireTenantAdmin } from "@/lib/tenant";

export const metadata: Metadata = { title: "Webhooks" };

export default async function WebhooksPage({ params }: PageProps<"/t/[tenantId]/settings/webhooks">) {
  const { tenantId } = await params;
  await requireTenantAdmin(tenantId);
  const { endpoints: webhooks, deliveries } = await listWebhooks(tenantId);
  return (
    <>
      <PageHeader
        eyebrow="Διαχείριση"
        title="Webhooks"
        description="Υπογεγραμμένα με HMAC‑SHA256 (header DGC-Signature). Επαναποστολή με αυξανόμενη αναμονή έως 24 ώρες."
        actions={
          <FormDialog title="Νέο webhook" action={createWebhookAction.bind(null, tenantId)} submitLabel="Δημιουργία" trigger={<Button size="sm"><Plus aria-hidden /> Νέο webhook</Button>}>
            <TextField name="url" label="Διεύθυνση" required type="url" placeholder="https://" hint="Μόνο HTTPS· ιδιωτικές διευθύνσεις απορρίπτονται." />
            <CheckboxGroup name="events" label="Γεγονότα" required options={WEBHOOK_EVENTS.map((e) => ({ value: e.key, label: e.label, hint: e.key }))} />
          </FormDialog>
        }
      />
      <Section title="Endpoints">
        <DataTable
          rows={webhooks}
          rowKey={(w) => w.id}
          empty={<p className="text-sm text-muted-foreground">Κανένα endpoint.</p>}
          columns={[
            { key: "u", header: "Διεύθυνση", cell: (w) => <code className="font-mono text-xs break-all">{w.url}</code> },
            { key: "e", header: "Γεγονότα", cell: (w) => <span className="flex flex-wrap gap-1">{w.events.map((e) => <Tag key={e}>{e}</Tag>)}</span> },
            { key: "l", header: "Τελευταία", cell: (w) => (w.lastDelivery ? <Tag tone={w.lastDelivery.status < 300 ? "success" : "danger"}>{w.lastDelivery.status}</Tag> : "—") },
          ]}
        />
      </Section>
      <Section title="Πρόσφατες αποστολές" className="mt-4">
        <DataTable
          rows={deliveries}
          rowKey={(d) => d.id}
          empty={<p className="text-sm text-muted-foreground">Καμία αποστολή ακόμα.</p>}
          columns={[
            { key: "e", header: "Γεγονός", cell: (d) => <code className="font-mono text-xs">{d.event}</code> },
            { key: "s", header: "HTTP", cell: (d) => (d.status ? <Tag tone={d.status < 300 ? "success" : "danger"}>{d.status}</Tag> : <Tag>{d.state}</Tag>) },
            { key: "a", header: "Προσπάθειες", align: "right", cell: (d) => d.attempts },
            { key: "t", header: "Ώρα", align: "right", cell: (d) => fmtDateTime(d.at) },
            { key: "x", header: "", align: "right", cell: (d) => (d.state === "FAILED" || d.state === "GAVE_UP" ? <FormDialog title="Επαναποστολή" description={`Το ${d.event} θα σταλεί ξανά.`} action={redeliverAction.bind(null, tenantId, d.id)} submitLabel="Επαναποστολή" size="sm" trigger={<Button size="sm" variant="outline"><Send aria-hidden /> Ξανά</Button>} /> : null) },
          ]}
        />
      </Section>
    </>
  );
}
