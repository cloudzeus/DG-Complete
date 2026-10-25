import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { DataTable } from "@/components/dg/data-table";
import { fmtDateTime, fmtNum } from "@/components/dg/format";
import { FormDialog } from "@/components/dg/form-dialog";
import { FormRow, TextField } from "@/components/dg/fields";
import { KpiTile } from "@/components/dg/kpi-tile";
import { LinkTabs } from "@/components/dg/link-tabs";
import { PageHeader } from "@/components/dg/page-header";
import { Grid, Section } from "@/components/dg/section";
import { StatusBadge, Tag } from "@/components/dg/status-badge";
import { Button } from "@/components/ui/button";
import { VERSION_STATUS } from "@/lib/labels";
import { mockSubmit } from "@/lib/mock/actions";
import { byId, credentials, targets, workflows } from "@/lib/mock/data";
import { requireTenant } from "@/lib/tenant";
import { HEALTH } from "../shared";

export const metadata: Metadata = { title: "Σύστημα‑στόχος" };

export default async function TargetPage({ params, searchParams }: PageProps<"/t/[tenantId]/targets/[id]">) {
  const { tenantId, id } = await params;
  const { tab = "general" } = await searchParams;
  await requireTenant(tenantId);
  const t = byId(targets, id);
  if (!t) notFound();
  const base = `/t/${tenantId}`;
  const creds = credentials.filter((c) => c.targetId === t.id);
  const wfs = workflows.filter((w) => w.targetId === t.id);
  const act = (f: Parameters<typeof mockSubmit>[1]) => mockSubmit.bind(null, tenantId, f);

  return (
    <>
      <PageHeader
        crumbs={[{ href: `${base}/targets`, label: "Συστήματα‑στόχοι" }]}
        title={t.name}
        description={<span className="font-mono text-xs">{t.baseUrl}</span>}
        actions={
          <>
            <StatusBadge status={t.health} map={HEALTH} />
            <FormDialog
              title="Επεξεργασία συστήματος"
              action={act("editTarget")}
              trigger={
                <Button variant="outline" size="sm">
                  <Pencil aria-hidden /> Επεξεργασία
                </Button>
              }
            >
              <TextField name="name" label="Όνομα" required defaultValue={t.name} />
              <TextField name="baseUrl" label="Διεύθυνση" required type="url" defaultValue={t.baseUrl} />
              <TextField name="maxConcurrency" label="Ταυτόχρονες εκτελέσεις" required type="number" defaultValue={t.maxConcurrency} />
            </FormDialog>
          </>
        }
      />
      <LinkTabs
        base={`${base}/targets/${t.id}`}
        active={String(tab)}
        tabs={[
          { key: "general", label: "Γενικά" },
          { key: "credentials", label: "Διαπιστευτήρια", count: creds.length },
          { key: "workflows", label: "Ροές", count: wfs.length },
          { key: "health", label: "Υγεία" },
        ]}
      />

      {tab === "general" && (
        <Grid cols={2}>
          <Section title="Ρυθμίσεις">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Ταυτόχρονες εκτελέσεις</dt>
              <dd className="tabular-nums">{t.maxConcurrency}</dd>
              <dt className="text-muted-foreground">Επιτρεπτά origins</dt>
              <dd className="flex flex-wrap gap-1">
                {t.origins.map((o) => (
                  <Tag key={o} className="font-mono">
                    {o}
                  </Tag>
                ))}
              </dd>
              <dt className="text-muted-foreground">Τελευταία εκτέλεση</dt>
              <dd>{fmtDateTime(t.lastRunAt)}</dd>
            </dl>
          </Section>
          <Section title="Ανίχνευση σφαλμάτων" description="Τι θεωρείται μήνυμα σφάλματος του συστήματος μετά από κάθε υποβολή">
            <ul className="space-y-2 text-sm">
              {[".alert-danger", "[role=alert]", 'text "Μη έγκυρ"'].map((d) => (
                <li key={d} className="flex items-center justify-between rounded-sm border border-border/70 px-3 py-2">
                  <code className="font-mono text-xs">{d}</code>
                  <Tag tone="danger">σφάλμα δεδομένων</Tag>
                </li>
              ))}
            </ul>
          </Section>
        </Grid>
      )}

      {tab === "credentials" && (
        <Section
          title="Διαπιστευτήρια"
          description="Αποθηκεύονται κρυπτογραφημένα· αποκρυπτογραφούνται μόνο από τον worker. Οι κωδικοί δεν εμφανίζονται ποτέ."
          actions={
            <FormDialog
              title="Νέο διαπιστευτήριο"
              description={`Για το σύστημα ${t.name}`}
              action={act("addCredential")}
              trigger={
                <Button size="sm">
                  <Plus aria-hidden /> Προσθήκη
                </Button>
              }
            >
              <TextField name="label" label="Περιγραφή" required placeholder="π.χ. Λογιστήριο — κύριος" />
              <FormRow>
                <TextField name="username" label="Όνομα χρήστη" required autoComplete="off" />
                <TextField name="password" label="Κωδικός" required type="password" autoComplete="new-password" />
              </FormRow>
              <TextField name="totpSecret" label="Μυστικό TOTP (προαιρετικό)" type="password" autoComplete="off" hint="Για συστήματα με κωδικό μίας χρήσης από εφαρμογή." />
            </FormDialog>
          }
        >
          <DataTable
            rows={creds}
            rowKey={(c) => c.id}
            columns={[
              { key: "l", header: "Περιγραφή", cell: (c) => <span className="inline-flex items-center gap-2 font-medium"><KeyRound aria-hidden className="size-4 text-muted-foreground" />{c.label}</span> },
              { key: "u", header: "Χρήστης", cell: (c) => <span className="font-mono text-xs">{c.username}</span> },
              { key: "used", header: "Τελευταία χρήση", cell: (c) => fmtDateTime(c.lastUsedAt) },
              { key: "upd", header: "Ενημέρωση", cell: (c) => fmtDateTime(c.updatedAt) },
              {
                key: "x",
                header: "",
                align: "right",
                cell: (c) => (
                  <FormDialog
                    title="Διαγραφή διαπιστευτηρίου"
                    description={`Το «${c.label}» θα διαγραφεί. Οι ροές που το χρησιμοποιούν θα αποτυγχάνουν μέχρι να οριστεί άλλο.`}
                    action={act("cancel")}
                    destructive
                    submitLabel="Διαγραφή"
                    size="sm"
                    trigger={
                      <Button variant="ghost" size="icon" className="size-8 text-danger-500" aria-label={`Διαγραφή ${c.label}`}>
                        <Trash2 aria-hidden />
                      </Button>
                    }
                  />
                ),
              },
            ]}
          />
        </Section>
      )}

      {tab === "workflows" && (
        <Section title="Ροές του συστήματος">
          <DataTable
            rows={wfs}
            rowKey={(w) => w.id}
            columns={[
              { key: "n", header: "Ροή", cell: (w) => <Link className="font-medium hover:text-primary hover:underline" href={`${base}/workflows/${w.id}`}>{w.name}</Link> },
              { key: "v", header: "Έκδοση", cell: (w) => `v${w.version}` },
              { key: "s", header: "Κατάσταση", cell: (w) => <StatusBadge status={w.status} map={VERSION_STATUS} /> },
              { key: "m", header: "Μέθοδοι", align: "right", cell: (w) => w.methods },
            ]}
          />
        </Section>
      )}

      {tab === "health" && (
        <Grid cols={3}>
          <KpiTile label="Επιτυχία 7 ημ." value={`${fmtNum(t.successRate, 1)}%`} />
          <KpiTile label="Εναλλακτικοί επιλογείς" value="3,1%" hint="των βημάτων χρησιμοποίησαν fallback" />
          <KpiTile label="Μέσος χρόνος απόκρισης" value="1,4″" hint="ανά πλοήγηση" />
        </Grid>
      )}
    </>
  );
}
