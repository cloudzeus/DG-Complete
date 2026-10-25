import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/dg/empty-state";
import { fmtDateTime } from "@/components/dg/format";
import { FormDialog } from "@/components/dg/form-dialog";
import { TextField } from "@/components/dg/fields";
import { PageHeader } from "@/components/dg/page-header";
import { Screenshot } from "@/components/dg/screenshot";
import { Section } from "@/components/dg/section";
import { StatusBadge } from "@/components/dg/status-badge";
import { Button } from "@/components/ui/button";
import { RUN_STATUS } from "@/lib/labels";
import { mockSubmit } from "@/lib/mock/actions";
import { methodOf, runs } from "@/lib/mock/data";
import { requireTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Προς ενέργεια" };

export default async function AttentionPage({ params }: PageProps<"/t/[tenantId]/attention">) {
  const { tenantId } = await params;
  await requireTenant(tenantId);
  const items = runs.filter((r) => r.status === "NEEDS_ATTENTION");
  const act = (f: Parameters<typeof mockSubmit>[1]) => mockSubmit.bind(null, tenantId, f);

  return (
    <>
      <PageHeader eyebrow="Εκτέλεση" title="Προς ενέργεια" description="Εκτελέσεις σε παύση που χρειάζονται χειριστή: OTP, CAPTCHA ή επιβεβαίωση." />
      {items.length === 0 ? (
        <EmptyState icon={Inbox} title="Τίποτα σε αναμονή" description="Όταν μια εκτέλεση χρειαστεί κωδικό ή επιβεβαίωση, θα εμφανιστεί εδώ." />
      ) : (
        <div className="space-y-4">
          {items.map((r) => (
            <Section key={r.id} bodyClassName="grid gap-4 *:min-w-0 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={r.status} map={RUN_STATUS} />
                  <Link href={`/t/${tenantId}/runs/${r.id}`} className="font-mono text-xs text-primary hover:underline">{r.id}</Link>
                  <span className="text-xs text-muted-foreground">{fmtDateTime(r.createdAt)} · λήγει σε 14′</span>
                </div>
                <h2 className="text-xl font-semibold">{methodOf(r.methodId)?.name}</h2>
                <p className="flex items-start gap-2 text-sm"><ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning-500" /> {r.error?.message}. Το σύστημα έστειλε SMS στο κινητό του υπευθύνου.</p>
                <div className="flex flex-wrap gap-2">
                  <FormDialog title="Κωδικός OTP" description="Ο κωδικός χρησιμοποιείται μία φορά και δεν αποθηκεύεται πουθενά." action={act("resumeRun")} submitLabel="Συνέχεια εκτέλεσης" size="sm" trigger={<Button size="sm">Εισαγωγή κωδικού</Button>}>
                    <TextField name="otp" label="Κωδικός" required inputMode="numeric" autoComplete="one-time-code" placeholder="6 ψηφία" />
                  </FormDialog>
                  <FormDialog title="Ακύρωση εκτέλεσης" action={act("cancel")} destructive submitLabel="Ακύρωση εκτέλεσης" size="sm" trigger={<Button size="sm" variant="outline">Ακύρωση</Button>} />
                </div>
              </div>
              <Screenshot alt={`Στιγμιότυπο αναμονής στο βήμα ${r.error?.step}`} highlight={false} />
            </Section>
          ))}
        </div>
      )}
    </>
  );
}
