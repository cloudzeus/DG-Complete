import type { Metadata } from "next";
import { Check, X } from "lucide-react";
import { DiffView } from "@/components/dg/diff-view";
import { EmptyState } from "@/components/dg/empty-state";
import { fmtDateTime } from "@/components/dg/format";
import { FormDialog } from "@/components/dg/form-dialog";
import { TextareaField } from "@/components/dg/fields";
import { PageHeader } from "@/components/dg/page-header";
import { Screenshot } from "@/components/dg/screenshot";
import { Section } from "@/components/dg/section";
import { StatusBadge } from "@/components/dg/status-badge";
import { Button } from "@/components/ui/button";
import { VERSION_STATUS } from "@/lib/labels";
import { mockSubmit } from "@/lib/mock/actions";
import { targetName, workflows } from "@/lib/mock/data";
import { requireTenantAdmin } from "@/lib/tenant";
import { BadgeCheck } from "lucide-react";

export const metadata: Metadata = { title: "Εγκρίσεις" };

export default async function ApprovalsPage({ params }: PageProps<"/t/[tenantId]/approvals">) {
  const { tenantId } = await params;
  await requireTenantAdmin(tenantId);
  const pending = workflows.filter((w) => w.status === "PENDING_APPROVAL");
  const act = (f: Parameters<typeof mockSubmit>[1]) => mockSubmit.bind(null, tenantId, f);
  return (
    <>
      <PageHeader eyebrow="Εκτέλεση" title="Εγκρίσεις" description="Εκδόσεις ροών που περιμένουν έγκριση πριν δημοσιευτούν." />
      {pending.length === 0 && <EmptyState icon={BadgeCheck} title="Καμία έκδοση σε αναμονή" />}
      <div className="space-y-4">
        {pending.map((w) => (
          <Section
            key={w.id}
            title={`${w.name} · v${w.version}`}
            description={`${targetName(w.targetId)} · ${w.updatedBy} · ${fmtDateTime(w.updatedAt)}`}
            actions={
              <>
                <StatusBadge status={w.status} map={VERSION_STATUS} />
                <FormDialog title="Απόρριψη" description="Η έκδοση επιστρέφει σε πρόχειρο με το σχόλιό σας." action={act("reject")} destructive submitLabel="Απόρριψη" size="sm" trigger={<Button size="sm" variant="outline"><X aria-hidden /> Απόρριψη</Button>}>
                  <TextareaField name="note" label="Σχόλιο" required rows={3} />
                </FormDialog>
                <FormDialog title="Έγκριση & δημοσίευση" description="Η έκδοση γίνεται διαθέσιμη στις μεθόδους." action={act("approve")} submitLabel="Έγκριση" size="sm" trigger={<Button size="sm"><Check aria-hidden /> Έγκριση</Button>}>
                  <TextareaField name="note" label="Σχόλιο (προαιρετικό)" rows={2} />
                </FormDialog>
              </>
            }
          >
            <div className="grid gap-4 *:min-w-0 xl:grid-cols-2">
              <div>
                <p className="eyebrow mb-2">Διαφορές με την τρέχουσα</p>
                <DiffView from={w.version - 1} to={w.version} />
              </div>
              <div>
                <p className="eyebrow mb-2">Τελευταία δοκιμαστική εκτέλεση · επιτυχής</p>
                <Screenshot alt={`Τελικό στιγμιότυπο δοκιμής της ${w.name} v${w.version}`} highlight={false} />
              </div>
            </div>
          </Section>
        ))}
      </div>
    </>
  );
}
