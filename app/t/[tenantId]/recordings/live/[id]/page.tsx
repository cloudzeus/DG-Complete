import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, X } from "lucide-react";
import { FormDialog } from "@/components/dg/form-dialog";
import { TextField } from "@/components/dg/fields";
import { PageHeader } from "@/components/dg/page-header";
import { LiveRecorder } from "@/components/recorder/live-recorder";
import { Button } from "@/components/ui/button";
import { cancelLiveRecordingAction, finishLiveRecordingAction } from "@/lib/actions/tenant";
import { requirePermission } from "@/lib/rbac";
import { getSession, snapshot } from "@/lib/recorder/live";

export const metadata: Metadata = { title: "Καταγραφή" };

export default async function LiveRecordingPage({ params }: PageProps<"/t/[tenantId]/recordings/live/[id]">) {
  const { tenantId, id } = await params;
  const user = await requirePermission("tenant.workflows.edit", tenantId);
  const s = getSession(id, tenantId, user.id);
  if (!s) notFound();
  const state = snapshot(s);
  return (
    <>
      <PageHeader crumbs={[{ href: `/t/${tenantId}/recordings`, label: "Καταγραφές" }]} title={state.name} description="Κάντε την καταχώριση όπως στον browser σας. Κάθε ενέργεια γίνεται βήμα της ροής." />
      <LiveRecorder
        tenantId={tenantId}
        initial={JSON.parse(JSON.stringify(state))}
        finish={
          <FormDialog
            title="Ολοκλήρωση καταγραφής"
            description="Δημιουργείται πρόχειρη ροή με τα βήματα και τις εισόδους. Μετά μπορείτε να τη δοκιμάσετε."
            action={finishLiveRecordingAction.bind(null, tenantId, id)}
            submitLabel="Δημιουργία ροής"
            trigger={
              <Button size="sm">
                <Check aria-hidden /> Ολοκλήρωση
              </Button>
            }
          >
            <TextField name="name" label="Όνομα ροής" defaultValue={state.name} required />
          </FormDialog>
        }
        cancel={
          <FormDialog
            title="Ακύρωση καταγραφής"
            description="Τα βήματα δεν θα αποθηκευτούν."
            action={cancelLiveRecordingAction.bind(null, tenantId, id)}
            destructive
            submitLabel="Ακύρωση καταγραφής"
            trigger={
              <Button size="sm" variant="outline">
                <X aria-hidden /> Ακύρωση
              </Button>
            }
          />
        }
      />
    </>
  );
}
