"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { ErrorsProvider } from "@/components/dg/form-errors";
import { Button } from "@/components/ui/button";
import { INITIAL_FORM_STATE, type FormState } from "@/lib/forms";
import { keepValues } from "@/components/dg/keep-values";

// Auth pages post to Server Actions (lib/auth-actions.ts); this only shows pending state,
// the server's messages and — when the action succeeds without redirecting — a success panel.
export function AuthForm({
  action,
  submitLabel,
  pendingLabel,
  success,
  children,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  submitLabel: string;
  pendingLabel?: string;
  success?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_FORM_STATE);
  if (state.ok && success) return <>{success}</>;
  return (
    <ErrorsProvider errors={state.errors}>
      <form action={formAction} onSubmit={keepValues(formAction)} noValidate className="space-y-4">
        {state.message && !state.ok && (
          <p role="alert" className="rounded-sm border border-danger-500/30 bg-danger-50 px-3 py-2 text-sm text-danger-500">
            {state.message}
          </p>
        )}
        {children}
        <Button type="submit" className="h-11 w-full" disabled={pending}>
          {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {pending ? (pendingLabel ?? submitLabel) : submitLabel}
        </Button>
      </form>
    </ErrorsProvider>
  );
}
