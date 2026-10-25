import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, KeyRound, LogOut, Pencil } from "lucide-react";
import { FormDialog } from "@/components/dg/form-dialog";
import { TextField } from "@/components/dg/fields";
import { PageHeader } from "@/components/dg/page-header";
import { Grid, Section } from "@/components/dg/section";
import { Button } from "@/components/ui/button";
import { changePasswordAction, signOutAction, updateProfileAction } from "@/lib/auth-actions";
import { requireUser } from "@/lib/rbac";

export const metadata: Metadata = { title: "Ο λογαριασμός μου" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="dg-canvas min-h-svh">
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft aria-hidden className="size-4" /> Επιστροφή
        </Link>
        <PageHeader
          title="Ο λογαριασμός μου"
          description={user.email}
          actions={
            <form action={signOutAction}>
              <Button type="submit" variant="outline" size="sm">
                <LogOut aria-hidden /> Αποσύνδεση
              </Button>
            </form>
          }
        />
        <Grid cols={2}>
          <Section
            title="Στοιχεία"
            actions={
              <FormDialog title="Στοιχεία" action={updateProfileAction} size="sm" trigger={<Button size="sm" variant="outline"><Pencil aria-hidden /> Επεξεργασία</Button>}>
                <TextField name="name" label="Ονοματεπώνυμο" required defaultValue={user.name} autoComplete="name" />
              </FormDialog>
            }
          >
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Όνομα</dt>
              <dd>{user.name}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="break-all">{user.email}</dd>
              <dt className="text-muted-foreground">Οργανισμοί</dt>
              <dd>{user.memberships.map((m) => m.tenantName).join(", ") || "—"}</dd>
            </dl>
          </Section>
          <Section
            title="Ασφάλεια"
            actions={
              <FormDialog title="Αλλαγή κωδικού" description="Οι άλλες συνδέσεις σας θα τερματιστούν." action={changePasswordAction} size="sm" trigger={<Button size="sm" variant="outline"><KeyRound aria-hidden /> Αλλαγή κωδικού</Button>}>
                <TextField name="current" label="Τρέχων κωδικός" type="password" autoComplete="current-password" required />
                <TextField name="password" label="Νέος κωδικός" type="password" autoComplete="new-password" required hint="Τουλάχιστον 10 χαρακτήρες." />
                <TextField name="confirm" label="Επιβεβαίωση" type="password" autoComplete="new-password" required />
              </FormDialog>
            }
          >
            <p className="text-sm text-muted-foreground">Σύνδεση με email και κωδικό. Η σύνδεση με Microsoft 365 ενεργοποιείται από τον διαχειριστή.</p>
          </Section>
        </Grid>
      </main>
    </div>
  );
}
