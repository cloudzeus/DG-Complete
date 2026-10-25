import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, Plus } from "lucide-react";
import { fmtNum } from "@/components/dg/format";
import { FormDialog } from "@/components/dg/form-dialog";
import { TextareaField, TextField } from "@/components/dg/fields";
import { PageHeader } from "@/components/dg/page-header";
import { Grid } from "@/components/dg/section";
import { Button } from "@/components/ui/button";
import { newCollectionAction } from "@/lib/actions/tenant";
import { listCollections } from "@/lib/data/tenant";
import { EmptyState } from "@/components/dg/empty-state";
import { requireTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Συλλογές μεθόδων" };

export default async function CollectionsPage({ params }: PageProps<"/t/[tenantId]/collections">) {
  const { tenantId } = await params;
  await requireTenant(tenantId);
  const base = `/t/${tenantId}/collections`;
  const collections = await listCollections(tenantId);
  return (
    <>
      <PageHeader
        eyebrow="Εκτέλεση"
        title="Συλλογές μεθόδων"
        description="Οι ροές εκτίθενται ως μέθοδοι API, οργανωμένες σε συλλογές με δική τους τεκμηρίωση."
        actions={
          <FormDialog title="Νέα συλλογή" action={newCollectionAction.bind(null, tenantId)} submitLabel="Δημιουργία" trigger={<Button size="sm"><Plus aria-hidden /> Νέα συλλογή</Button>}>
            <TextField name="name" label="Όνομα" required />
            <TextareaField name="description" label="Περιγραφή" rows={3} />
          </FormDialog>
        }
      />
      {collections.length === 0 && <EmptyState icon={Boxes} title="Καμία συλλογή" description="Οι συλλογές ομαδοποιούν μεθόδους API με κοινή τεκμηρίωση και κλειδιά." />}
      <Grid cols={3}>
        {collections.map((c) => (
          <Link key={c.id} href={`${base}/${c.id}`} className="group rounded-lg border border-border/70 bg-card p-4 shadow-fluent-2 transition-shadow duration-150 hover:shadow-fluent-8">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-sisyphus-50 text-sisyphus-600">
                <Boxes aria-hidden className="size-5" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold group-hover:text-primary">{c.name}</h2>
                <p className="line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-border/60 pt-3 text-sm">
              <div>
                <dt className="eyebrow">Μέθοδοι</dt>
                <dd className="text-xl font-semibold tabular-nums">{c.methods}</dd>
              </div>
              <div>
                <dt className="eyebrow">Κλήσεις 7 ημ.</dt>
                <dd className="text-xl font-semibold tabular-nums">{fmtNum(c.calls7d)}</dd>
              </div>
            </dl>
          </Link>
        ))}
      </Grid>
    </>
  );
}
