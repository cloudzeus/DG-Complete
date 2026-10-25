"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmUnsubscribe } from "./actions";

export function UnsubscribeButton({ email, token }: { email: string; token: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="size-4" /> Έγινε — δεν θα λαμβάνετε άλλες υπενθυμίσεις.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <Button
        className="h-11 w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await confirmUnsubscribe(email, token);
            if (r.ok) setDone(true);
            else setError(true);
          })
        }
      >
        {pending ? "Παρακαλώ περιμένετε…" : "Διαγραφή από τις υπενθυμίσεις"}
      </Button>
      {error && <p role="alert" className="text-xs text-destructive">Ο σύνδεσμος δεν είναι έγκυρος.</p>}
    </div>
  );
}
