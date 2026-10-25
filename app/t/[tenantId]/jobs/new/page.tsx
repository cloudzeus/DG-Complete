import type { Metadata } from "next";
import Link from "next/link";
import { Check, FileSpreadsheet, Upload } from "lucide-react";
import { DataTable } from "@/components/dg/data-table";
import { FormDialog } from "@/components/dg/form-dialog";
import { Hidden, SwitchField, TextField } from "@/components/dg/fields";
import { PageHeader } from "@/components/dg/page-header";
import { Section } from "@/components/dg/section";
import { Tag } from "@/components/dg/status-badge";
import { Button } from "@/components/ui/button";
import { mockSubmit } from "@/lib/mock/actions";
import { byId, methods, workflows } from "@/lib/mock/data";
import { requireTenant } from "@/lib/tenant";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Νέα μαζική εργασία" };

const STEPS = ["Μέθοδος", "Αρχείο", "Αντιστοίχιση", "Έλεγχος & εκκίνηση"];
const COLUMNS = ["Α.Φ.Μ.", "Επωνυμία", "Πόλη", "Τηλέφωνο"];
const PREVIEW = [
  { row: 2, afm: "099999999", name: "Demo Α.Ε.", city: "Αθήνα", ok: true },
  { row: 3, afm: "12345678", name: "Βήτα Ο.Ε.", city: "Πάτρα", ok: false },
  { row: 4, afm: "800123456", name: "Γάμμα Ι.Κ.Ε.", city: "", ok: true },
];

export default async function NewJobPage({ params, searchParams }: PageProps<"/t/[tenantId]/jobs/new">) {
  const { tenantId } = await params;
  const sp = await searchParams;
  await requireTenant(tenantId);
  const base = `/t/${tenantId}/jobs/new`;
  const step = Math.min(Math.max(Number(sp.step ?? 1) || 1, 1), 4);
  const methodId = typeof sp.method === "string" ? sp.method : methods[0].id;
  const method = byId(methods, methodId) ?? methods[0];
  const wf = byId(workflows, method.workflowId);
  const at = (s: number) => `${base}?${new URLSearchParams({ step: String(s), method: method.id })}`;

  return (
    <>
      <PageHeader crumbs={[{ href: `/t/${tenantId}/jobs`, label: "Μαζικές εργασίες" }]} title="Νέα μαζική εργασία" />
      <ol className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Βήματα">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const state = n < step ? "done" : n === step ? "current" : "todo";
          return (
            <li key={label} aria-current={state === "current" ? "step" : undefined} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm", state === "current" ? "border-sisyphus-500 bg-sisyphus-50 font-semibold text-sisyphus-700" : "border-border/70 bg-card", state === "todo" && "text-muted-foreground")}>
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold", state === "done" ? "bg-success-500 text-white" : state === "current" ? "bg-sisyphus-500 text-white" : "bg-muted")}>
                {state === "done" ? <Check aria-hidden className="size-3.5" /> : n}
              </span>
              <span className="truncate">{label}</span>
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <Section title="Ποια μέθοδος θα εκτελεστεί">
          <form className="space-y-4">
            <Hidden name="step" value="2" />
            <div className="grid gap-2 md:grid-cols-2">
              {methods.map((m) => (
                <label key={m.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 p-3 text-sm hover:bg-muted/40 has-checked:border-sisyphus-500 has-checked:bg-sisyphus-50">
                  <input type="radio" name="method" value={m.id} defaultChecked={m.id === method.id} className="mt-0.5 size-4 accent-sisyphus-500" />
                  <span>
                    <span className="block font-medium">{m.name}</span>
                    <code className="font-mono text-2xs text-muted-foreground">{m.key}</code>
                  </span>
                </label>
              ))}
            </div>
            <Button type="submit">Συνέχεια</Button>
          </form>
        </Section>
      )}

      {step === 2 && (
        <Section title="Αρχείο δεδομένων" description="XLSX ή CSV, έως 50.000 γραμμές. Η πρώτη γραμμή είναι οι επικεφαλίδες.">
          <form className="space-y-4">
            <Hidden name="step" value="3" />
            <Hidden name="method" value={method.id} />
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-6 py-10 text-center transition-colors duration-150 hover:border-sisyphus-400 hover:bg-sisyphus-50/50">
              <Upload aria-hidden className="size-8 text-sisyphus-500" />
              <span className="font-medium">Σύρετε το αρχείο εδώ ή επιλέξτε</span>
              <span className="text-xs text-muted-foreground">Ελέγχεται για ιούς πριν χρησιμοποιηθεί</span>
              <input type="file" name="file" accept=".xlsx,.csv" className="sr-only" />
            </label>
            <div className="flex gap-2">
              <Button asChild variant="outline"><Link href={at(1)}>Πίσω</Link></Button>
              <Button type="submit">Συνέχεια</Button>
            </div>
          </form>
        </Section>
      )}

      {step === 3 && (
        <Section title="Αντιστοίχιση στηλών" description="Αυτόματη αντιστοίχιση με βάση τις επικεφαλίδες — ποτέ με τη θέση της στήλης.">
          <form className="space-y-4">
            <Hidden name="step" value="4" />
            <Hidden name="method" value={method.id} />
            <div className="divide-y divide-border/60 rounded-lg border border-border/70">
              {(wf?.inputs ?? []).map((i, idx) => (
                <div key={i.key} className="grid items-center gap-2 p-3 sm:grid-cols-[1fr_auto_1fr]">
                  <span className="text-sm">
                    <span className="font-medium">{i.label}</span> <code className="font-mono text-2xs text-muted-foreground">{i.key}</code>
                    {i.required && <span className="text-danger-500"> *</span>}
                  </span>
                  <span aria-hidden className="hidden text-muted-foreground sm:block">←</span>
                  <label className="text-sm">
                    <span className="sr-only">Στήλη για {i.label}</span>
                    <select name={`map_${i.key}`} defaultValue={COLUMNS[idx] ?? ""} className="h-9 w-full rounded-sm border border-input bg-card px-2 text-sm">
                      <option value="">— Χωρίς —</option>
                      {COLUMNS.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </label>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline"><Link href={at(2)}>Πίσω</Link></Button>
              <Button type="submit">Έλεγχος δεδομένων</Button>
            </div>
          </form>
        </Section>
      )}

      {step === 4 && (
        <Section
          title="Προεπισκόπηση & έλεγχος"
          description="1.200 γραμμές · 1.188 έγκυρες · 12 με σφάλματα (δεν θα εκτελεστούν)."
          actions={
            <FormDialog title="Εκκίνηση μαζικής εργασίας" description={`${method.name} για 1.188 γραμμές. Θα χρεωθούν έως 1.188 εκτελέσεις.`} action={mockSubmit.bind(null, tenantId, "newJob")} submitLabel="Εκκίνηση" trigger={<Button size="sm">Εκκίνηση</Button>}>
              <Hidden name="methodId" value={method.id} />
              <TextField name="name" label="Όνομα εργασίας" required defaultValue="Πελάτες Οκτωβρίου" />
              <SwitchField name="stopOnErrorRate" label="Διακοπή αν τα σφάλματα ξεπεράσουν το 20%" defaultChecked />
            </FormDialog>
          }
        >
          <p className="mb-3 inline-flex items-center gap-2 text-sm"><FileSpreadsheet aria-hidden className="size-4 text-success-500" /> pelates-oktovrios.xlsx</p>
          <DataTable
            rows={PREVIEW}
            rowKey={(r) => String(r.row)}
            columns={[
              { key: "r", header: "Γραμμή", cell: (r) => <span className="tabular-nums">{r.row}</span> },
              { key: "a", header: "ΑΦΜ", cell: (r) => <code className="font-mono text-xs">{r.afm}</code> },
              { key: "n", header: "Επωνυμία", cell: (r) => r.name },
              { key: "c", header: "Πόλη", cell: (r) => r.city || "—" },
              { key: "v", header: "Έλεγχος", cell: (r) => (r.ok ? <Tag tone="success">Έγκυρη</Tag> : <Tag tone="danger">ΑΦΜ: 9 ψηφία</Tag>) },
            ]}
          />
        </Section>
      )}
    </>
  );
}
