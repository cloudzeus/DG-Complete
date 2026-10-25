import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RotateCcw, XCircle } from "lucide-react";
import { fmtDateTime, fmtDuration } from "@/components/dg/format";
import { FormDialog } from "@/components/dg/form-dialog";
import { TextareaField } from "@/components/dg/fields";
import { JsonViewer } from "@/components/dg/json-viewer";
import { LinkTabs } from "@/components/dg/link-tabs";
import { PageHeader } from "@/components/dg/page-header";
import { Screenshot } from "@/components/dg/screenshot";
import { Section } from "@/components/dg/section";
import { StatusBadge } from "@/components/dg/status-badge";
import { StepTimeline } from "@/components/dg/step-list";
import { Button } from "@/components/ui/button";
import { RUN_STATUS } from "@/lib/labels";
import { mockSubmit } from "@/lib/mock/actions";
import { byId, methodOf, runLogs, runs, runSteps } from "@/lib/mock/data";
import { requireTenant } from "@/lib/tenant";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Εκτέλεση" };

const LEVEL = { info: "text-muted-foreground", warn: "text-warning-500", error: "text-danger-500" } as Record<string, string>;

export default async function RunPage({ params, searchParams }: PageProps<"/t/[tenantId]/runs/[id]">) {
  const { tenantId, id } = await params;
  const { tab = "steps" } = await searchParams;
  await requireTenant(tenantId);
  const run = byId(runs, id);
  if (!run) notFound();
  const m = methodOf(run.methodId);
  const act = (f: Parameters<typeof mockSubmit>[1]) => mockSubmit.bind(null, tenantId, f);
  const base = `/t/${tenantId}/runs/${run.id}`;
  const active = ["QUEUED", "RUNNING", "RETRY_SCHEDULED", "NEEDS_ATTENTION", "HELD"].includes(run.status);

  return (
    <>
      <PageHeader
        crumbs={[{ href: `/t/${tenantId}/runs`, label: "Εκτελέσεις" }]}
        title={m?.name ?? "Εκτέλεση"}
        description={<span className="font-mono text-xs">{run.id} · externalRef {run.externalRef ?? "—"}</span>}
        actions={
          <>
            <StatusBadge status={run.status} map={RUN_STATUS} />
            {run.status === "FAILED" && <FormDialog title="Νέα εκτέλεση" description="Ίδια είσοδος, νέα εκτέλεση (χρεώνεται)." action={act("retryFailed")} submitLabel="Εκτέλεση" size="sm" trigger={<Button size="sm" variant="outline"><RotateCcw aria-hidden /> Επανάληψη</Button>} />}
            {active && (
              <FormDialog title="Ακύρωση εκτέλεσης" action={act("cancel")} destructive submitLabel="Ακύρωση εκτέλεσης" size="sm" trigger={<Button size="sm" variant="outline" className="text-danger-500"><XCircle aria-hidden /> Ακύρωση</Button>}>
                <TextareaField name="reason" label="Αιτία (προαιρετικά)" rows={2} />
              </FormDialog>
            )}
          </>
        }
      />
      <dl className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-border/70 bg-card p-4 text-sm shadow-fluent-2 md:grid-cols-4">
        <div><dt className="eyebrow">Ξεκίνησε</dt><dd className="tabular-nums">{fmtDateTime(run.createdAt)}</dd></div>
        <div><dt className="eyebrow">Διάρκεια</dt><dd className="tabular-nums">{fmtDuration(run.durationMs)}</dd></div>
        <div><dt className="eyebrow">Μέθοδος</dt><dd><code className="font-mono text-xs">{m?.key}</code> · v{m?.pinnedVersion}</dd></div>
        <div><dt className="eyebrow">Προέλευση</dt><dd>{run.trigger === "api" ? "API" : run.trigger === "job" ? "Μαζική εργασία" : "Χειροκίνητη"}</dd></div>
      </dl>
      {run.error && (
        <div role="alert" className="mb-4 rounded-lg border border-danger-500/30 bg-danger-50 p-4">
          <p className="font-mono text-xs font-semibold text-danger-500">{run.error.code} · βήμα {run.error.step}</p>
          <p className="mt-1 text-sm">{run.error.message}</p>
        </div>
      )}
      <LinkTabs base={base} active={String(tab)} tabs={[{ key: "steps", label: "Βήματα" }, { key: "logs", label: "Logs" }, { key: "data", label: "Είσοδος / έξοδος" }]} />
      {tab === "steps" && (
        <div className="grid gap-4 *:min-w-0 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Section title="Βήματα">
            <StepTimeline steps={runSteps(run)} />
          </Section>
          <Section title={run.error ? `Στιγμιότυπο — βήμα ${run.error.step}` : "Τελικό στιγμιότυπο"} description="Τα πεδία κωδικών και OTP είναι μασκαρισμένα.">
            <Screenshot alt={run.error ? `Στιγμιότυπο σφάλματος στο βήμα ${run.error.step}` : "Τελικό στιγμιότυπο της εκτέλεσης"} highlight={!!run.error} />
          </Section>
        </div>
      )}
      {tab === "logs" && (
        <Section title="Logs" description="Οι τιμές μυστικών αντικαθίστανται με ••••.">
          <ol className="space-y-1 font-mono text-xs" aria-live="polite">
            {runLogs(run).map((l, i) => (
              <li key={i} className="grid gap-x-3 sm:grid-cols-[9rem_3.5rem_1fr]">
                <span className="text-muted-foreground tabular-nums">{fmtDateTime(l.at)}</span>
                <span className={cn("font-semibold uppercase", LEVEL[l.level])}>{l.level}</span>
                <span className="break-words">{l.message}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}
      {tab === "data" && (
        <div className="grid gap-4 *:min-w-0 lg:grid-cols-2">
          <Section title="Είσοδος"><JsonViewer value={{ afm: "099999999", name: "Demo Α.Ε.", city: "Αθήνα", contacts: [] }} /></Section>
          <Section title="Έξοδος"><JsonViewer value={run.status === "SUCCEEDED" ? { customerCode: "Π-004812" } : null} /></Section>
        </div>
      )}
    </>
  );
}
