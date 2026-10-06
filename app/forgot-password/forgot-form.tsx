"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function ForgotForm() {
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (sent) {
    return (
      <div className="space-y-4 text-sm">
        <div className="flex items-start gap-3">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
          <p>
            Αν υπάρχει λογαριασμός με το <strong>{sent}</strong>, σας στείλαμε email με σύνδεσμο για νέο κωδικό. Ο σύνδεσμος ισχύει 1 ώρα — ελέγξτε
            και τα ανεπιθύμητα.
          </p>
        </div>
        <Button asChild variant="outline" className="h-11 w-full">
          <Link href="/login">Επιστροφή στη σύνδεση</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      action={(fd) => {
        setError(null);
        const email = String(fd.get("email") ?? "").trim();
        start(async () => {
          const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
          // Same answer whether the account exists or not (no account enumeration).
          if (error && error.status !== 404) setError(error.message ?? "Το αίτημα απέτυχε, δοκιμάστε ξανά.");
          else setSent(email);
        });
      }}
    >
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required className="h-11" />
      </div>
      <Button type="submit" className="h-11 w-full" disabled={pending}>
        {pending ? "Αποστολή…" : "Αποστολή συνδέσμου"}
      </Button>
      <div className="text-center text-sm">
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          Επιστροφή στη σύνδεση
        </Link>
      </div>
    </form>
  );
}
