import type { Metadata } from "next";
import { Pencil } from "lucide-react";
import { FormDialog } from "@/components/dg/form-dialog";
import { FormRow, SelectField, SwitchField, TextField } from "@/components/dg/fields";
import { PageHeader } from "@/components/dg/page-header";
import { Grid, Section } from "@/components/dg/section";
import { Button } from "@/components/ui/button";
import { tenantSettingsAction } from "@/lib/actions/tenant";
import { tenantSettings } from "@/lib/data/tenant";
import { requireTenantAdmin } from "@/lib/tenant";

export const metadata: Metadata = { title: "Ρυθμίσεις" };

const on = (v: boolean) => (v ? <span className="text-success-500">ενεργό</span> : <span className="text-muted-foreground">ανενεργό</span>);

export default async function TenantSettingsPage({ params }: PageProps<"/t/[tenantId]/settings">) {
  const { tenantId } = await params;
  const { tenant } = await requireTenantAdmin(tenantId);
  const s = await tenantSettings(tenantId);
  const edit = (
    <FormDialog title="Ρυθμίσεις οργανισμού" action={tenantSettingsAction.bind(null, tenantId)} trigger={<Button size="sm" variant="outline"><Pencil aria-hidden /> Επεξεργασία</Button>}>
      <SelectField name="timezone" label="Ζώνη ώρας" required defaultValue={s.timezone} options={[{ value: "Europe/Athens", label: "Ελλάδα (Europe/Athens)" }, { value: "Europe/Nicosia", label: "Κύπρος (Europe/Nicosia)" }]} />
      <FormRow>
        <TextField name="logRetentionDays" label="Διατήρηση logs (ημέρες)" required type="number" defaultValue={s.logRetentionDays} hint={`Έως ${s.maxLogs} με το πακέτο σας.`} />
        <TextField name="artifactRetentionDays" label="Διατήρηση στιγμιοτύπων (ημέρες)" required type="number" defaultValue={s.artifactRetentionDays} hint={`Έως ${s.maxArtifacts} με το πακέτο σας.`} />
      </FormRow>
      <SwitchField name="emailOnFailure" label="Email σε αποτυχία μεθόδου" defaultChecked={s.emailOnFailure} />
      <SwitchField name="emailOnAttention" label="Email όταν χρειάζεται χειριστής" defaultChecked={s.emailOnAttention} />
      <SwitchField name="teams" label="Ειδοποιήσεις στο Microsoft Teams" defaultChecked={s.teams} />
    </FormDialog>
  );
  return (
    <>
      <PageHeader eyebrow="Διαχείριση" title="Ρυθμίσεις" description={tenant.name} actions={edit} />
      <Grid cols={2}>
        <Section title="Γενικά">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Ζώνη ώρας</dt>
            <dd>{s.timezone}</dd>
            <dt className="text-muted-foreground">Γλώσσα</dt>
            <dd>Ελληνικά</dd>
          </dl>
        </Section>
        <Section title="Διατήρηση δεδομένων">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Logs</dt>
            <dd className="tabular-nums">{s.logRetentionDays} ημέρες</dd>
            <dt className="text-muted-foreground">Στιγμιότυπα</dt>
            <dd className="tabular-nums">{s.artifactRetentionDays} ημέρες</dd>
          </dl>
        </Section>
        <Section title="Ειδοποιήσεις">
          <ul className="space-y-1 text-sm">
            <li>Email σε αποτυχία μεθόδου · {on(s.emailOnFailure)}</li>
            <li>Email όταν χρειάζεται χειριστής · {on(s.emailOnAttention)}</li>
            <li>Microsoft Teams · {on(s.teams)}</li>
          </ul>
        </Section>
      </Grid>
    </>
  );
}
