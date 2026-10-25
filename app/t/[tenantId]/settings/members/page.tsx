import type { Metadata } from "next";
import { Pencil, UserMinus, UserPlus } from "lucide-react";
import { DataTable } from "@/components/dg/data-table";
import { fmtDateTime } from "@/components/dg/format";
import { FormDialog } from "@/components/dg/form-dialog";
import { RadioCards, TextField } from "@/components/dg/fields";
import { PageHeader } from "@/components/dg/page-header";
import { Section } from "@/components/dg/section";
import { Tag } from "@/components/dg/status-badge";
import { Button } from "@/components/ui/button";
import { TENANT_ROLES, type TenantRoleKey } from "@/lib/labels";
import { changeRoleAction, inviteMemberAction, removeMemberAction } from "@/lib/actions/tenant";
import { listMembers } from "@/lib/data/tenant";
import { requireTenantAdmin } from "@/lib/tenant";

export const metadata: Metadata = { title: "Μέλη & ρόλοι" };

const ROLE_OPTIONS = (Object.keys(TENANT_ROLES) as TenantRoleKey[]).map((k) => ({ value: k, label: TENANT_ROLES[k].label, hint: TENANT_ROLES[k].description }));

export default async function MembersPage({ params }: PageProps<"/t/[tenantId]/settings/members">) {
  const { tenantId } = await params;
  const { user } = await requireTenantAdmin(tenantId);
  const members = await listMembers(tenantId);
  return (
    <>
      <PageHeader
        eyebrow="Διαχείριση"
        title="Μέλη & ρόλοι"
        description="Οι χρήστες του οργανισμού σας. Σύνδεση με email και κωδικό ή με Microsoft 365."
        actions={
          <FormDialog title="Πρόσκληση μέλους" description="Θα λάβει email με σύνδεσμο που ισχύει 7 ημέρες." action={inviteMemberAction.bind(null, tenantId)} submitLabel="Αποστολή πρόσκλησης" size="lg" trigger={<Button size="sm"><UserPlus aria-hidden /> Πρόσκληση</Button>}>
            <TextField name="email" label="Email" required type="email" autoComplete="off" />
            <RadioCards name="role" label="Ρόλος" defaultValue="TENANT_OPERATOR" options={ROLE_OPTIONS} />
          </FormDialog>
        }
      />
      <Section>
        <DataTable
          rows={members}
          rowKey={(m) => m.id}
          columns={[
            { key: "n", header: "Μέλος", cell: (m) => <span><span className="block font-medium">{m.name}</span><span className="block text-2xs text-muted-foreground">{m.email}</span></span> },
            { key: "r", header: "Ρόλος", cell: (m) => TENANT_ROLES[m.role as TenantRoleKey].label },
            { key: "s", header: "Κατάσταση", cell: (m) => (m.status === "ACTIVE" ? <Tag tone="success">Ενεργό</Tag> : <Tag tone="warning">Πρόσκληση</Tag>) },
            { key: "l", header: "Τελευταία σύνδεση", cell: (m) => fmtDateTime(m.lastLoginAt) },
            {
              key: "x",
              header: "",
              align: "right",
              cell: (m) => (
                <span className="inline-flex gap-1">
                  <FormDialog title={`Ρόλος: ${m.name}`} action={changeRoleAction.bind(null, tenantId, m.id)} size="lg" trigger={<Button variant="ghost" size="icon" className="size-8" aria-label={`Αλλαγή ρόλου ${m.name}`}><Pencil aria-hidden /></Button>}>
                    <RadioCards name="role" label="Ρόλος" defaultValue={m.role} options={ROLE_OPTIONS} />
                  </FormDialog>
                  {m.id !== user.id && <FormDialog title="Αφαίρεση μέλους" description={`Ο/η ${m.name} δεν θα έχει πλέον πρόσβαση σε αυτόν τον οργανισμό.`} action={removeMemberAction.bind(null, tenantId, m.id)} destructive submitLabel="Αφαίρεση" size="sm" trigger={<Button variant="ghost" size="icon" className="size-8 text-danger-500" aria-label={`Αφαίρεση ${m.name}`}><UserMinus aria-hidden /></Button>} />}
                </span>
              ),
            },
          ]}
        />
      </Section>
    </>
  );
}
