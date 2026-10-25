import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Ξεχάσατε τον κωδικό;" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Ξεχάσατε τον κωδικό;" description="Δώστε το email σας και θα σας στείλουμε σύνδεσμο για νέο κωδικό.">
      <ForgotForm />
    </AuthShell>
  );
}
