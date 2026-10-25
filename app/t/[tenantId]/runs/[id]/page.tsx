import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ImageOff, RotateCcw, XCircle } from "lucide-react";
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
import { cancelRunAction, retryRunAction } from "@/lib/actions/tenant";
import { getRun } from "@/lib/data/tenant";
import { RUN_STATUS, RUN_TRIGGER } from "@/lib/labels";
import { can } from "@/lib/rbac";
import { requireTenant } from "@/lib/tenant";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Εκτέλεση" };

const LEVEL: Record<string, string> = { debug: "text-muted-foreground", info: "text-muted-foreground", warn: "text-warning-500", error: "text-danger-500" };

export default async function RunPage({ params, searchParams }: PageProps<"/t/[tenantId]/runs/[id]">) {
  const { tenantId, id } = await params;
  const { tab = "steps" } = await searchParams;
  const { user } = await requireTenant(tenantId);
  const run = await getRun(tenantId, id);
  if (!run) notFound();
  const base = `/t/${tenantId}/runs/${run.id}`;
  const active = ["QUEUED", "RUNNING", "RETRY_SCHEDULED", "NEEDS_ATTENTION", "HELD"].includes(run.status);
  const canRetry = can(user, "tenant.runs.retry", tenantId);
  const shot = run.artifacts.find((a) => a.kind.startsWith("SCREENSHOT"));

  return (
    <>
      <PageHeader
        crumbs={[{ href: `/t/${tenantId}/runs`, label: "Εκτελέσεις" }]}
        title={run.methodName}
        description={<span className="font-mono text-xs break-all">{run.id} · externalRef {run.externalRef ?? "—"}</span>}
        actions={
          <>
            <StatusBadge status={run.status} map={RUN_STATUS} />
            {canRetry && run.status === "FAILED" && <FormDialog title="Νέα εκτέλεση" description="Ίδια είσοδος, νέα εκτέλεση (χρεώνεται αν πετύχει)." action={retryRunAction.bind(null, tenantId, run.id)} submitLabel="Εκτέλεση" size="sm" trigger={<Button size="sm" variant="outline"><RotateCcw aria-hidden /> Επανάληψη</Button>} />}
            {canRetry && active && (
              <FormDialog title="Ακύρωση εκτέλεσης" action={cancelRunAction.bind(null, tenantId, run.id)} destructive submitLabel="Ακύρωση εκτέλεσης" size="sm" trigger={<Button size="sm" variant="outline" className="text-danger-500"><XCircle aria-hidden /> Ακύρωση</Button>}>
                <TextareaField name="reason" label="Αιτία (προαιρετικά)" rows={2} />
              </FormDialog>
            )}
          </>
        }
      />
      <dl className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-border/70 bg-card p-4 text-sm shadow-fluent-2 md:grid-cols-4">
        <div><dt className="eyebrow">Μπήκε στην ουρά</dt><dd className="tabular-nums">{fmtDateTime(run.createdAt)}</dd></div>
        <div><dt className="eyebrow">Διάρκεια</dt><dd className="tabular-nums">{fmtDuration(run.durationMs)}</dd></div>
        <div><dt className="eyebrow">Μέθοδος</dt><dd><code className="font-mono text-xs">{run.methodKey}</code> · v{run.version}</dd></div>
        <div><dt className="eyebrow">Προέλευση</dt><dd>{RUN_TRIGGER[run.trigger] ?? run.trigger}</dd></div>
      </dl>
      {run.error && (
        <div role="alert" className="mb-4 rounded-lg border border-danger-500/30 bg-danger-50 p-4">
          <p className="font-mono text-xs font-semibold text-danger-500">
            {run.error.code}
            {run.error.step && ` · βήμα ${run.error.step}`}
          </p>
          <p className="mt-1 text-sm">{run.error.message}</p>
          {run.targetMessage && <p className="mt-1 text-sm text-muted-foreground">Μήνυμα συστήματος: «{run.targetMessage}»</p>}
        </div>
      )}
      <LinkTabs base={base} active={String(tab)} tabs={[{ key: "steps", label: "Βήματα", count: run.steps.length }, { key: "logs", label: "Logs", count: run.logs.length }, { key: "data", label: "Είσοδος / έξοδος" }]} />
      {tab === "steps" && (
        <div className="grid gap-4 *:min-w-0 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Section title="Βήματα">
            {run.steps.length ? <StepTimeline steps={run.steps} /> : <p className="text-sm text-muted-foreground">{active ? "Η εκτέλεση δεν έχει ξεκινήσει ακόμα." : "Δεν καταγράφηκαν βήματα."}</p>}
          </Section>
          <Section title={run.error ? `Στιγμιότυπο${run.error.step ? ` — βήμα ${run.error.step}` : ""}` : "Τελικό στιγμιότυπο"} description="Τα πεδία κωδικών και OTP είναι μασκαρισμένα. Τα αρχεία ανοίγουν με χρονικά περιορισμένο σύνδεσμο.">
            {shot ? (
              <Screenshot alt={run.error ? `Στιγμιότυπο σφάλματος στο βήμα ${run.error.step}` : "Τελικό στιγμιότυπο της εκτέλεσης"} highlight={!!run.error} />
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><ImageOff aria-hidden className="size-4" /> Χωρίς στιγμιότυπο.</p>
            )}
          </Section>
        </div>
      )}
      {tab === "logs" && (
        <Section title="Logs" description="Οι τιμές μυστικών αντικαθίστανται με ••••.">
          {run.logs.length === 0 && <p className="text-sm text-muted-foreground">Κανένα log ακόμα.</p>}
          <ol className="space-y-1 font-mono text-xs" aria-live="polite">
            {run.logs.map((l, i) => (
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
          <Section title="Είσοδος" description="Προεπισκόπηση με μασκαρισμένα ευαίσθητα πεδία· η πλήρης είσοδος μένει κρυπτογραφημένη."><JsonViewer value={run.inputPreview} /></Section>
          <Section title="Έξοδος"><JsonViewer value={run.output ?? null} /></Section>
        </div>
      )}
    </>
  );
}
