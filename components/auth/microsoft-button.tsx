"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { INITIAL_FORM_STATE, type FormState } from "@/lib/forms";

function MicrosoftMark() {
  return (
    <svg aria-hidden viewBox="0 0 21 21" className="size-4">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export function MicrosoftButton({ action }: { action: () => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, INITIAL_FORM_STATE);
  return (
    <form action={formAction} className="space-y-2">
      <Button type="submit" variant="outline" className="h-11 w-full gap-2" disabled={pending}>
        <MicrosoftMark />
        Σύνδεση με Microsoft
      </Button>
      {state.message && (
        <p role="status" className="text-center text-xs text-muted-foreground">
          {state.message}
        </p>
      )}
    </form>
  );
}
