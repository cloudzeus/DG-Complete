import type { Metadata } from "next";
import Link from "next/link";
import { Disc3, Plus, Puzzle } from "lucide-react";
import { DataTable } from "@/components/dg/data-table";
import { fmtDateTime } from "@/components/dg/format";
import { FormDialog } from "@/components/dg/form-dialog";
import { SelectField, TextField } from "@/components/dg/fields";
import { PageHeader } from "@/components/dg/page-header";
import { Section } from "@/components/dg/section";
import { StatusBadge } from "@/components/dg/status-badge";
import { Button } from "@/components/ui/button";
import { mockSubmit } from "@/lib/mock/actions";
import { recordings, targetName, targets } from "@/lib/mock/data";
import { requireTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Καταγραφές" };

const STATUS = {
  RECORDING: { label: "Σε εξέλιξη", tone: "info" as const },
  COMPLETED: { label: "Ολοκληρώθηκε", tone: "success" as const },
  CONVERTED: { label: "Έγινε ροή", tone: "muted" as const },
};

export default async function RecordingsPage({ params }: PageProps<"/t/[tenantId]/recordings">) {
  const { tenantId } = await params;
  await requireTenant(tenantId);
  const base = `/t/${tenantId}`;

  return (
    <>
      <PageHeader
        eyebrow="Σχεδιασμός"
        title="Καταγραφές"
        description="Τα βήματα που καταγράφει το extension στον browser σας, έτοιμα να γίνουν ροές."
        actions={
          <FormDialog
            title="Νέα καταγραφή"
            description="Δημιουργεί κωδικό σύνδεσης για το extension. Η καταγραφή γίνεται στον δικό σας browser."
            action={mockSubmit.bind(null, tenantId, "newRecording")}
            submitLabel="Δημιουργία κωδικού"
            trigger={
              <Button size="sm">
                <Plus aria-hidden /> Νέα καταγραφή
              </Button>
            }
          >
            <TextField name="name" label="Όνομα" required placeholder="π.χ. Καταχώριση πελάτη" />
            <SelectField name="targetId" label="Σύστημα‑στόχος" required placeholder="Επιλέξτε…" options={targets.map((t) => ({ value: t.id, label: t.name }))} />
            <ol className="list-decimal space-y-1 rounded-lg bg-muted/50 p-3 pl-7 text-sm text-muted-foreground">
              <li>Εγκαταστήστε το extension «DG Complete Recorder» (Chrome / Edge).</li>
              <li>Ανοίξτε το και πληκτρολογήστε τον κωδικό σύνδεσης που θα εμφανιστεί.</li>
              <li>Κάντε την καταχώριση κανονικά και πατήστε «Ολοκληρώθηκε».</li>
            </ol>
          </FormDialog>
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
          columns={[
            { key: "n", header: "Καταγραφή", cell: (r) => <span className="inline-flex items-center gap-2 font-medium"><Disc3 aria-hidden className="size-4 text-muted-foreground" />{r.name}</span> },
            { key: "t", header: "Σύστημα", cell: (r) => targetName(r.targetId) },
            { key: "s", header: "Κατάσταση", cell: (r) => <StatusBadge status={r.status} map={STATUS} /> },
            { key: "st", header: "Βήματα", align: "right", cell: (r) => r.steps },
            { key: "by", header: "Από", cell: (r) => r.createdBy },
            { key: "at", header: "Ημερομηνία", align: "right", cell: (r) => fmtDateTime(r.createdAt) },
            {
              key: "a",
              header: "",
              align: "right",
              cell: (r) =>
                r.status === "COMPLETED" ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`${base}/workflows/wf_customer`}>Μετατροπή σε ροή</Link>
                  </Button>
                ) : null,
            },
          ]}
        />
      </Section>
    </>
  );
}
