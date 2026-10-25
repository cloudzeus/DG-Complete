import type { Metadata } from "next";
import { Pencil } from "lucide-react";
import { FormDialog } from "@/components/dg/form-dialog";
import { FormRow, SelectField, SwitchField, TextField } from "@/components/dg/fields";
import { PageHeader } from "@/components/dg/page-header";
import { Grid, Section } from "@/components/dg/section";
import { Button } from "@/components/ui/button";
import { mockSubmit } from "@/lib/mock/actions";
import { requireTenantAdmin } from "@/lib/tenant";

export const metadata: Metadata = { title: "Ρυθμίσεις" };

export default async function TenantSettingsPage({ params }: PageProps<"/t/[tenantId]/settings">) {
  const { tenantId } = await params;
  const { tenant } = await requireTenantAdmin(tenantId);
  const act = mockSubmit.bind(null, tenantId, "tenantSettings");
  const edit = (
    <FormDialog title="Ρυθμίσεις οργανισμού" action={act} trigger={<Button size="sm" variant="outline"><Pencil aria-hidden /> Επεξεργασία</Button>}>
      <SelectField name="timezone" label="Ζώνη ώρας" required defaultValue="Europe/Athens" options={[{ value: "Europe/Athens", label: "Ελλάδα (Europe/Athens)" }, { value: "Europe/Nicosia", label: "Κύπρος (Europe/Nicosia)" }]} />
      <FormRow>
        <TextField name="logRetentionDays" label="Διατήρηση logs (ημέρες)" required type="number" defaultValue={90} hint="Έως 180 με το πακέτο σας." />
        <TextField name="artifactRetentionDays" label="Διατήρηση στιγμιοτύπων (ημέρες)" required type="number" defaultValue={30} hint="Έως 60 με το πακέτο σας." />
      </FormRow>
      <SwitchField name="emailOnFailure" label="Email σε αποτυχία μεθόδου" defaultChecked />
      <SwitchField name="emailOnAttention" label="Email όταν χρειάζεται χειριστής" defaultChecked />
      <SwitchField name="teams" label="Ειδοποιήσεις στο Microsoft Teams" />
    </FormDialog>
  );
  return (
    <>
      <PageHeader eyebrow="Διαχείριση" title="Ρυθμίσεις" description={tenant.name} actions={edit} />
      <Grid cols={2}>
        <Section title="Γενικά">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Ζώνη ώρας</dt><dd>Europe/Athens</dd>
            <dt className="text-muted-foreground">Γλώσσα</dt><dd>Ελληνικά</dd>
          </dl>
        </Section>
        <Section title="Διατήρηση δεδομένων">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Logs</dt><dd className="tabular-nums">90 ημέρες</dd>
            <dt className="text-muted-foreground">Στιγμιότυπα</dt><dd className="tabular-nums">30 ημέρες</dd>
          </dl>
        </Section>
        <Section title="Ειδοποιήσεις">
          <ul className="space-y-1 text-sm">
            <li>Email σε αποτυχία μεθόδου · <span className="text-success-500">ενεργό</span></li>
            <li>Email όταν χρειάζεται χειριστής · <span className="text-success-500">ενεργό</span></li>
            <li>Microsoft Teams · <span className="text-muted-foreground">ανενεργό</span></li>
          </ul>
        </Section>
      </Grid>
    </>
  );
}
