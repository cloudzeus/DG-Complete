import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowUpCircle, Play, Settings2 } from "lucide-react";
import { CodeBlock } from "@/components/dg/code-block";
import { fmtNum } from "@/components/dg/format";
import { FormDialog } from "@/components/dg/form-dialog";
import { FormRow, RadioCards, SwitchField, TextField } from "@/components/dg/fields";
import { KpiTile } from "@/components/dg/kpi-tile";
import { PageHeader } from "@/components/dg/page-header";
import { Grid, Section } from "@/components/dg/section";
import { Tag } from "@/components/dg/status-badge";
import { Button } from "@/components/ui/button";
import { mockSubmit } from "@/lib/mock/actions";
import { byId, collections, methods, workflows } from "@/lib/mock/data";
import { requireTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Μέθοδος" };

export default async function MethodPage({ params }: PageProps<"/t/[tenantId]/collections/[c]/methods/[m]">) {
  const { tenantId, c, m } = await params;
  await requireTenant(tenantId);
  const col = byId(collections, c);
  const method = byId(methods, m);
  if (!col || !method) notFound();
  const wf = byId(workflows, method.workflowId);
  const act = (f: Parameters<typeof mockSubmit>[1]) => mockSubmit.bind(null, tenantId, f);
  const url = `https://complete.dgsmart.gr/api/v1/collections/${col.id}/methods/${method.key}/runs`;
  const input = Object.fromEntries((wf?.inputs ?? []).map((i) => [i.key, i.type === "number" ? 0 : i.type === "array" ? [] : "…"]));

  return (
    <>
      <PageHeader
        crumbs={[{ href: `/t/${tenantId}/collections`, label: "Συλλογές" }, { href: `/t/${tenantId}/collections/${col.id}`, label: col.name }]}
        title={method.name}
        description={<code className="font-mono text-xs">{method.key}</code>}
        actions={
          <>
            {method.status === "PAUSED" && <Tag tone="warning">Σε παύση — νέες κλήσεις γίνονται HELD</Tag>}
            <FormDialog title="Χειροκίνητη εκτέλεση" description="Φόρμα από το σχήμα εισόδου της ροής." action={act("manualRun")} submitLabel="Εκτέλεση" trigger={<Button size="sm"><Play aria-hidden /> Εκτέλεση</Button>}>
              {(wf?.inputs ?? []).map((i) => (
                <TextField key={i.key} name={i.key} label={i.label} required={i.required} type={i.type === "number" ? "number" : "text"} hint={`${i.key} · ${i.type}`} />
              ))}
              <TextField name="externalRef" label="externalRef" hint="Δικός σας κωδικός για συσχέτιση." />
            </FormDialog>
          </>
        }
      />
      <Grid cols={4}>
        <KpiTile label="Κλήσεις 7 ημ." value={fmtNum(method.calls7d)} />
        <KpiTile label="Σφάλματα" value={`${fmtNum(method.errorRate, 1)}%`} />
        <KpiTile label="Έκδοση ροής" value={`v${method.pinnedVersion}`} hint={method.latestVersion > method.pinnedVersion ? `διαθέσιμη v${method.latestVersion}` : "τελευταία"} />
        <KpiTile label="Τρόπος" value={method.mode === "sync" ? "Σύγχρονα" : "Ασύγχρονα"} />
      </Grid>
      <div className="mt-4 grid gap-4 *:min-w-0 xl:grid-cols-2">
        <Section
          title="Ρυθμίσεις"
          actions={
            <>
              {method.latestVersion > method.pinnedVersion && (
                <FormDialog title={`Αναβάθμιση σε v${method.latestVersion}`} description="Οι νέες κλήσεις θα εκτελούν τη νέα έκδοση. Οι κλήσεις σε εξέλιξη τελειώνουν με την παλιά." action={act("upgradeMethod")} submitLabel="Αναβάθμιση" size="sm" trigger={<Button size="sm" variant="outline"><ArrowUpCircle aria-hidden /> Αναβάθμιση</Button>} />
              )}
              <FormDialog title="Ρυθμίσεις μεθόδου" action={act("methodSettings")} trigger={<Button size="sm" variant="outline"><Settings2 aria-hidden /> Επεξεργασία</Button>}>
                <RadioCards name="mode" label="Τρόπος" defaultValue={method.mode} options={[{ value: "async", label: "Ασύγχρονα" }, { value: "sync", label: "Σύγχρονα" }]} />
                <FormRow>
                  <TextField name="syncTimeoutSec" label="Αναμονή sync (″)" type="number" defaultValue={60} />
                  <TextField name="retries" label="Επαναλήψεις" type="number" defaultValue={2} />
                </FormRow>
                <SwitchField name="screenshotsAlways" label="Στιγμιότυπα σε κάθε βήμα" hint="Αλλιώς μόνο στο σφάλμα." />
              </FormDialog>
            </>
          }
        >
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Ροή</dt>
            <dd>{wf?.name}</dd>
            <dt className="text-muted-foreground">Timeout εκτέλεσης</dt>
            <dd>5′</dd>
            <dt className="text-muted-foreground">Επαναλήψεις</dt>
            <dd>2 (εκθετική αναμονή)</dd>
            <dt className="text-muted-foreground">Στιγμιότυπα</dt>
            <dd>Μόνο στο σφάλμα</dd>
          </dl>
        </Section>
        <div className="space-y-4">
          <CodeBlock title="curl" code={`curl -X POST ${url} \\\n  -H "Authorization: Bearer dgc_…" \\\n  -H "Idempotency-Key: $(uuidgen)" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify({ input })}'`} />
          <CodeBlock title="TypeScript" code={`const res = await fetch("${url}", {\n  method: "POST",\n  headers: { Authorization: \`Bearer \${process.env.DGC_KEY}\`, "Idempotency-Key": crypto.randomUUID(), "Content-Type": "application/json" },\n  body: JSON.stringify(${JSON.stringify({ input })}),\n});\nconst run = await res.json(); // { id, status: "QUEUED" }`} />
          <CodeBlock title="C#" code={`var req = new HttpRequestMessage(HttpMethod.Post, "${url}");\nreq.Headers.Add("Authorization", $"Bearer {key}");\nreq.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString());\nreq.Content = JsonContent.Create(new { input = new { /* … */ } });\nvar res = await http.SendAsync(req);`} />
        </div>
      </div>
    </>
  );
}
