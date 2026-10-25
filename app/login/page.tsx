import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { getCurrentUser } from "@/lib/rbac";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Σύνδεση" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { next, reset } = await searchParams;
  const nextPath = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  return (
    <AuthShell title="Σύνδεση" description={reset ? "Ο κωδικός σας άλλαξε — συνδεθείτε με τον νέο κωδικό." : "Συνδεθείτε με το email και τον κωδικό σας."}>
      <LoginForm nextPath={nextPath} />
      <div className="mt-4 text-center text-sm">
        <Link href="/forgot-password" className="text-primary underline-offset-4 hover:underline">
          Ξεχάσατε τον κωδικό;
        </Link>
      </div>
    </AuthShell>
  );
}
