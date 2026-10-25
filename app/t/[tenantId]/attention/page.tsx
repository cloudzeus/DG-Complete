import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/dg/empty-state";
import { fmtDateTime } from "@/components/dg/format";
import { FormDialog } from "@/components/dg/form-dialog";
import { TextField } from "@/components/dg/fields";
import { PageHeader } from "@/components/dg/page-header";
import { Section } from "@/components/dg/section";
import { StatusBadge } from "@/components/dg/status-badge";
import { Button } from "@/components/ui/button";
import { cancelRunAction, resumeRunAction } from "@/lib/actions/tenant";
import { listRuns } from "@/lib/data/tenant";
import { RUN_STATUS } from "@/lib/labels";
import { requireTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Προς ενέργεια" };

export default async function AttentionPage({ params }: PageProps<"/t/[tenantId]/attention">) {
  const { tenantId } = await params;
  await requireTenant(tenantId);
  const items = await listRuns(tenantId, { status: "NEEDS_ATTENTION", take: 100 });

  return (
    <>
      <PageHeader eyebrow="Εκτέλεση" title="Προς ενέργεια" description="Εκτελέσεις σε παύση που χρειάζονται χειριστή: OTP, CAPTCHA ή επιβεβαίωση." />
      {items.length === 0 ? (
        <EmptyState icon={Inbox} title="Τίποτα σε αναμονή" description="Όταν μια εκτέλεση χρειαστεί κωδικό ή επιβεβαίωση, θα εμφανιστεί εδώ." />
      ) : (
        <div className="space-y-4">
          {items.map((r) => (
            <Section key={r.id} bodyClassName="space-y-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={r.status} map={RUN_STATUS} />
                <Link href={`/t/${tenantId}/runs/${r.id}`} className="font-mono text-xs text-primary hover:underline">{r.id}</Link>
                <span className="text-xs text-muted-foreground">{fmtDateTime(r.createdAt)}</span>
              </div>
              <h2 className="text-xl font-semibold">{r.methodName}</h2>
              <p className="flex items-start gap-2 text-sm">
                <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning-500" /> {r.error?.message || "Το σύστημα ζητά ενέργεια χειριστή."}
              </p>
              <div className="flex flex-wrap gap-2">
                <FormDialog title="Κωδικός OTP" description="Ο κωδικός χρησιμοποιείται μία φορά και δεν αποθηκεύεται πουθενά." action={resumeRunAction.bind(null, tenantId, r.id)} submitLabel="Συνέχεια εκτέλεσης" size="sm" trigger={<Button size="sm">Εισαγωγή κωδικού</Button>}>
                  <TextField name="otp" label="Κωδικός" required inputMode="numeric" autoComplete="one-time-code" placeholder="6 ψηφία" />
                </FormDialog>
                <FormDialog title="Ακύρωση εκτέλεσης" action={cancelRunAction.bind(null, tenantId, r.id)} destructive submitLabel="Ακύρωση εκτέλεσης" size="sm" trigger={<Button size="sm" variant="outline">Ακύρωση</Button>} />
              </div>
            </Section>
          ))}
        </div>
      )}
    </>
  );
}
