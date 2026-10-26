import { Plus } from "lucide-react";
import { FormDialog } from "@/components/dg/form-dialog";
import { FormRow, TextareaField, TextField } from "@/components/dg/fields";
import { Button } from "@/components/ui/button";
import { createTargetAction, deleteTargetAction } from "@/lib/actions/tenant";

export function CreateTargetDialog({ tenantId }: { tenantId: string }) {
  return (
    <FormDialog
      title="Νέο σύστημα‑στόχος"
      description="Το web σύστημα στο οποίο θα γίνονται οι καταχωρίσεις."
      action={createTargetAction.bind(null, tenantId)}
      submitLabel="Δημιουργία"
      trigger={
        <Button size="sm">
          <Plus aria-hidden /> Νέο σύστημα
        </Button>
      }
    >
      <TextField name="name" label="Όνομα" required placeholder="π.χ. TAXISnet — Μητρώο" />
      <TextField name="baseUrl" label="Διεύθυνση" required type="url" placeholder="https://" inputMode="url" />
      <TextareaField name="origins" label="Επιτρεπτά origins" rows={3} mono placeholder={"www1.aade.gr\nlogin.gsis.gr"} hint="Ένα ανά γραμμή. Ο worker δεν πλοηγείται εκτός αυτών (προστασία SSRF). Κενό = το host της διεύθυνσης." />
      <FormRow>
        <TextField name="maxConcurrency" label="Ταυτόχρονες εκτελέσεις" required type="number" defaultValue={2} inputMode="numeric" />
      </FormRow>
    </FormDialog>
  );
}

/** Confirm text for deleting a target: says what goes with it. */
export function targetDelete(tenantId: string, t: { id: string; name: string; workflows: number; credentials: number }) {
  const parts = [t.workflows && `${t.workflows} ροές με τις εκδόσεις, μεθόδους και εκτελέσεις τους`, t.credentials && `${t.credentials} διαπιστευτήρια`].filter(Boolean);
  return {
    title: `Διαγραφή «${t.name}»`,
    description: parts.length ? `Θα διαγραφούν μαζί: ${parts.join(" και ")}. Η ενέργεια δεν αναιρείται.` : "Η ενέργεια δεν αναιρείται.",
    action: deleteTargetAction.bind(null, tenantId, t.id),
    submitLabel: "Οριστική διαγραφή",
  };
}
