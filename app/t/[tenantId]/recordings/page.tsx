import type { Metadata } from "next";
import Link from "next/link";
import { Disc3, FileUp, Plus, Puzzle } from "lucide-react";
import { DataTable } from "@/components/dg/data-table";
import { fmtDateTime } from "@/components/dg/format";
import { FormDialog } from "@/components/dg/form-dialog";
import { FileField, SelectField, TextField } from "@/components/dg/fields";
import { PageHeader } from "@/components/dg/page-header";
import { Section } from "@/components/dg/section";
import { StatusBadge } from "@/components/dg/status-badge";
import { Button } from "@/components/ui/button";
import { importChromeRecordingAction, newRecordingAction } from "@/lib/actions/tenant";
import { listRecordings, targetOptions } from "@/lib/data/tenant";
import { RECORDING_STATUS } from "@/lib/labels";
import { EmptyState } from "@/components/dg/empty-state";
import { requireTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Καταγραφές" };

export default async function RecordingsPage({ params }: PageProps<"/t/[tenantId]/recordings">) {
  const { tenantId } = await params;
  await requireTenant(tenantId);
  const base = `/t/${tenantId}`;
  const [recordings, targets] = await Promise.all([listRecordings(tenantId), targetOptions(tenantId)]);

  return (
    <>
      <PageHeader
        eyebrow="Σχεδιασμός"
        title="Καταγραφές"
        description="Τα βήματα που καταγράφει το extension στον browser σας, έτοιμα να γίνουν ροές."
        actions={
          <>
          <FormDialog
            title="Εισαγωγή από Chrome Recorder"
            description="Καταγράψτε την καταχώριση με το ενσωματωμένο εργαλείο του Chrome και εισαγάγετε το αρχείο JSON. Δημιουργείται πρόχειρη ροή."
            action={importChromeRecordingAction.bind(null, tenantId)}
            submitLabel="Εισαγωγή"
            trigger={
              <Button size="sm" variant="outline">
                <FileUp aria-hidden /> Εισαγωγή από Chrome
              </Button>
            }
          >
            <ol className="list-decimal space-y-1 rounded-lg bg-muted/50 p-3 pl-7 text-sm text-muted-foreground">
              <li>Στο Chrome ανοίξτε το σύστημα‑στόχο, πατήστε F12 και επιλέξτε την καρτέλα «Recorder» (⋮ → More tools → Recorder).</li>
              <li>«Create a new recording» → «Start recording», κάντε την καταχώριση κανονικά, μετά «End recording».</li>
              <li>Εξαγωγή (εικονίδιο ⤓) → «JSON» και επιλέξτε το αρχείο εδώ.</li>
            </ol>
            <SelectField name="targetId" label="Σύστημα‑στόχος" required placeholder="Επιλέξτε…" options={targets} />
            <TextField name="name" label="Όνομα ροής" placeholder="Από τον τίτλο της καταγραφής" />
            <FileField name="file" label="Αρχείο JSON" required accept="application/json,.json" hint="Οι κωδικοί δεν αποθηκεύονται· γίνονται μεταβλητές {{secrets.…}} από το διαπιστευτήριο του συστήματος." />
          </FormDialog>
          <FormDialog
            title="Νέα καταγραφή"
            description="Δημιουργεί κωδικό σύνδεσης για το extension. Η καταγραφή γίνεται στον δικό σας browser."
            action={newRecordingAction.bind(null, tenantId)}
            submitLabel="Δημιουργία κωδικού"
            trigger={
              <Button size="sm">
                <Plus aria-hidden /> Νέα καταγραφή
              </Button>
            }
          >
            <TextField name="name" label="Όνομα" required placeholder="π.χ. Καταχώριση πελάτη" />
            <SelectField name="targetId" label="Σύστημα‑στόχος" required placeholder="Επιλέξτε…" options={targets} />
            <ol className="list-decimal space-y-1 rounded-lg bg-muted/50 p-3 pl-7 text-sm text-muted-foreground">
              <li>Εγκαταστήστε το extension «DG Complete Recorder» (Chrome / Edge).</li>
              <li>Ανοίξτε το και πληκτρολογήστε τον κωδικό σύνδεσης που θα εμφανιστεί.</li>
              <li>Κάντε την καταχώριση κανονικά και πατήστε «Ολοκληρώθηκε».</li>
            </ol>
          </FormDialog>
          </>
        }
      />
      <div className="mb-4 flex items-start gap-3 rounded-lg border border-sisyphus-200 bg-sisyphus-50 p-3 text-sm">
        <Puzzle aria-hidden className="mt-0.5 size-4 shrink-0 text-sisyphus-600" />
        <p>
          Τα πεδία κωδικών καταγράφονται ως μεταβλητές, ποτέ ως τιμές. Οι καταγραφές αποθηκεύουν στιγμιότυπα μόνο με μασκαρισμένα πεδία.
        </p>
      </div>
      <Section>
        <DataTable
          caption="Καταγραφές"
          rows={recordings}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={Disc3} title="Καμία καταγραφή" description="Ξεκινήστε μια καταγραφή και κάντε την καταχώριση κανονικά στον browser σας." />}
          columns={[
            { key: "n", header: "Καταγραφή", cell: (r) => <span className="inline-flex items-center gap-2 font-medium"><Disc3 aria-hidden className="size-4 text-muted-foreground" />{r.name}</span> },
            { key: "t", header: "Σύστημα", cell: (r) => r.target },
            { key: "s", header: "Κατάσταση", cell: (r) => <StatusBadge status={r.status} map={RECORDING_STATUS} /> },
            { key: "st", header: "Βήματα", align: "right", cell: (r) => r.steps },
            { key: "by", header: "Από", cell: (r) => r.createdBy },
            { key: "at", header: "Ημερομηνία", align: "right", cell: (r) => fmtDateTime(r.createdAt) },
            {
              key: "a",
              header: "",
              align: "right",
              cell: (r) =>
                r.workflowId ? (
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`${base}/workflows/${r.workflowId}`}>Άνοιγμα ροής</Link>
                  </Button>
                ) : r.status === "FINISHED" || r.status === "VERIFIED" ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`${base}/workflows?from=${r.id}`}>Μετατροπή σε ροή</Link>
                  </Button>
                ) : null,
            },
          ]}
        />
      </Section>
    </>
  );
}
