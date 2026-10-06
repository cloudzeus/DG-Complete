import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { verifyUnsubscribeToken } from "@/lib/email-tracking";
import { UnsubscribeButton } from "./unsubscribe-button";

export const metadata: Metadata = { title: "Διαγραφή από τις υπενθυμίσεις", robots: { index: false } };

export default async function UnsubscribePage({ searchParams }: PageProps<"/unsubscribe">) {
  const sp = await searchParams;
  const email = typeof sp.e === "string" ? sp.e : "";
  const token = typeof sp.t === "string" ? sp.t : "";
  const valid = !!email && !!token && verifyUnsubscribeToken(email, token);

  return (
    <AuthShell
      title="Υπενθυμίσεις email"
      description={valid ? `Δεν θα στέλνουμε πλέον υπενθυμίσεις ανανέωσης και πληρωμής στο ${email}.` : "Ο σύνδεσμος δεν είναι έγκυρος."}
    >
      {valid ? (
        <div className="space-y-4">
          <UnsubscribeButton email={email} token={token} />
          <p className="text-xs text-muted-foreground">
            Τα email του λογαριασμού σας (π.χ. νέος κωδικός) και τα αποδεικτικά πληρωμής θα συνεχίσουν να αποστέλλονται.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Χρησιμοποιήστε τον σύνδεσμο από το τελευταίο email που λάβατε.</p>
      )}
    </AuthShell>
  );
}
