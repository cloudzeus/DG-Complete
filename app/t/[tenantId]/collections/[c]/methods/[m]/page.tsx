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
import { deleteMethodAction, manualRunAction, methodSettingsAction, upgradeMethodAction } from "@/lib/actions/tenant";
import { RowActions } from "@/components/dg/row-actions";
import { getCollection, getVersionSchemas, getWorkflow, listMethods } from "@/lib/data/tenant";
import { IntentBadge } from "@/components/dg/intent-badge";
import type { CapturedForm } from "@/lib/dsl/graph";
import { env } from "@/lib/env";
import { exampleObject } from "@/lib/methods";
import { getStorage } from "@/lib/storage";
import { can } from "@/lib/rbac";
import { requireTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Μέθοδος" };

export default async function MethodPage({ params }: PageProps<"/t/[tenantId]/collections/[c]/methods/[m]">) {
  const { tenantId, c, m } = await params;
  const { user } = await requireTenant(tenantId);
  const [col, methods] = await Promise.all([getCollection(tenantId, c), listMethods(tenantId, c)]);
  const method = methods.find((x) => x.id === m);
  if (!col || !method) notFound();
  const wf = await getWorkflow(tenantId, method.workflowId);
  const inputs = wf?.inputs ?? [];
  const version = await getVersionSchemas(tenantId, method.workflowVersionId);
  const base = env().BETTER_AUTH_URL;
  const http = method.httpMethod;
  const isQuery = http === "GET" || http === "DELETE";
  const url = `${base}/api/v1/${col.slug}/${method.resource}`;
  const input = exampleObject(version?.inputSchema);
  const output = exampleObject(version?.outputSchema);
  const query = new URLSearchParams(Object.entries(input).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])).toString();
  const callUrl = isQuery && query ? `${url}?${query}` : url;
  const curl = isQuery
    ? `curl "${callUrl}${query ? "&" : "?"}mode=sync" \\\n  -H "Authorization: Bearer dgc_…"`
    : `curl -X ${http} ${url} \\\n  -H "Authorization: Bearer dgc_…" \\\n  -H "Idempotency-Key: $(uuidgen)" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify({ input, externalRef: "ERP-10234" }, null, 2)}'`;
  const success = { id: "cmv…", status: "SUCCEEDED", durationMs: 8421, output, error: null, links: { self: "/api/v1/runs/cmv…" } };
  const queued = { id: "cmv…", status: "QUEUED", method: `${col.slug}/${method.resource}`, links: { self: "/api/v1/runs/cmv…" } };
  // Pages of the flow (live recorder): image + fields → API parameters.
  const forms = Object.entries(((wf?.latest?.definition as { forms?: Record<string, CapturedForm> } | undefined)?.forms ?? {}) as Record<string, CapturedForm>);
  const storage = forms.some(([, f]) => f.image) ? await getStorage() : null;
  const pages = await Promise.all(forms.map(async ([id, f]) => ({ id, ...f, imageUrl: f.image && storage ? await storage.signedUrl(f.image, 900) : undefined })));
  const manage = can(user, "tenant.methods.manage", tenantId);

  return (
    <>
      <PageHeader
        crumbs={[{ href: `/t/${tenantId}/collections`, label: "Συλλογές" }, { href: `/t/${tenantId}/collections/${col.id}`, label: col.name }]}
        title={method.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <IntentBadge intent={wf?.intent} />
            <code className="font-mono text-xs">
              {http} /api/v1/{col.slug}/{method.resource}
            </code>
          </span>
        }
        actions={
          <>
            {method.status === "PAUSED" && <Tag tone="warning">Σε παύση — νέες κλήσεις γίνονται HELD</Tag>}
            {manage && (
              <RowActions
                label={`Ενέργειες για ${method.name}`}
                destroy={{ title: `Διαγραφή μεθόδου «${method.name}»`, description: "Οι κλήσεις στο API θα παίρνουν 404. Η ροή και το ιστορικό εκτελέσεων μένουν· δημιουργείται ξανά με νέα δημοσίευση της ροής.", action: deleteMethodAction.bind(null, tenantId, method.id) }}
              />
            )}
            {can(user, "tenant.runs.execute", tenantId) && (
              <FormDialog title="Χειροκίνητη εκτέλεση" description="Φόρμα από το σχήμα εισόδου της ροής." action={manualRunAction.bind(null, tenantId, method.id)} submitLabel="Εκτέλεση" trigger={<Button size="sm"><Play aria-hidden /> Εκτέλεση</Button>}>
                {inputs.map((i) => (
                  <TextField key={i.key} name={i.key} label={i.label} required={i.required} type={i.type === "number" ? "number" : "text"} hint={`${i.key} · ${i.type}`} />
                ))}
                <TextField name="externalRef" label="externalRef" hint="Δικός σας κωδικός για συσχέτιση." />
              </FormDialog>
            )}
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
            manage && (
              <>
                {method.latestVersion > method.pinnedVersion && (
                  <FormDialog title={`Αναβάθμιση σε v${method.latestVersion}`} description="Οι νέες κλήσεις θα εκτελούν τη νέα έκδοση. Οι κλήσεις σε εξέλιξη τελειώνουν με την παλιά." action={upgradeMethodAction.bind(null, tenantId, method.id)} submitLabel="Αναβάθμιση" size="sm" trigger={<Button size="sm" variant="outline"><ArrowUpCircle aria-hidden /> Αναβάθμιση</Button>} />
                )}
                <FormDialog title="Ρυθμίσεις μεθόδου" action={methodSettingsAction.bind(null, tenantId, method.id)} trigger={<Button size="sm" variant="outline"><Settings2 aria-hidden /> Επεξεργασία</Button>}>
                  <RadioCards name="mode" label="Τρόπος" defaultValue={method.mode} options={[{ value: "async", label: "Ασύγχρονα" }, { value: "sync", label: "Σύγχρονα" }]} />
                  <FormRow>
                    <TextField name="syncTimeoutSec" label="Αναμονή sync (″)" type="number" defaultValue={method.syncTimeoutSec} />
                    <TextField name="retries" label="Επαναλήψεις" type="number" defaultValue={Math.max(method.maxAttempts - 1, 0)} />
                  </FormRow>
                  <SwitchField name="screenshotsAlways" label="Στιγμιότυπα σε κάθε βήμα" hint="Αλλιώς μόνο στο σφάλμα." defaultChecked={method.screenshotPolicy === "ALWAYS"} />
                </FormDialog>
              </>
            )
          }
        >
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Ροή</dt>
            <dd>{method.workflowName}</dd>
            <dt className="text-muted-foreground">Timeout εκτέλεσης</dt>
            <dd>{Math.round(method.runTimeoutSec / 60)}′</dd>
            <dt className="text-muted-foreground">Προσπάθειες</dt>
            <dd>{method.maxAttempts}</dd>
            <dt className="text-muted-foreground">Στιγμιότυπα</dt>
            <dd>{method.screenshotPolicy === "ALWAYS" ? "Σε κάθε βήμα" : "Μόνο στο σφάλμα"}</dd>
          </dl>
        </Section>
        <div className="space-y-4">
          <Section title="Κλήση" description={isQuery ? "Οι παράμετροι πηγαίνουν στο query string. Με mode=sync η απάντηση έρχεται στο ίδιο αίτημα." : "Οι παράμετροι πηγαίνουν στο σώμα ως input. Χωρίς mode=sync επιστρέφεται 202 και το id της εκτέλεσης."}>
            <div className="space-y-3">
              <CodeBlock title="curl" code={curl} />
              <CodeBlock title={`Απάντηση 200 · ολοκληρώθηκε`} code={JSON.stringify(success, null, 2)} />
              <CodeBlock title="Απάντηση 202 · σε ουρά → GET /api/v1/runs/{id}" code={JSON.stringify(queued, null, 2)} />
            </div>
          </Section>
          <CodeBlock title="TypeScript" code={`const res = await fetch("${isQuery ? callUrl : url}", {\n  method: "${http}",\n  headers: { Authorization: \`Bearer \${process.env.DGC_KEY}\`${isQuery ? "" : `, "Idempotency-Key": crypto.randomUUID(), "Content-Type": "application/json"`} },${isQuery ? "" : `\n  body: JSON.stringify(${JSON.stringify({ input })}),`}\n});\nconst run = await res.json();`} />
        </div>
      </div>

      <Section className="mt-4" title="Παράμετροι" description="Από τα πεδία που καταγράφηκαν στη ροή.">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-1.5 pr-3 font-medium">Παράμετρος</th>
              <th className="py-1.5 pr-3 font-medium">Πεδίο στο σύστημα</th>
              <th className="py-1.5 pr-3 font-medium">Τύπος</th>
              <th className="py-1.5 font-medium">Υποχρεωτική</th>
            </tr>
          </thead>
          <tbody>
            {inputs.map((i) => (
              <tr key={i.key} className="border-b border-border/50 last:border-0">
                <td className="py-1.5 pr-3"><code className="font-mono text-xs">{i.key}</code></td>
                <td className="py-1.5 pr-3">{i.label}</td>
                <td className="py-1.5 pr-3 text-muted-foreground">{i.type === "array" ? "λίστα (JSON)" : i.type}</td>
                <td className="py-1.5">{i.required ? "Ναι" : "Όχι"}</td>
              </tr>
            ))}
            {!inputs.length && (
              <tr>
                <td colSpan={4} className="py-2 text-muted-foreground">Η μέθοδος δεν έχει παραμέτρους.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      {pages.length > 0 && (
        <Section className="mt-4" title="Τι κάνει στο σύστημα, σελίδα‑σελίδα" description="Τα στιγμιότυπα είναι από την καταγραφή (οι κωδικοί είναι μασκαρισμένοι). Δίπλα, ποιο πεδίο συμπληρώνεται από ποια παράμετρο.">
          <ol className="space-y-6">
            {pages.map((p, n) => (
              <li key={p.id} className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <div>
                  <p className="eyebrow mb-1">Σελίδα {n + 1}{p.title ? ` · ${p.title}` : ""}</p>
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL
                    <img src={p.imageUrl} alt={`Σελίδα ${n + 1}${p.title ? ` — ${p.title}` : ""}`} className="w-full rounded-md border border-border/70" />
                  ) : (
                    <p className="text-sm text-muted-foreground">Χωρίς στιγμιότυπο.</p>
                  )}
                  {p.url && <p className="mt-1 font-mono text-2xs text-muted-foreground">{p.url}</p>}
                </div>
                <div>
                  <p className="eyebrow mb-1">Πεδία</p>
                  <ul className="divide-y divide-border/50 text-sm">
                    {p.fields.filter((f) => f.kind !== "unmapped").map((f, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 py-1.5">
                        <span>{f.label}</span>
                        {f.key ? <code className="font-mono text-xs">{f.key}</code> : <span className="text-xs text-muted-foreground">{f.kind === "password" ? "κωδικός διαπιστευτηρίου" : f.kind === "username" ? "χρήστης διαπιστευτηρίου" : "—"}</span>}
                      </li>
                    ))}
                    {!p.fields.some((f) => f.kind !== "unmapped") && <li className="py-1.5 text-muted-foreground">Καμία παράμετρος σε αυτή τη σελίδα.</li>}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      <Section className="mt-4" title="Σφάλματα" description="Όλα ως application/problem+json (RFC 9457).">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="font-mono text-xs">401</dt><dd>Λείπει ή δεν ισχύει το API key.</dd>
          <dt className="font-mono text-xs">403</dt><dd>Το κλειδί δεν έχει το δικαίωμα (runs:write / runs:read).</dd>
          <dt className="font-mono text-xs">404 / 405</dt><dd>Δεν υπάρχει η μέθοδος / ο πόρος δέχεται άλλο HTTP method.</dd>
          <dt className="font-mono text-xs">409</dt><dd>Το Idempotency-Key χρησιμοποιήθηκε με διαφορετικό αίτημα.</dd>
          <dt className="font-mono text-xs">422</dt><dd>Μη έγκυρη είσοδος (errors ανά πεδίο) ή το σύστημα απέρριψε την καταχώριση (code, targetMessage).</dd>
          <dt className="font-mono text-xs">429</dt><dd>Όριο αιτημάτων ή υπόλοιπο εκτελέσεων.</dd>
          <dt className="font-mono text-xs">503</dt><dd>Η μέθοδος είναι σε παύση (incident).</dd>
        </dl>
        <p className="mt-3 text-sm">
          <a className="text-sisyphus-600 underline-offset-2 hover:underline" href={`/t/${tenantId}/collections/${col.id}/openapi.json`}>
            Λήψη OpenAPI 3.1 της συλλογής
          </a>
        </p>
      </Section>
    </>
  );
}
