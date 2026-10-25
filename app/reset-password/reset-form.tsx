"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-4"
      action={(fd) => {
        setError(null);
        const password = String(fd.get("password") ?? "");
        if (password.length < 10) return setError("Ο κωδικός θέλει τουλάχιστον 10 χαρακτήρες.");
        if (password !== String(fd.get("confirm") ?? "")) return setError("Οι δύο κωδικοί δεν ταιριάζουν.");
        start(async () => {
          const { error } = await authClient.resetPassword({ newPassword: password, token });
          if (error) {
            setError(error.code === "INVALID_TOKEN" ? "Ο σύνδεσμος έληξε — ζητήστε νέο." : (error.message ?? "Η αλλαγή απέτυχε."));
            return;
          }
          router.replace("/login?reset=1");
        });
      }}
    >
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="password">Νέος κωδικός</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required className="h-11" />
        <p className="text-xs text-muted-foreground">Τουλάχιστον 10 χαρακτήρες.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Επιβεβαίωση κωδικού</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required className="h-11" />
      </div>
      <Button type="submit" className="h-11 w-full" disabled={pending}>
        {pending ? "Αποθήκευση…" : "Αποθήκευση κωδικού"}
      </Button>
    </form>
  );
}
