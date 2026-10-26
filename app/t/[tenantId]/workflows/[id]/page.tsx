import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  Disc3,
  FlaskConical,
  KeyRound,
  History,
  Pencil,
  Plus,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import { fmtDateTime } from "@/components/dg/format";
import { FormDialog } from "@/components/dg/form-dialog";
import {
  FormRow,
  SelectField,
  SwitchField,
  TextareaField,
  TextField,
} from "@/components/dg/fields";
import { JsonViewer } from "@/components/dg/json-viewer";
import { PageHeader } from "@/components/dg/page-header";
import { Screenshot } from "@/components/dg/screenshot";
import { Section } from "@/components/dg/section";
import { StatusBadge, Tag } from "@/components/dg/status-badge";
import { numberSteps, type Step } from "@/components/dg/step-list";
import { Button } from "@/components/ui/button";
import { INTENT_OPTIONS, STEP_TYPES, VERSION_STATUS } from "@/lib/labels";
import { IntentBadge } from "@/components/dg/intent-badge";
import {
  addCredentialAction,
  addInputAction,
  deleteWorkflowAction,
  startLiveRecordingAction,
  addStepAction,
  deleteStepAction,
  editStepAction,
  publishVersionAction,
  submitVersionAction,
  testRunAction,
} from "@/lib/actions/tenant";
import { WorkflowCanvas, type CanvasForm, type StepRunStatus } from "@/components/workflow-editor/canvas";
import type { CapturedForm } from "@/lib/dsl/graph";
import { getStorage } from "@/lib/storage";
import { LiveRun } from "@/components/dg/live-run";
import { RowActions } from "@/components/dg/row-actions";
import { StepTree } from "@/components/workflow-editor/step-tree";
import { getWorkflow, listCredentials, workflowRuns } from "@/lib/data/tenant";
import { RunLogPanel } from "@/components/workflow-editor/run-log-panel";
import { can } from "@/lib/rbac";
import { requireTenant } from "@/lib/tenant";
import type { StepDef } from "@/lib/data/tenant";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Editor ροής" };

const flat = (steps: Step[]): Step[] =>
  steps.flatMap((s) => [s, ...flat(s.children ?? [])]);
const flatDefs = (steps: StepDef[]): StepDef[] =>
  steps.flatMap((s) => [s, ...flatDefs(s.steps ?? [])]);

/** Light publish checks (full validateForPublish comes with lib/dsl, P05). */
function lint(steps: StepDef[], inputs: { key: string }[]) {
  const out: string[] = [];
  const all = flatDefs(steps);
  if (!all.length) out.push("Η ροή δεν έχει βήματα.");
  for (const [i, s] of all.entries()) {
    if (
      ["fill", "click", "select", "check", "extract", "assert"].includes(
        s.type,
      ) &&
      !s.locator
    )
      out.push(`Το βήμα «${s.label ?? i + 1}» δεν έχει στοιχείο.`);
    for (const m of JSON.stringify(s.value ?? "").matchAll(
      /\{\{\s*input\.(\w+)/g,
    ))
      if (!inputs.some((x) => x.key === m[1]))
        out.push(
          `Το βήμα «${s.label ?? i + 1}» χρησιμοποιεί άγνωστη είσοδο «${m[1]}».`,
        );
  }
  return out;
}
const STEP_OPTIONS = Object.entries(STEP_TYPES).map(([value, label]) => ({
  value,
  label,
}));

export default async function WorkflowEditor({
  params,
  searchParams,
}: PageProps<"/t/[tenantId]/workflows/[id]">) {
  const { tenantId, id } = await params;
  const sp = await searchParams;
  const { user } = await requireTenant(tenantId);
  const wf = await getWorkflow(tenantId, id);
  if (!wf || !wf.latest) notFound();
  const latest = wf.latest;
  const steps = numberSteps(latest.definition.steps);
  const canEdit = can(user, "tenant.workflows.edit", tenantId);
  const canApprove = can(user, "tenant.workflows.approve", tenantId);
  const base = `/t/${tenantId}/workflows/${wf.id}`;
  const view = sp.view === "list" || sp.view === "json" ? sp.view : "canvas";
  const all = flat(steps);
  const selected = all.find((s) => s.id === sp.step) ?? all[1] ?? all[0];
  const [runs, creds] = await Promise.all([workflowRuns(tenantId, wf.id), listCredentials(tenantId, wf.target.id)]);
  // The flow types a username / password: they come from a credential of the target system.
  const needsLogin = JSON.stringify(latest.definition).includes("{{secrets.");
  const canCreds = can(user, "tenant.credentials.manage", tenantId);
  // Captured forms (live recorder): signed, short-lived image URLs for the canvas.
  const captured = ((latest.definition as { forms?: Record<string, CapturedForm> }).forms ?? {}) as Record<string, CapturedForm>;
  const storage = Object.values(captured).some((f) => f.image) ? await getStorage() : null;
  const forms: Record<string, CanvasForm> = Object.fromEntries(
    await Promise.all(Object.entries(captured).map(async ([k, f]) => [k, { ...f, imageUrl: f.image && storage ? await storage.signedUrl(f.image, 900) : undefined }] as const)),
  );
  const warnings = lint(latest.definition.steps ?? [], wf.inputs);
  const stepHref = `${base}?${new URLSearchParams({ view })}&step=`;
  const href = (q: Record<string, string>) =>
    `${base}?${new URLSearchParams({ view, ...(selected ? { step: selected.id } : {}), ...q })}`;

  const liveRun = runs.find((r) => ["QUEUED", "RUNNING", "RETRY_SCHEDULED"].includes(r.status));
  return (
    <>
      {liveRun && <LiveRun tenantId={tenantId} runId={liveRun.id} />}
      <PageHeader
        crumbs={[{ href: `/t/${tenantId}/workflows`, label: "Ροές" }]}
        title={wf.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <IntentBadge intent={wf.intent} />
            <span className="tabular-nums">v{latest.versionNo}</span>
            <StatusBadge status={latest.status} map={VERSION_STATUS} />
            <span>
              · {wf.target.name} · αποθηκεύτηκε {fmtDateTime(latest.updatedAt)}
            </span>
          </span>
        }
        actions={
          <>
            <nav
              aria-label="Προβολή"
              className="inline-flex rounded-sm border border-border bg-card p-0.5"
            >
              {(["canvas", "list", "json"] as const).map((v) => (
                <Link
                  key={v}
                  href={href({ view: v })}
                  aria-current={view === v ? "page" : undefined}
                  className={cn(
                    "rounded-xs px-2.5 py-1 text-xs font-medium",
                    view === v
                      ? "bg-sisyphus-50 text-sisyphus-700"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {{ canvas: "Καμβάς", list: "Λίστα", json: "JSON" }[v]}
                </Link>
              ))}
            </nav>
            <Button asChild variant="ghost" size="sm">
              <Link href={`${base}/versions`}>
                <History aria-hidden /> Εκδόσεις
              </Link>
            </Button>
            {canEdit && (
              <RowActions
                label={`Ενέργειες για ${wf.name}`}
                destroy={{
                  title: `Διαγραφή «${wf.name}»`,
                  description: "Θα διαγραφούν όλες οι εκδόσεις, οι μέθοδοι API και οι εκτελέσεις της ροής. Η ενέργεια δεν αναιρείται.",
                  action: deleteWorkflowAction.bind(null, tenantId, wf.id),
                  submitLabel: "Οριστική διαγραφή",
                }}
              />
            )}
            <FormDialog
              title="Δοκιμαστική εκτέλεση"
              description="Εκτελείται στο σύστημα‑στόχο με δείγμα εισόδου· δεν χρεώνεται."
              action={testRunAction.bind(null, tenantId, latest.id)}
              submitLabel="Εκτέλεση"
              trigger={
                <Button size="sm">
                  <FlaskConical aria-hidden /> Δοκιμαστική εκτέλεση
                </Button>
              }
            >
              {wf.inputs.length === 0 && !needsLogin && <p className="text-sm text-muted-foreground">Η ροή δεν έχει εισόδους — πατήστε «Εκτέλεση».</p>}
              {needsLogin && (
                <fieldset className="space-y-3 rounded-lg border border-border/70 p-3">
                  <legend className="eyebrow px-1">Στοιχεία σύνδεσης</legend>
                  <p className="text-sm text-muted-foreground">
                    {creds.length
                      ? `Χρησιμοποιείται το «${creds[0].label}». Συμπληρώστε μόνο για να δοκιμάσετε με άλλα στοιχεία.`
                      : "Δεν υπάρχει αποθηκευμένο διαπιστευτήριο: δώστε τα στοιχεία για αυτή τη δοκιμή. Δεν αποθηκεύονται."}
                  </p>
                  <FormRow>
                    <TextField name="secret__username" label="Όνομα χρήστη" required={!creds.length} autoComplete="off" />
                    <TextField name="secret__password" label="Κωδικός" type="password" required={!creds.length} autoComplete="new-password" />
                  </FormRow>
                </fieldset>
              )}
              {wf.inputs.map((i) =>
                i.type === "array" || i.type === "object" ? (
                  <TextareaField
                    key={i.key}
                    name={i.key}
                    label={i.label}
                    required={i.required}
                    rows={4}
                    mono
                    placeholder={i.type === "array" ? '[{"...": "..."}, {"...": "..."}]' : '{"...": "..."}'}
                    hint={i.type === "array" ? "Λίστα σε JSON — μία εγγραφή ανά γραμμή (π.χ. γραμμές παραστατικού)." : "JSON"}
                  />
                ) : (
                  <TextField key={i.key} name={i.key} label={i.label} required={i.required} hint={i.type} />
                ),
              )}
            </FormDialog>
            {latest.status === "DRAFT" && canEdit && (
              <FormDialog
                title="Υποβολή για έγκριση"
                description="Ο διαχειριστής θα δει το diff και την τελευταία δοκιμή."
                action={submitVersionAction.bind(null, tenantId, latest.id)}
                submitLabel="Υποβολή"
                trigger={
                  <Button size="sm">
                    <Send aria-hidden /> Για έγκριση
                  </Button>
                }
              >
                <TextareaField
                  name="note"
                  label="Σημείωση για τον εγκρίνοντα"
                  rows={3}
                />
              </FormDialog>
            )}
          </>
        }
      />

      {needsLogin && (
        <div
          role={creds.length ? undefined : "alert"}
          className={cn(
            "mb-4 flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm",
            creds.length ? "border-border/70 bg-card" : "border-warning-500/40 bg-warning-50",
          )}
        >
          <KeyRound aria-hidden className={cn("size-4 shrink-0", creds.length ? "text-sisyphus-600" : "text-warning-500")} />
          <p className="min-w-0 flex-1">
            {creds.length ? (
              <>
                <span className="font-semibold">Σύνδεση στο {wf.target.name}:</span> με το διαπιστευτήριο «{creds[0].label}» ({creds[0].username}).
                {creds.length > 1 && ` Υπάρχουν ${creds.length} διαπιστευτήρια.`}
              </>
            ) : (
              <>
                <span className="font-semibold">Λείπουν τα στοιχεία σύνδεσης.</span> Η ροή συμπληρώνει όνομα χρήστη και κωδικό στο {wf.target.name}, αλλά δεν έχουν οριστεί ακόμη. Αποθηκεύονται κρυπτογραφημένα και δεν εμφανίζονται ποτέ ξανά.
              </>
            )}
          </p>
          {canCreds && (
            <FormDialog
              title="Στοιχεία σύνδεσης"
              description={`Το όνομα χρήστη και ο κωδικός για το ${wf.target.name}. Αποθηκεύονται κρυπτογραφημένα· η ροή τα χρησιμοποιεί ως {{secrets.username}} και {{secrets.password}}.`}
              action={addCredentialAction.bind(null, tenantId, wf.target.id)}
              submitLabel="Αποθήκευση"
              trigger={
                <Button size="sm" variant={creds.length ? "outline" : "default"}>
                  <KeyRound aria-hidden /> {creds.length ? "Νέα στοιχεία" : "Προσθήκη στοιχείων σύνδεσης"}
                </Button>
              }
            >
              <TextField name="label" label="Περιγραφή" required defaultValue={creds.length ? "" : "Κύριος λογαριασμός"} />
              <FormRow>
                <TextField name="username" label="Όνομα χρήστη" required autoComplete="off" />
                <TextField name="password" label="Κωδικός" required type="password" autoComplete="new-password" />
              </FormRow>
              <TextField name="totpSecret" label="Μυστικό TOTP (προαιρετικό)" type="password" autoComplete="off" hint="Μόνο αν το σύστημα ζητά κωδικό μίας χρήσης από εφαρμογή (Authenticator)." />
            </FormDialog>
          )}
          {creds.length > 0 && (
            <Button asChild size="sm" variant="ghost">
              <Link href={`/t/${tenantId}/targets/${wf.target.id}?tab=credentials`}>Διαχείριση</Link>
            </Button>
          )}
        </div>
      )}

      {view === "json" ? (
        <Section title="DSL (μόνο ανάγνωση)">
          <JsonViewer value={latest.definition} />
        </Section>
      ) : (
        <div className="grid gap-4 *:min-w-0 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,16rem)]">
          <Section
            title="Βήματα"
            className={
              view === "canvas" ? "lg:col-span-2 xl:col-span-3" : undefined
            }
            bodyClassName="p-2 sm:p-3"
            actions={
              canEdit && (
                <FormDialog
                  title="Νέο βήμα"
                  description={
                    latest.status === "DRAFT"
                      ? "Προστίθεται στο τέλος."
                      : "Οι αλλαγές γίνονται σε νέα πρόχειρη έκδοση."
                  }
                  action={addStepAction.bind(null, tenantId, wf.id)}
                  submitLabel="Προσθήκη"
                  size="sm"
                  trigger={
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      aria-label="Νέο βήμα"
                    >
                      <Plus aria-hidden />
                    </Button>
                  }
                >
                  <SelectField
                    name="type"
                    label="Τύπος"
                    required
                    options={STEP_OPTIONS}
                  />
                  <TextField name="label" label="Περιγραφή" required />
                </FormDialog>
              )
            }
          >
            {!(latest.definition.steps ?? []).length ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-8 text-center">
                <Disc3 aria-hidden className="size-6 text-sisyphus-600" />
                <div>
                  <p className="font-semibold">Η ροή δεν έχει βήματα ακόμα</p>
                  <p className="mt-1 max-w-prose text-sm text-muted-foreground">Ανοίξτε το {wf.target.name} μέσα στην εφαρμογή και κάντε την καταχώριση μία φορά. Κάθε ενέργεια γίνεται βήμα αυτής της ροής· με «Capture πεδίων» οι φόρμες γίνονται είσοδοι του API.</p>
                </div>
                {canEdit && (
                  <FormDialog
                    title="Καταγραφή στην εφαρμογή"
                    description={`Τα βήματα θα γραφτούν στη ροή «${wf.name}».`}
                    action={startLiveRecordingAction.bind(null, tenantId)}
                    submitLabel="Έναρξη καταγραφής"
                    trigger={
                      <Button size="sm">
                        <Disc3 aria-hidden /> Καταγραφή στην εφαρμογή
                      </Button>
                    }
                  >
                    <TextField name="name" label="Όνομα" required defaultValue={wf.name} />
                    <SelectField name="intent" label="Λειτουργία" placeholder="Επιλέξτε…" defaultValue={wf.intent ?? undefined} options={INTENT_OPTIONS} />
                    <input type="hidden" name="targetId" value={wf.target.id} />
                    <input type="hidden" name="workflowId" value={wf.id} />
                  </FormDialog>
                )}
              </div>
            ) : view === "canvas" ? (
              <WorkflowCanvas
                                tenantId={tenantId}
                workflowId={wf.id}
                definition={latest.definition}
                updatedAt={latest.updatedAt}
                selected={selected?.id}
                hrefBase={stepHref}
                canEdit={canEdit}
                inputs={wf.inputs.map((x) => x.key)}
                outputs={wf.outputs}
                runStatus={runs[0]?.stepStatus as Record<string, StepRunStatus> | undefined}
                forms={forms}
              />
            ) : (
              <StepTree
                                tenantId={tenantId}
                workflowId={wf.id}
                definition={latest.definition}
                updatedAt={latest.updatedAt}
                selected={selected?.id}
                hrefBase={stepHref}
                canEdit={canEdit}
              />
            )}
          </Section>

          {selected ? (
            <Section
              stackHeader
              title={`Βήμα ${selected.no} · ${STEP_TYPES[selected.type]}`}
              description={selected.label}
              actions={
                canEdit && (
                  <>
                    <FormDialog
                      title={`Επεξεργασία βήματος ${selected.no}`}
                      description={
                        latest.status === "DRAFT"
                          ? undefined
                          : "Η αλλαγή δημιουργεί νέα πρόχειρη έκδοση."
                      }
                      action={editStepAction.bind(
                        null,
                        tenantId,
                        wf.id,
                        selected.id,
                      )}
                      trigger={
                        <Button variant="outline" size="sm">
                          <Pencil aria-hidden /> Επεξεργασία
                        </Button>
                      }
                    >
                      <FormRow>
                        <SelectField
                          name="type"
                          label="Τύπος"
                          required
                          defaultValue={selected.type}
                          options={STEP_OPTIONS}
                        />
                        <TextField
                          name="timeout"
                          label="Timeout (″)"
                          type="number"
                          defaultValue={
                            (flatDefs(latest.definition.steps ?? []).find(
                              (d) => d.id === selected.id,
                            )?.timeoutMs ?? 15000) / 1000
                          }
                        />
                      </FormRow>
                      <TextField
                        name="label"
                        label="Περιγραφή"
                        required
                        defaultValue={selected.label}
                      />
                      <TextField
                        name="locator"
                        label="Στοιχείο"
                        defaultValue={selected.locator}
                        hint="Κύριος επιλογέας· τα εναλλακτικά δοκιμάζονται με τη σειρά."
                      />
                      <TextField
                        name="value"
                        label="Τιμή"
                        defaultValue={selected.value}
                        hint="Μεταβλητές με {{input.…}} — καμία εκτέλεση κώδικα."
                      />
                      <SwitchField
                        name="optional"
                        label="Προαιρετικό"
                        hint="Αν αποτύχει, η ροή συνεχίζει."
                        defaultChecked={selected.optional}
                      />
                      <SwitchField
                        name="commit"
                        label="Σημείο δέσμευσης"
                        hint="Μετά από αυτό, η επανάληψη δεν ξαναξεκινά από την αρχή."
                      />
                    </FormDialog>
                    <FormDialog
                      title={`Αφαίρεση βήματος ${selected.no}`}
                      description={`Το «${selected.label}»${selected.children?.length ? " και τα εσωτερικά του βήματα" : ""} θα αφαιρεθεί από την πρόχειρη έκδοση.`}
                      action={deleteStepAction.bind(
                        null,
                        tenantId,
                        wf.id,
                        selected.id,
                      )}
                      destructive
                      submitLabel="Αφαίρεση"
                      size="sm"
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-danger-500"
                          aria-label={`Αφαίρεση βήματος ${selected.no}`}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      }
                    />
                  </>
                )
              }
            >
              <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-[8rem_1fr]">
                <dt className="text-muted-foreground">Στοιχείο</dt>
                <dd className="min-w-0">
                  <code className="font-mono text-xs break-all">
                    {selected.locator ?? "—"}
                  </code>
                </dd>
                <dt className="text-muted-foreground">Τιμή</dt>
                <dd>
                  <code className="font-mono text-xs break-all">
                    {selected.value ?? "—"}
                  </code>
                </dd>
                <dt className="text-muted-foreground">Timeout</dt>
                <dd>
                  {flatDefs(latest.definition.steps ?? []).find(
                    (d) => d.id === selected.id,
                  )?.timeoutMs
                    ? `${(flatDefs(latest.definition.steps ?? []).find((d) => d.id === selected.id)!.timeoutMs ?? 0) / 1000}″`
                    : "Προεπιλογή"}
                </dd>
                <dt className="text-muted-foreground">Επιλογές</dt>
                <dd className="flex flex-wrap gap-1">
                  {selected.optional ? (
                    <Tag tone="info">Προαιρετικό</Tag>
                  ) : (
                    <Tag>Υποχρεωτικό</Tag>
                  )}
                </dd>
              </dl>
              <p className="eyebrow mt-5 mb-2">Στιγμιότυπο καταγραφής</p>
              <Screenshot
                alt={`Στιγμιότυπο καταγραφής για το βήμα ${selected.no}`}
                className="max-w-xl"
              />
            </Section>
          ) : (
            <Section title="Κενή ροή">
              <p className="text-sm text-muted-foreground">
                Προσθέστε το πρώτο βήμα ή μετατρέψτε μια καταγραφή.
              </p>
            </Section>
          )}

          <div className={cn("space-y-4", view === "canvas" ? "lg:col-span-1 xl:col-span-2 xl:grid xl:grid-cols-3 xl:gap-4 xl:space-y-0 xl:*:min-w-0" : "lg:col-span-2 xl:col-span-1")}>
            <Section
              title="Είσοδοι"
              bodyClassName="p-3"
              actions={
                canEdit && (
                  <FormDialog
                    title="Νέα είσοδος"
                    action={addInputAction.bind(null, tenantId, wf.id)}
                    submitLabel="Προσθήκη"
                    size="sm"
                    trigger={
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        aria-label="Νέα είσοδος"
                      >
                        <Plus aria-hidden />
                      </Button>
                    }
                  >
                    <TextField
                      name="key"
                      label="Κλειδί"
                      required
                      placeholder="π.χ. afm"
                    />
                    <TextField
                      name="label"
                      label="Ετικέτα"
                      required
                      placeholder="π.χ. ΑΦΜ"
                    />
                    <SelectField
                      name="type"
                      label="Τύπος"
                      required
                      options={[
                        "string",
                        "number",
                        "boolean",
                        "date",
                        "array",
                        "file",
                      ].map((v) => ({ value: v, label: v }))}
                    />
                    <SwitchField
                      name="required"
                      label="Υποχρεωτικό"
                      defaultChecked
                    />
                  </FormDialog>
                )
              }
            >
              {wf.inputs.length === 0 && (
                <p className="text-sm text-muted-foreground">Καμία είσοδος.</p>
              )}
              <ul className="space-y-1.5 text-sm">
                {wf.inputs.map((i) => (
                  <li key={i.key} className="flex items-center gap-2">
                    <code className="w-20 shrink-0 truncate font-mono text-xs">
                      {i.key}
                    </code>
                    <span className="min-w-0 flex-1 truncate">{i.label}</span>
                    <Tag tone={i.required ? "neutral" : "muted"}>
                      {i.required ? i.type : "προαιρ."}
                    </Tag>
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="Έξοδοι" bodyClassName="p-3">
              <ul className="space-y-1 text-sm">
                {wf.outputs.length ? (
                  wf.outputs.map((o) => (
                    <li key={o}>
                      <code className="font-mono text-xs">{o}</code>
                    </li>
                  ))
                ) : (
                  <li className="text-muted-foreground">Καμία</li>
                )}
              </ul>
            </Section>
            <Section title="Έλεγχος" bodyClassName="p-3">
              {warnings.length === 0 ? (
                <p className="text-sm text-success-500">
                  Χωρίς προειδοποιήσεις.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {warnings.map((w) => (
                    <li
                      key={w}
                      className="flex items-start gap-2 text-sm text-warning-500"
                    >
                      <AlertTriangle
                        aria-hidden
                        className="mt-0.5 size-4 shrink-0"
                      />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </div>
      )}

      <Section
        className="mt-4"
        bodyClassName="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
      >
        <p className="text-sm">
          <span className="eyebrow mr-2">Δοκιμή</span>
          {latest.lastTestRunId ? (
            <Link
              href={`/t/${tenantId}/runs/${latest.lastTestRunId}`}
              className="text-primary hover:underline"
            >
              Τελευταία δοκιμαστική εκτέλεση
            </Link>
          ) : (
            <span className="text-muted-foreground">
              Καμία δοκιμή για αυτή την έκδοση — απαιτείται πριν τη δημοσίευση.
            </span>
          )}
        </p>
        {canApprove && latest.status !== "PUBLISHED" && (
          <FormDialog
            title="Δημοσίευση"
            description="Η δημοσιευμένη έκδοση είναι αμετάβλητη· αλλαγές = νέα έκδοση. Απαιτείται επιτυχημένη δοκιμή."
            action={publishVersionAction.bind(null, tenantId, latest.id)}
            submitLabel="Δημοσίευση"
            trigger={
              <Button size="sm" variant="outline">
                <Upload aria-hidden /> Δημοσίευση
              </Button>
            }
          >
            <TextareaField name="note" label="Σημείωση έκδοσης" rows={3} />
          </FormDialog>
        )}
      </Section>

      <Section className="mt-4" title="Εκτελέσεις & logs" description="Οι τελευταίες εκτελέσεις της ροής (όλες οι εκδόσεις), με τα logs κάθε καταχώρισης.">
        <RunLogPanel runs={runs} runsHref={`/t/${tenantId}/runs`} />
      </Section>
    </>
  );
}
