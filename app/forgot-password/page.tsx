import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { TextField } from "@/components/dg/fields";
import { Button } from "@/components/ui/button";
import { forgotPasswordAction } from "@/lib/auth-actions";

export const metadata: Metadata = { title: "Ξεχάσατε τον κωδικό" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Ξεχάσατε τον κωδικό;" description="Πληκτρολογήστε το email σας και θα σας στείλουμε σύνδεσμο για νέο κωδικό.">
      <AuthForm
        action={forgotPasswordAction}
        submitLabel="Αποστολή συνδέσμου"
        pendingLabel="Αποστολή…"
        success={
          <div className="space-y-4 text-sm">
            <p className="flex items-start gap-3">
              <MailCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-success-500" />
              <span>Αν υπάρχει λογαριασμός με αυτό το email, σας στείλαμε σύνδεσμο για νέο κωδικό. Ισχύει 1 ώρα — ελέγξτε και τα ανεπιθύμητα.</span>
            </p>
            <Button asChild variant="outline" className="h-11 w-full">
              <Link href="/login">Επιστροφή στη σύνδεση</Link>
            </Button>
          </div>
        }
      >
        <TextField name="email" label="Email" type="email" autoComplete="email" required large />
      </AuthForm>
      <div className="mt-4 text-center text-sm">
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          Επιστροφή στη σύνδεση
        </Link>
      </div>
    </AuthShell>
  );
}
