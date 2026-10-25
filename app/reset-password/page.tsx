import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { TextField } from "@/components/dg/fields";
import { Button } from "@/components/ui/button";
import { resetPasswordAction } from "@/lib/auth-actions";

export const metadata: Metadata = { title: "Νέος κωδικός" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token, error, welcome } = await searchParams;
  const valid = typeof token === "string" && token.length > 10 && !error;
  return (
    <AuthShell
      title={welcome ? "Ορίστε τον κωδικό σας" : "Νέος κωδικός"}
      description={welcome ? "Καλώς ήρθατε στο DG Complete. Διαλέξτε κωδικό για τον λογαριασμό σας." : "Διαλέξτε νέο κωδικό για τον λογαριασμό σας."}
    >
      {valid ? (
        <AuthForm action={resetPasswordAction.bind(null, token)} submitLabel="Αποθήκευση κωδικού" pendingLabel="Αποθήκευση…">
          <TextField name="password" label="Νέος κωδικός" type="password" autoComplete="new-password" required large hint="Τουλάχιστον 10 χαρακτήρες." />
          <TextField name="confirm" label="Επιβεβαίωση κωδικού" type="password" autoComplete="new-password" required large />
        </AuthForm>
      ) : (
        <div className="space-y-4 text-sm">
          <p>Ο σύνδεσμος δεν είναι έγκυρος ή έχει λήξει. Ζητήστε νέο σύνδεσμο από τη σελίδα σύνδεσης.</p>
          <Button asChild className="h-11 w-full">
            <Link href="/forgot-password">Νέος σύνδεσμος</Link>
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
