import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Check, X } from "lucide-react";
import { DiffView } from "@/components/dg/diff-view";
import { EmptyState } from "@/components/dg/empty-state";
import { fmtDateTime } from "@/components/dg/format";
import { FormDialog } from "@/components/dg/form-dialog";
import { TextareaField } from "@/components/dg/fields";
import { PageHeader } from "@/components/dg/page-header";
import { Section } from "@/components/dg/section";
import { StatusBadge, Tag } from "@/components/dg/status-badge";
import { Button } from "@/components/ui/button";
import { approveVersionAction, rejectVersionAction } from "@/lib/actions/tenant";
import { pendingApprovals } from "@/lib/data/tenant";
import { VERSION_STATUS } from "@/lib/labels";
import { requireTenantAdmin } from "@/lib/tenant";

export const metadata: Metadata = { title: "Εγκρίσεις" };

export default async function ApprovalsPage({ params }: PageProps<"/t/[tenantId]/approvals">) {
  const { tenantId } = await params;
  await requireTenantAdmin(tenantId);
  const pending = await pendingApprovals(tenantId);
  return (
    <>
      <PageHeader eyebrow="Εκτέλεση" title="Εγκρίσεις" description="Εκδόσεις ροών που περιμένουν έγκριση πριν δημοσιευτούν. Χωρίς επιτυχημένη δοκιμή δεν επιτρέπεται έγκριση." />
      {pending.length === 0 && <EmptyState icon={BadgeCheck} title="Καμία έκδοση σε αναμονή" />}
      <div className="space-y-4">
        {pending.map((w) => (
          <Section
            key={w.id}
            title={`${w.name} · v${w.version}`}
            description={`${w.target} · ${w.submittedBy} · ${fmtDateTime(w.submittedAt)}${w.note ? ` · «${w.note}»` : ""}`}
            actions={
              <>
                <StatusBadge status={w.status} map={VERSION_STATUS} />
                <FormDialog title="Απόρριψη" description="Η έκδοση επιστρέφει σε πρόχειρο με το σχόλιό σας." action={rejectVersionAction.bind(null, tenantId, w.id)} destructive submitLabel="Απόρριψη" size="sm" trigger={<Button size="sm" variant="outline"><X aria-hidden /> Απόρριψη</Button>}>
                  <TextareaField name="note" label="Σχόλιο" required rows={3} />
                </FormDialog>
                {w.testOk && (
                  <FormDialog title="Έγκριση & δημοσίευση" description="Η έκδοση γίνεται διαθέσιμη στις μεθόδους." action={approveVersionAction.bind(null, tenantId, w.id)} submitLabel="Έγκριση" size="sm" trigger={<Button size="sm"><Check aria-hidden /> Έγκριση</Button>}>
                    <TextareaField name="note" label="Σχόλιο (προαιρετικό)" rows={2} />
                  </FormDialog>
                )}
              </>
            }
          >
            <div className="grid gap-4 *:min-w-0 xl:grid-cols-2">
              <div>
                <p className="eyebrow mb-2">Διαφορές με την τρέχουσα</p>
                <DiffView from={w.prevVersion} to={w.version} before={w.prevDefinition} after={w.definition} />
              </div>
              <div>
                <p className="eyebrow mb-2">Τελευταία δοκιμαστική εκτέλεση</p>
                {w.testRunId ? (
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    {w.testOk ? <Tag tone="success">Επιτυχής</Tag> : <Tag tone="danger">Χωρίς επιτυχία</Tag>}
                    <Link className="text-primary hover:underline" href={`/t/${tenantId}/runs/${w.testRunId}`}>
                      Άνοιγμα εκτέλεσης
                    </Link>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Δεν έχει γίνει δοκιμή — ζητήστε από τον συντάκτη να εκτελέσει δοκιμή.</p>
                )}
              </div>
            </div>
          </Section>
        ))}
      </div>
    </>
  );
}
