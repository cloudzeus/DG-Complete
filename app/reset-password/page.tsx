import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Νέος κωδικός" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token, error, welcome } = await searchParams;
  const valid = typeof token === "string" && token.length > 10 && !error;
  return (
    <AuthShell
      title={welcome ? "Ορίστε τον κωδικό σας" : "Νέος κωδικός"}
      description={welcome ? "Καλώς ήρθατε στο DGsmart BI. Διαλέξτε κωδικό για τον λογαριασμό σας." : "Διαλέξτε νέο κωδικό για τον λογαριασμό σας."}
    >
      {valid ? (
        <ResetForm token={token} />
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
