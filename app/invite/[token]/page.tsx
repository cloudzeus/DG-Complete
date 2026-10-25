import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { TextField } from "@/components/dg/fields";
import { acceptInviteAction } from "@/lib/auth-actions";

export const metadata: Metadata = { title: "Πρόσκληση" };

// Invitation link from the email (P03 issues the tokens). Shows who invited you and to which organisation.
export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  return (
    <AuthShell title="Αποδοχή πρόσκλησης" description="Η Μαρία Παππά σας προσκάλεσε στον οργανισμό «Demo Α.Ε.» με ρόλο Χειριστή.">
      <AuthForm action={acceptInviteAction.bind(null, token)} submitLabel="Δημιουργία λογαριασμού" pendingLabel="Δημιουργία…">
        <TextField name="name" label="Ονοματεπώνυμο" autoComplete="name" required large />
        <TextField name="password" label="Κωδικός" type="password" autoComplete="new-password" required large hint="Τουλάχιστον 10 χαρακτήρες." />
        <TextField name="confirm" label="Επιβεβαίωση κωδικού" type="password" autoComplete="new-password" required large />
      </AuthForm>
    </AuthShell>
  );
}
