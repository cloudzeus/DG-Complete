import type { Metadata } from "next";
import { ShoppingCart } from "lucide-react";
import { StackedBars } from "@/components/dg/bar-chart";
import { DataTable } from "@/components/dg/data-table";
import { fmtDate, fmtNum } from "@/components/dg/format";
import { FormDialog } from "@/components/dg/form-dialog";
import { RadioCards } from "@/components/dg/fields";
import { KpiTile } from "@/components/dg/kpi-tile";
import { PageHeader } from "@/components/dg/page-header";
import { Progress } from "@/components/dg/progress";
import { Grid, Section } from "@/components/dg/section";
import { Button } from "@/components/ui/button";
import { buyCreditsAction } from "@/lib/actions/tenant";
import { runPacks, usageSummary } from "@/lib/data/tenant";
import { can } from "@/lib/rbac";
import { requireTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Χρήση & πακέτο" };

export default async function UsagePage({ params }: PageProps<"/t/[tenantId]/usage">) {
  const { tenantId } = await params;
  const { user } = await requireTenant(tenantId);
  const [usage, packs] = await Promise.all([usageSummary(tenantId), runPacks()]);
  return (
    <>
      <PageHeader
        eyebrow="Διαχείριση"
        title="Χρήση & πακέτο"
        description={`Πακέτο ${usage.plan} · ${fmtNum(usage.runsMonthly)} εκτελέσεις / μήνα`}
        actions={
          can(user, "tenant.billing.manage", tenantId) && packs.length > 0 && (
            <FormDialog title="Αγορά πακέτου εκτελέσεων" description="Η χρέωση στέλνεται στο SoftOne της DGsoft· οι εκτελέσεις προστίθενται μετά την έγκριση." action={buyCreditsAction.bind(null, tenantId)} submitLabel="Αίτημα αγοράς" size="lg" trigger={<Button size="sm"><ShoppingCart aria-hidden /> Αγορά εκτελέσεων</Button>}>
              <RadioCards name="pack" label="Πακέτο" defaultValue={packs[0].id} options={packs.map((p) => ({ value: p.id, label: p.name, hint: `${fmtNum(Number(p.priceEur), 2)} € με ΦΠΑ` }))} />
            </FormDialog>
          )
        }
      />
      <Grid cols={4}>
        <KpiTile label="Υπόλοιπο" value={fmtNum(usage.balance)} hint="εκτελέσεις" />
        <KpiTile label="Χρήση μήνα" value={fmtNum(usage.used)} hint={`από ${fmtNum(usage.runsMonthly)}`} />
        <KpiTile label="Επιπλέον πακέτα" value={fmtNum(usage.extraCredits)} hint="δεν λήγουν" />
        <KpiTile label="Υπέρβαση" value={usage.overagePrice === null ? "Όχι" : `${fmtNum(usage.overagePrice, 2)} €`} hint={usage.overagePrice === null ? "νέες εκτελέσεις σταματούν στο 0" : "ανά εκτέλεση"} />
      </Grid>
      <Section className="mt-4" title="Κατανάλωση μήνα">
        <div className="mb-4 max-w-xl">
          <Progress total={usage.runsMonthly} done={usage.used} label="Κατανάλωση μηνιαίου πακέτου" />
        </div>
        {usage.daily.length ? (
          <StackedBars label="Εκτελέσεις ανά ημέρα του μήνα" data={usage.daily.map((d) => ({ label: String(d.day), succeeded: d.succeeded, failed: d.failed }))} />
        ) : (
          <p className="text-sm text-muted-foreground">Καμία εκτέλεση αυτόν τον μήνα.</p>
        )}
      </Section>
      <Section className="mt-4" title="Κινήσεις" description="Μόνο επιτυχείς ή αποτυχημένες εκτελέσεις χρεώνονται· οι HELD και οι ακυρωμένες πριν ξεκινήσουν όχι.">
        <DataTable
          rows={usage.ledger}
          rowKey={(l) => l.id}
          empty={<p className="text-sm text-muted-foreground">Καμία κίνηση.</p>}
          columns={[
            { key: "t", header: "Ημερομηνία", cell: (l) => fmtDate(l.at) },
            { key: "k", header: "Κίνηση", cell: (l) => l.kind },
            { key: "a", header: "Εκτελέσεις", align: "right", cell: (l) => <span className={l.amount < 0 ? "text-danger-500" : "text-success-500"}>{l.amount > 0 ? "+" : ""}{fmtNum(l.amount)}</span> },
          ]}
        />
      </Section>
    </>
  );
}
