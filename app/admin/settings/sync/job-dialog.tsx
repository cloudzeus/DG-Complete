"use client";

import { useActionState, useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { JOB_PRESETS } from "@/lib/softone-presets";
import { saveJob, testJob, type JobFormState } from "./actions";

export type JobValues = {
  id: string;
  name: string;
  type: "CUSTOMERS" | "TABLE";
  table: string;
  fields: string;
  keyField: string;
  updField: string | null;
  filter: string | null;
  intervalMinutes: number;
  enabled: boolean;
};

const INTERVALS = [
  [5, "κάθε 5 λεπτά"],
  [15, "κάθε 15 λεπτά"],
  [30, "κάθε 30 λεπτά"],
  [60, "κάθε ώρα"],
  [180, "κάθε 3 ώρες"],
  [360, "κάθε 6 ώρες"],
  [1440, "μία φορά την ημέρα"],
  [10080, "μία φορά την εβδομάδα"],
] as const;

export function JobDialog({ open, onOpenChange, job }: { open: boolean; onOpenChange: (o: boolean) => void; job?: JobValues }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{job ? "Επεξεργασία συγχρονισμού" : "Νέος συγχρονισμός"}</DialogTitle>
          <DialogDescription>
            Ποιος πίνακας του SoftOne της DGsoft αντιγράφεται στην εφαρμογή, και πόσο συχνά.
          </DialogDescription>
        </DialogHeader>
        {open && <JobForm job={job} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function JobForm({ job, onDone }: { job?: JobValues; onDone: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, saving] = useActionState<JobFormState, FormData>(saveJob, {});
  const [testState, setTestState] = useState<JobFormState>({});
  const [testing, startTest] = useTransition();
  const [v, setV] = useState({
    name: job?.name ?? "",
    table: job?.table ?? "",
    fields: job?.fields ?? "",
    keyField: job?.keyField ?? "",
    updField: job?.updField ?? "UPDDATE",
    filter: job?.filter ?? "",
  });
  const [interval, setInterval] = useState(String(job?.intervalMinutes ?? 60));
  const builtIn = job?.type === "CUSTOMERS";
  const handleDone = useEffectEvent(onDone);

  useEffect(() => {
    if (state.ok) {
      toast.success(state.message);
      handleDone();
    } else if (state.message) toast.error(state.message);
  }, [state]);

  const e = { ...testState.errors, ...state.errors };
  const set = (k: keyof typeof v) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((s) => ({ ...s, [k]: ev.target.value }));

  function runTest() {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    startTest(async () => setTestState(await testJob(fd)));
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {job && <input type="hidden" name="id" value={job.id} />}

      {!job && (
        <div className="space-y-1.5">
          <Label>Πρότυπο</Label>
          <Select
            onValueChange={(k) => {
              const p = JOB_PRESETS.find((x) => x.key === k)!;
              setV({ name: p.name, table: p.table, fields: p.fields, keyField: p.keyField, updField: p.updField ?? "", filter: p.filter ?? "" });
              setInterval(String(p.intervalMinutes));
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Επιλέξτε έτοιμο πίνακα ή συμπληρώστε χειροκίνητα" />
            </SelectTrigger>
            <SelectContent>
              {JOB_PRESETS.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  {p.group} · {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Όνομα *" error={e.name} className="sm:col-span-2">
          <Input name="name" value={v.name} onChange={set("name")} readOnly={builtIn} required />
        </Field>
        <Field label="Πίνακας SoftOne *" error={e.table} hint="π.χ. MTRL, TRDR, FINDOC">
          <Input name="table" value={v.table} onChange={set("table")} readOnly={builtIn} className="font-mono uppercase" required />
        </Field>
        <Field label="Κλειδί *" error={e.keyField} hint="Πρωτεύον κλειδί (ή πεδία με κόμμα)">
          <Input name="keyField" value={v.keyField} onChange={set("keyField")} readOnly={builtIn} className="font-mono uppercase" required />
        </Field>
        <Field label="Πεδία *" error={e.fields} hint="Χωρισμένα με κόμμα" className="sm:col-span-2">
          <Textarea name="fields" value={v.fields} onChange={set("fields")} readOnly={builtIn} rows={2} className="font-mono text-xs uppercase" required />
        </Field>
        <Field label="Πεδίο ενημέρωσης" error={e.updField} hint="Για αυξητικό συγχρονισμό (συνήθως UPDDATE)">
          <Input name="updField" value={v.updField ?? ""} onChange={set("updField")} readOnly={builtIn} className="font-mono uppercase" />
        </Field>
        <Field label="Συχνότητα" error={e.intervalMinutes}>
          <Select value={interval} onValueChange={setInterval}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVALS.map(([m, label]) => (
                <SelectItem key={m} value={String(m)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" name="intervalMinutes" value={interval} />
        </Field>
        <Field label="Φίλτρο (SQL)" error={e.filter} hint="Προαιρετικό, π.χ. COMPANY={COMPANY} AND SODTYPE=51" className="sm:col-span-2">
          <Input name="filter" value={v.filter ?? ""} onChange={set("filter")} className="font-mono" />
        </Field>
        <label className="flex items-center justify-between gap-3 rounded-md border p-2.5 sm:col-span-2">
          <span>
            <span className="block text-sm font-medium">Ενεργό</span>
            <span className="text-xs text-muted-foreground">Εκτελείται αυτόματα από το cron</span>
          </span>
          <Switch name="enabled" defaultChecked={job?.enabled ?? true} />
        </label>
      </div>

      {testState.test && (
        <Alert variant={testState.test.ok ? "default" : "destructive"}>
          {testState.test.ok ? <CheckCircle2 className="text-emerald-600" /> : <XCircle />}
          <AlertDescription className="break-all">{testState.test.message}</AlertDescription>
        </Alert>
      )}

      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={runTest} disabled={testing || saving}>
          {testing ? "Έλεγχος…" : "Έλεγχος στο SoftOne"}
        </Button>
        <Button type="submit" disabled={saving || testing}>
          {saving ? "Αποθήκευση…" : job ? "Αποθήκευση" : "Δημιουργία"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
