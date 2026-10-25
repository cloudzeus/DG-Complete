import { Plus } from "lucide-react";
import { FormDialog } from "@/components/dg/form-dialog";
import { FormRow, TextareaField, TextField } from "@/components/dg/fields";
import { Button } from "@/components/ui/button";
import { mockSubmit } from "@/lib/mock/actions";

export const HEALTH = {
  ok: { label: "Σε λειτουργία", tone: "success" as const },
  degraded: { label: "Με προβλήματα", tone: "warning" as const },
  down: { label: "Εκτός λειτουργίας", tone: "danger" as const },
};

export function CreateTargetDialog({ tenantId }: { tenantId: string }) {
  return (
    <FormDialog
      title="Νέο σύστημα‑στόχος"
      description="Το web σύστημα στο οποίο θα γίνονται οι καταχωρίσεις."
      action={mockSubmit.bind(null, tenantId, "createTarget")}
      submitLabel="Δημιουργία"
      trigger={
        <Button size="sm">
          <Plus aria-hidden /> Νέο σύστημα
        </Button>
      }
    >
      <TextField name="name" label="Όνομα" required placeholder="π.χ. TAXISnet — Μητρώο" />
      <TextField name="baseUrl" label="Διεύθυνση" required type="url" placeholder="https://" inputMode="url" />
      <TextareaField name="origins" label="Επιτρεπτά origins" required rows={3} mono placeholder={"www1.aade.gr\nlogin.gsis.gr"} hint="Ένα ανά γραμμή. Ο worker δεν πλοηγείται εκτός αυτών (προστασία SSRF)." />
      <FormRow>
        <TextField name="maxConcurrency" label="Ταυτόχρονες εκτελέσεις" required type="number" defaultValue={2} inputMode="numeric" />
        <TextField name="timeoutSec" label="Χρόνος ανά βήμα (″)" type="number" defaultValue={15} inputMode="numeric" />
      </FormRow>
    </FormDialog>
  );
}

