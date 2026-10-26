import Link from "next/link";
import { Check, Disc3, KeyRound, MonitorCog, Plus } from "lucide-react";
import { FormDialog } from "@/components/dg/form-dialog";
import { FormRow, SelectField, TextField } from "@/components/dg/fields";
import { Button } from "@/components/ui/button";
import { addCredentialAction, createTargetAction, startLiveRecordingAction } from "@/lib/actions/tenant";
import type { onboarding } from "@/lib/data/tenant";
import { INTENT_OPTIONS } from "@/lib/labels";
import { cn } from "@/lib/utils";

// «Ξεκινήστε εδώ» (docs/09): the whole path on one card, one primary action for the next step.
type State = Awaited<ReturnType<typeof onboarding>>;
type Step = { key: string; title: string; text: string; done: boolean; action: React.ReactNode };

export function GettingStarted({ tenantId, s }: { tenantId: string; s: State }) {
  const base = `/t/${tenantId}`;
  const first = s.targets[0];
  const targetOptions = s.targets.map((t) => ({ value: t.id, label: t.name }));
  const steps: Step[] = [
    {
      key: "target",
      title: "Προσθέστε το σύστημα",
      text: "Το web σύστημα όπου γίνονται οι καταχωρίσεις (π.χ. ΟΠΣΚΕ, Taxis, ERP).",
      done: s.targets.length > 0,
      action: (
        <FormDialog title="Νέο σύστημα‑στόχος" description="Η διεύθυνση της αρχικής σελίδας του συστήματος." action={createTargetAction.bind(null, tenantId)} submitLabel="Δημιουργία" trigger={<Button size="sm"><MonitorCog aria-hidden /> Νέο σύστημα</Button>}>
          <TextField name="name" label="Όνομα" required placeholder="π.χ. ΟΠΣΚΕ" />
          <TextField name="baseUrl" label="Διεύθυνση" required type="url" placeholder="https://…" />
          <input type="hidden" name="maxConcurrency" value="2" />
        </FormDialog>
      ),
    },
    {
      key: "login",
      title: "Στοιχεία σύνδεσης",
      text: "Το όνομα χρήστη και ο κωδικός με τα οποία συνδέεται η εφαρμογή. Αποθηκεύονται κρυπτογραφημένα.",
      done: s.credentials > 0,
      action: first && (
        <FormDialog title={`Στοιχεία σύνδεσης · ${first.name}`} action={addCredentialAction.bind(null, tenantId, first.id)} submitLabel="Αποθήκευση" trigger={<Button size="sm"><KeyRound aria-hidden /> Προσθήκη στοιχείων</Button>}>
          <TextField name="label" label="Περιγραφή" required defaultValue="Κύριος λογαριασμός" />
          <FormRow>
            <TextField name="username" label="Όνομα χρήστη" required autoComplete="off" />
            <TextField name="password" label="Κωδικός" required type="password" autoComplete="new-password" />
          </FormRow>
        </FormDialog>
      ),
    },
    {
      key: "record",
      title: "Καταγράψτε μια ροή",
      text: "Ανοίγει το σύστημα μέσα στην εφαρμογή· κάνετε την καταχώριση μία φορά και κάθε κίνηση γίνεται βήμα.",
      done: !!s.recorded,
      action: first && (
        <FormDialog title="Καταγραφή στην εφαρμογή" description="Επιλέξτε τι θα κάνει η ροή — ορίζει τη μέθοδο του API." action={startLiveRecordingAction.bind(null, tenantId)} submitLabel="Έναρξη καταγραφής" trigger={<Button size="sm"><Disc3 aria-hidden /> Καταγραφή</Button>}>
          <TextField name="name" label="Όνομα ροής" required placeholder="π.χ. Υποβολή αίτησης" />
          <SelectField name="targetId" label="Σύστημα" required defaultValue={first.id} options={targetOptions} />
          <SelectField name="intent" label="Λειτουργία" required placeholder="Επιλέξτε…" options={INTENT_OPTIONS} />
        </FormDialog>
      ),
    },
    {
      key: "test",
      title: "Δοκιμάστε τη",
      text: "Μια δοκιμαστική εκτέλεση με δείγμα δεδομένων· βλέπετε κάθε βήμα και στιγμιότυπα.",
      done: !!s.testedId,
      action: s.recorded && (
        <Button size="sm" asChild>
          <Link href={`${base}/workflows/${s.recorded.id}`}>Άνοιγμα «{s.recorded.name}»</Link>
        </Button>
      ),
    },
    {
      key: "publish",
      title: "Δημοσιεύστε",
      text: "Η δημοσιευμένη ροή γίνεται αυτόματα μέθοδος του API, με τεκμηρίωση.",
      done: !!s.published,
      action: (s.testedId || s.recorded) && (
        <Button size="sm" asChild>
          <Link href={`${base}/workflows/${s.testedId ?? s.recorded!.id}`}>Άνοιγμα για δημοσίευση</Link>
        </Button>
      ),
    },
    {
      key: "api",
      title: "Καλέστε το API",
      text: s.method ? `Η μέθοδος ${s.method.endpoint} είναι έτοιμη. Χρειάζεται ένα κλειδί API.` : "Με ένα κλειδί API καλείτε τη μέθοδο από το δικό σας σύστημα.",
      done: s.apiRuns > 0,
      action: (
        <div className="flex flex-wrap gap-2">
          {s.method && (
            <Button size="sm" asChild>
              <Link href={`${base}/collections/${s.method.collectionId}/methods/${s.method.id}`}>Τεκμηρίωση της μεθόδου</Link>
            </Button>
          )}
          <Button size="sm" variant="outline" asChild>
            <Link href={`${base}/settings/api-keys`}>
              <Plus aria-hidden /> {s.keys ? "Κλειδιά API" : "Νέο κλειδί API"}
            </Link>
          </Button>
        </div>
      ),
    },
  ];
  const next = steps.findIndex((x) => !x.done);
  const doneCount = steps.filter((x) => x.done).length;
  if (next === -1) return null;
  return (
    <section aria-labelledby="getting-started" className="mb-4 rounded-lg border border-border/70 bg-card shadow-fluent-2">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 px-4 py-3">
        <h2 id="getting-started" className="text-base font-semibold">Ξεκινήστε εδώ</h2>
        <p className="text-sm text-muted-foreground">
          {doneCount} από {steps.length} βήματα
        </p>
      </header>
      <ol className="divide-y divide-border/60">
        {steps.map((st, i) => {
          const current = i === next;
          return (
            <li key={st.key} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", current && "bg-sisyphus-50/60")}>
              <span
                aria-hidden
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
                  st.done ? "bg-success-500 text-white" : current ? "bg-sisyphus-500 text-white" : "bg-muted text-muted-foreground",
                )}
              >
                {st.done ? <Check className="size-4" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-semibold", !st.done && !current && "text-muted-foreground")}>
                  {st.title}
                  {st.done && <span className="sr-only"> — ολοκληρώθηκε</span>}
                </p>
                {(current || !st.done) && <p className="text-sm text-muted-foreground">{st.text}</p>}
              </div>
              {current && st.action}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
