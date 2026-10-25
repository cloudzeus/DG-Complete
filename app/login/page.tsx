import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { MicrosoftButton } from "@/components/auth/microsoft-button";
import { TextField } from "@/components/dg/fields";
import { microsoftSignInAction, signInAction } from "@/lib/auth-actions";
import { getCurrentUser } from "@/lib/rbac";

export const metadata: Metadata = { title: "Σύνδεση" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { next, reset } = await searchParams;
  const nextPath = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  return (
    <AuthShell title="Σύνδεση" description={reset ? "Ο κωδικός σας άλλαξε — συνδεθείτε με τον νέο κωδικό." : "Συνδεθείτε με το email και τον κωδικό σας."}>
      <MicrosoftButton action={microsoftSignInAction.bind(null, nextPath)} />
      <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
        <span className="h-px flex-1 bg-border" /> ή <span className="h-px flex-1 bg-border" />
      </div>
      <AuthForm action={signInAction.bind(null, nextPath)} submitLabel="Σύνδεση" pendingLabel="Σύνδεση…">
        <TextField name="email" label="Email" type="email" autoComplete="email" required large />
        <TextField name="password" label="Κωδικός" type="password" autoComplete="current-password" required large />
      </AuthForm>
      <div className="mt-4 text-center text-sm">
        <Link href="/forgot-password" className="text-primary underline-offset-4 hover:underline">
          Ξεχάσατε τον κωδικό;
        </Link>
      </div>
    </AuthShell>
  );
}
