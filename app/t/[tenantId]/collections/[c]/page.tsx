import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { CodeBlock } from "@/components/dg/code-block";
import { DataTable } from "@/components/dg/data-table";
import { fmtNum } from "@/components/dg/format";
import { FormDialog } from "@/components/dg/form-dialog";
import { RadioCards, SelectField, TextField } from "@/components/dg/fields";
import { LinkTabs } from "@/components/dg/link-tabs";
import { PageHeader } from "@/components/dg/page-header";
import { Section } from "@/components/dg/section";
import { StatusBadge, Tag } from "@/components/dg/status-badge";
import { Button } from "@/components/ui/button";
import { newMethodAction } from "@/lib/actions/tenant";
import { getCollection, listApiKeys, listMethods, publishedWorkflowOptions } from "@/lib/data/tenant";
import { EmptyState } from "@/components/dg/empty-state";
import { Boxes } from "lucide-react";
import { requireTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Συλλογή" };

const METHOD_STATUS = { ACTIVE: { label: "Ενεργή", tone: "success" as const }, PAUSED: { label: "Σε παύση", tone: "warning" as const } };

export default async function CollectionPage({ params, searchParams }: PageProps<"/t/[tenantId]/collections/[c]">) {
  const { tenantId, c } = await params;
  const { tab = "methods" } = await searchParams;
  await requireTenant(tenantId);
  const col = await getCollection(tenantId, c);
  if (!col) notFound();
  const base = `/t/${tenantId}/collections/${col.id}`;
  const [list, allKeys, versions] = await Promise.all([listMethods(tenantId, col.id), listApiKeys(tenantId), publishedWorkflowOptions(tenantId)]);
  const keys = allKeys.filter((k) => !k.collections.length || k.collections.includes(col.id));

  return (
    <>
      <PageHeader
        crumbs={[{ href: `/t/${tenantId}/collections`, label: "Συλλογές μεθόδων" }]}
        title={col.name}
        description={col.description}
        actions={
          <FormDialog title="Νέα μέθοδος" action={newMethodAction.bind(null, tenantId, col.id)} submitLabel="Δημιουργία" trigger={<Button size="sm"><Plus aria-hidden /> Νέα μέθοδος</Button>}>
            <TextField name="name" label="Όνομα" required />
            <TextField name="key" label="Κλειδί API" required placeholder="π.χ. createCustomer" hint="POST /api/v1/collections/{συλλογή}/methods/{κλειδί}/runs" />
            <SelectField name="workflowId" label="Ροή" required placeholder="Επιλέξτε…" options={versions} hint="Μόνο δημοσιευμένες εκδόσεις ροών." />
            <RadioCards name="mode" label="Τρόπος" defaultValue="async" options={[{ value: "async", label: "Ασύγχρονα", hint: "202 + webhook / polling" }, { value: "sync", label: "Σύγχρονα", hint: "Περιμένει έως 120″" }]} />
          </FormDialog>
        }
      />
      <LinkTabs base={base} active={String(tab)} tabs={[{ key: "methods", label: "Μέθοδοι", count: list.length }, { key: "docs", label: "Τεκμηρίωση API" }, { key: "keys", label: "Κλειδιά με πρόσβαση", count: keys.length }]} />

      {tab === "methods" && (
        <Section>
          <DataTable
            rows={list}
            rowKey={(m) => m.id}
            empty={<EmptyState icon={Boxes} title="Καμία μέθοδος" description="Εκθέστε μια δημοσιευμένη ροή ως μέθοδο API." />}
            columns={[
              { key: "n", header: "Μέθοδος", cell: (m) => <Link href={`${base}/methods/${m.id}`} className="group block"><span className="block font-medium group-hover:text-primary group-hover:underline">{m.name}</span><code className="font-mono text-2xs text-muted-foreground">{m.key}</code></Link> },
              { key: "s", header: "Κατάσταση", cell: (m) => <StatusBadge status={m.status} map={METHOD_STATUS} /> },
              { key: "v", header: "Έκδοση", cell: (m) => <span className="inline-flex items-center gap-1.5 tabular-nums">v{m.pinnedVersion}{m.latestVersion > m.pinnedVersion && <Tag tone="info">v{m.latestVersion} διαθέσιμη</Tag>}</span> },
              { key: "mode", header: "Τρόπος", cell: (m) => (m.mode === "sync" ? "Σύγχρονα" : "Ασύγχρονα") },
              { key: "c", header: "Κλήσεις 7 ημ.", align: "right", cell: (m) => fmtNum(m.calls7d) },
              { key: "e", header: "Σφάλματα", align: "right", cell: (m) => <span className={m.errorRate > 5 ? "font-semibold text-danger-500" : ""}>{fmtNum(m.errorRate, 1)}%</span> },
            ]}
          />
        </Section>
      )}

      {tab === "docs" && (
        <Section title="OpenAPI 3.1" description="Η πλήρης τεκμηρίωση (Scalar) φορτώνει από /api/v1/openapi.json με το κλειδί σας.">
          <CodeBlock
            title="curl"
            code={`curl -X POST https://complete.dgsmart.gr/api/v1/collections/${col.slug}/methods/${list[0]?.key ?? "method"}/runs \\
  -H "Authorization: Bearer dgc_…" \\
  -H "Idempotency-Key: 7f1c…" \\
  -H "Content-Type: application/json" \\
  -d '{ "input": { "afm": "099999999", "name": "Demo Α.Ε." }, "externalRef": "INV-2026-48120" }'`}
          />
        </Section>
      )}

      {tab === "keys" && (
        <Section>
          <DataTable
            rows={keys}
            rowKey={(k) => k.id}
            columns={[
              { key: "n", header: "Κλειδί", cell: (k) => <span className="font-medium">{k.name}</span> },
              { key: "p", header: "Πρόθεμα", cell: (k) => <code className="font-mono text-xs">{k.prefix}…</code> },
              { key: "s", header: "Δικαιώματα", cell: (k) => <span className="flex flex-wrap gap-1">{k.scopes.map((s) => <Tag key={s}>{s}</Tag>)}</span> },
            ]}
          />
        </Section>
      )}
    </>
  );
}
