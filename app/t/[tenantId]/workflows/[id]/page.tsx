import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowDown, FlaskConical, History, Pencil, Plus, Send, Upload } from "lucide-react";
import { fmtDateTime } from "@/components/dg/format";
import { FormDialog } from "@/components/dg/form-dialog";
import { FormRow, SelectField, SwitchField, TextareaField, TextField } from "@/components/dg/fields";
import { JsonViewer } from "@/components/dg/json-viewer";
import { PageHeader } from "@/components/dg/page-header";
import { Screenshot } from "@/components/dg/screenshot";
import { Section } from "@/components/dg/section";
import { StatusBadge, Tag } from "@/components/dg/status-badge";
import { StepList } from "@/components/dg/step-list";
import { Button } from "@/components/ui/button";
import { STEP_TYPES, VERSION_STATUS } from "@/lib/labels";
import { mockSubmit, type MockForm } from "@/lib/mock/actions";
import { byId, targetName, workflows, type Step } from "@/lib/mock/data";
import { requireTenant } from "@/lib/tenant";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Editor ροής" };

const flat = (steps: Step[]): Step[] => steps.flatMap((s) => [s, ...flat(s.children ?? [])]);
const STEP_OPTIONS = Object.entries(STEP_TYPES).map(([value, label]) => ({ value, label }));

export default async function WorkflowEditor({ params, searchParams }: PageProps<"/t/[tenantId]/workflows/[id]">) {
  const { tenantId, id } = await params;
  const sp = await searchParams;
  await requireTenant(tenantId);
  const wf = byId(workflows, id);
  if (!wf) notFound();
  const base = `/t/${tenantId}/workflows/${wf.id}`;
  const view = sp.view === "canvas" || sp.view === "json" ? sp.view : "list";
  const all = flat(wf.steps);
  const selected = all.find((s) => s.id === sp.step) ?? all[1] ?? all[0];
  const act = (f: MockForm) => mockSubmit.bind(null, tenantId, f);
  const href = (q: Record<string, string>) => `${base}?${new URLSearchParams({ view, ...(selected ? { step: selected.id } : {}), ...q })}`;

  return (
    <>
      <PageHeader
        crumbs={[{ href: `/t/${tenantId}/workflows`, label: "Ροές" }]}
        title={wf.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="tabular-nums">v{wf.version}</span>
            <StatusBadge status={wf.status} map={VERSION_STATUS} />
            <span>· {targetName(wf.targetId)} · αποθηκεύτηκε {fmtDateTime(wf.updatedAt)}</span>
          </span>
        }
        actions={
          <>
            <nav aria-label="Προβολή" className="inline-flex rounded-sm border border-border bg-card p-0.5">
              {(["canvas", "list", "json"] as const).map((v) => (
                <Link
                  key={v}
                  href={href({ view: v })}
                  aria-current={view === v ? "page" : undefined}
                  className={cn("rounded-xs px-2.5 py-1 text-xs font-medium", view === v ? "bg-sisyphus-50 text-sisyphus-700" : "text-muted-foreground hover:text-foreground")}
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
            <FormDialog title="Δοκιμαστική εκτέλεση" description="Εκτελείται στο σύστημα‑στόχο με δείγμα εισόδου· δεν χρεώνεται." action={act("manualRun")} submitLabel="Εκτέλεση" trigger={<Button variant="outline" size="sm"><FlaskConical aria-hidden /> Δοκιμή</Button>}>
              {wf.inputs.map((i) => (
                <TextField key={i.key} name={i.key} label={i.label} required={i.required} hint={i.type} />
              ))}
            </FormDialog>
            <FormDialog title="Υποβολή για έγκριση" description="Ο διαχειριστής θα δει το diff και την τελευταία δοκιμή." action={act("submitApproval")} submitLabel="Υποβολή" trigger={<Button size="sm"><Send aria-hidden /> Για έγκριση</Button>}>
              <TextareaField name="note" label="Σημείωση για τον εγκρίνοντα" rows={3} />
            </FormDialog>
          </>
        }
      />

      {view === "json" ? (
        <Section title="DSL (μόνο ανάγνωση)">
          <JsonViewer value={{ version: wf.version, inputs: wf.inputs, outputs: wf.outputs, steps: wf.steps }} />
        </Section>
      ) : (
        <div className="grid gap-4 *:min-w-0 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,16rem)]">
          <Section
            title="Βήματα"
            bodyClassName="p-2 sm:p-3"
            actions={
              <FormDialog title="Νέο βήμα" action={act("addStep")} submitLabel="Προσθήκη" size="sm" trigger={<Button size="icon" variant="ghost" className="size-8" aria-label="Νέο βήμα"><Plus aria-hidden /></Button>}>
                <SelectField name="type" label="Τύπος" required options={STEP_OPTIONS} />
                <TextField name="label" label="Περιγραφή" required />
              </FormDialog>
            }
          >
            {view === "canvas" ? (
              <ol className="flex flex-col items-center gap-1 py-2" aria-label="Καμβάς ροής">
                {all.map((s, i) => (
                  <li key={s.id} className="flex w-full flex-col items-center gap-1">
                    <Link
                      href={href({ step: s.id })}
                      className={cn(
                        "w-full rounded-lg border bg-card px-3 py-2 text-sm shadow-fluent-2 transition-shadow duration-150 hover:shadow-fluent-4",
                        s.id === selected?.id ? "border-sisyphus-500 ring-2 ring-sisyphus-500/20" : "border-border/70",
                        s.no.length > 2 && "ml-6 w-[calc(100%-1.5rem)]",
                      )}
                    >
                      <span className="eyebrow block">{STEP_TYPES[s.type]}</span>
                      <span className="block truncate font-medium">
                        {s.no} · {s.label}
                      </span>
                    </Link>
                    {i < all.length - 1 && <ArrowDown aria-hidden className="size-3.5 text-muted-foreground/60" />}
                  </li>
                ))}
              </ol>
            ) : (
              <nav aria-label="Επιλογή βήματος">
                <StepList steps={wf.steps} selected={selected?.id} />
                <ul className="sr-only">
                  {all.map((s) => (
                    <li key={s.id}>
                      <Link href={href({ step: s.id })}>{`Βήμα ${s.no}`}</Link>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 grid grid-cols-4 gap-1 sm:grid-cols-6 lg:grid-cols-4">
                  {all.map((s) => (
                    <Link key={s.id} href={href({ step: s.id })} className={cn("rounded-xs py-1 text-center font-mono text-2xs", s.id === selected?.id ? "bg-sisyphus-500 text-white" : "bg-muted hover:bg-muted/70")}>
                      {s.no}
                    </Link>
                  ))}
                </div>
              </nav>
            )}
          </Section>

          {selected ? (
            <Section
              title={`Βήμα ${selected.no} · ${STEP_TYPES[selected.type]}`}
              description={selected.label}
              actions={
                <FormDialog title={`Επεξεργασία βήματος ${selected.no}`} action={act("addStep")} trigger={<Button variant="outline" size="sm"><Pencil aria-hidden /> Επεξεργασία</Button>}>
                  <FormRow>
                    <SelectField name="type" label="Τύπος" required defaultValue={selected.type} options={STEP_OPTIONS} />
                    <TextField name="timeout" label="Timeout (″)" type="number" defaultValue={15} />
                  </FormRow>
                  <TextField name="label" label="Περιγραφή" required defaultValue={selected.label} />
                  <TextField name="locator" label="Στοιχείο" defaultValue={selected.locator} hint="Κύριος επιλογέας· τα εναλλακτικά δοκιμάζονται με τη σειρά." />
                  <TextField name="value" label="Τιμή" defaultValue={selected.value} hint="Μεταβλητές με {{input.…}} — καμία εκτέλεση κώδικα." />
                  <SwitchField name="optional" label="Προαιρετικό" hint="Αν αποτύχει, η ροή συνεχίζει." defaultChecked={selected.optional} />
                  <SwitchField name="commit" label="Σημείο δέσμευσης" hint="Μετά από αυτό, η επανάληψη δεν ξαναξεκινά από την αρχή." />
                </FormDialog>
              }
            >
              <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-[8rem_1fr]">
                <dt className="text-muted-foreground">Στοιχείο</dt>
                <dd className="min-w-0">
                  <code className="font-mono text-xs break-all">{selected.locator ?? "—"}</code>
                  {selected.locator && <span className="mt-1 block text-xs text-muted-foreground">εναλλακτικά: css input[name=afm]</span>}
                </dd>
                <dt className="text-muted-foreground">Τιμή</dt>
                <dd>
                  <code className="font-mono text-xs break-all">{selected.value ?? "—"}</code>
                </dd>
                <dt className="text-muted-foreground">Timeout</dt>
                <dd>15″</dd>
                <dt className="text-muted-foreground">Επιλογές</dt>
                <dd className="flex flex-wrap gap-1">
                  {selected.optional ? <Tag tone="info">Προαιρετικό</Tag> : <Tag>Υποχρεωτικό</Tag>}
                </dd>
              </dl>
              <p className="eyebrow mt-5 mb-2">Στιγμιότυπο καταγραφής</p>
              <Screenshot alt={`Στιγμιότυπο καταγραφής για το βήμα ${selected.no}`} className="max-w-xl" />
            </Section>
          ) : (
            <Section title="Κενή ροή">
              <p className="text-sm text-muted-foreground">Προσθέστε το πρώτο βήμα ή μετατρέψτε μια καταγραφή.</p>
            </Section>
          )}

          <div className="space-y-4 lg:col-span-2 xl:col-span-1">
            <Section
              title="Είσοδοι"
              bodyClassName="p-3"
              actions={
                <FormDialog title="Νέα είσοδος" action={act("addInput")} submitLabel="Προσθήκη" size="sm" trigger={<Button size="icon" variant="ghost" className="size-8" aria-label="Νέα είσοδος"><Plus aria-hidden /></Button>}>
                  <TextField name="key" label="Κλειδί" required placeholder="π.χ. afm" />
                  <TextField name="label" label="Ετικέτα" required placeholder="π.χ. ΑΦΜ" />
                  <SelectField name="type" label="Τύπος" required options={["string", "number", "boolean", "date", "array", "file"].map((v) => ({ value: v, label: v }))} />
                  <SwitchField name="required" label="Υποχρεωτικό" defaultChecked />
                </FormDialog>
              }
            >
              <ul className="space-y-1.5 text-sm">
                {wf.inputs.map((i) => (
                  <li key={i.key} className="flex items-center gap-2">
                    <code className="w-20 shrink-0 truncate font-mono text-xs">{i.key}</code>
                    <span className="min-w-0 flex-1 truncate">{i.label}</span>
                    <Tag tone={i.required ? "neutral" : "muted"}>{i.required ? i.type : "προαιρ."}</Tag>
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="Έξοδοι" bodyClassName="p-3">
              <ul className="space-y-1 text-sm">
                {wf.outputs.length ? wf.outputs.map((o) => <li key={o}><code className="font-mono text-xs">{o}</code></li>) : <li className="text-muted-foreground">Καμία</li>}
              </ul>
            </Section>
            <Section title="Έλεγχος" bodyClassName="p-3">
              <p className="flex items-start gap-2 text-sm text-warning-500">
                <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>1 προειδοποίηση: το βήμα 04 δεν έχει εναλλακτικό επιλογέα.</span>
              </p>
            </Section>
          </div>
        </div>
      )}

      <Section className="mt-4" bodyClassName="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="eyebrow">Δοκιμή</span>
          {all.slice(0, 5).map((s, i) => (
            <span key={s.id} className={cn("rounded-xs px-1.5 font-mono text-xs", i < 3 ? "bg-success-50 text-success-500" : i === 3 ? "bg-muted text-muted-foreground" : "bg-sisyphus-50 text-sisyphus-700")}>
              {s.no} {i < 3 ? "✓" : i === 3 ? "–" : "…"}
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <FormDialog title="Δημοσίευση" description="Η δημοσιευμένη έκδοση είναι αμετάβλητη· αλλαγές = νέα έκδοση." action={act("publish")} submitLabel="Δημοσίευση" trigger={<Button size="sm" variant="outline"><Upload aria-hidden /> Δημοσίευση</Button>}>
            <TextareaField name="note" label="Σημείωση έκδοσης" rows={3} />
          </FormDialog>
          <Button asChild size="sm" variant="ghost">
            <Link href={`/t/${tenantId}/runs`}>Άνοιγμα εκτέλεσης</Link>
          </Button>
        </div>
      </Section>
    </>
  );
}
