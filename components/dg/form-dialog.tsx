"use client";

import { useActionState, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { INITIAL_FORM_STATE, type FormState } from "@/lib/forms";
import { keepValues } from "@/components/dg/keep-values";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";
import { ErrorsProvider } from "./form-errors";

export { FieldError } from "./form-errors";

// Every form opens in a modal (ADR-023). This is the only client part: open state, pending state and
// field errors returned by the Server Action. The fields themselves are server-rendered children.

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

export function FormDialog({
  trigger,
  title,
  description,
  action,
  submitLabel = "Αποθήκευση",
  destructive = false,
  size = "md",
  children,
  open: openProp,
  onOpenChange,
}: {
  /** Omit when the dialog is opened from elsewhere (e.g. a row's actions menu) via `open`. */
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string;
  action: Action;
  submitLabel?: string;
  destructive?: boolean;
  size?: "sm" | "md" | "lg";
  children?: React.ReactNode;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const [round, setRound] = useState(0);
  const open = openProp ?? ownOpen;
  const [seen, setSeen] = useState(open);
  if (open !== seen) {
    setSeen(open);
    if (open) setRound((r) => r + 1); // fresh form state on every open
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOwnOpen(o);
        onOpenChange?.(o);
      }}
    >
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        className={cn(
          "max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl p-0 sm:max-w-lg",
          size === "sm" && "sm:max-w-md",
          size === "lg" && "sm:max-w-2xl",
        )}
      >
        <FormBody
          key={round}
          title={title}
          description={description}
          action={action}
          submitLabel={submitLabel}
          destructive={destructive}
          onDone={() => (setOwnOpen(false), onOpenChange?.(false))}
        >
          {children}
        </FormBody>
      </DialogContent>
    </Dialog>
  );
}

function FormBody({
  title,
  description,
  action,
  submitLabel,
  destructive,
  onDone,
  children,
}: {
  title: string;
  description?: string;
  action: Action;
  submitLabel: string;
  destructive: boolean;
  onDone: () => void;
  children?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_FORM_STATE);

  // Result in the same modal (no toasts): success → information panel with «Εντάξει»; a failure
  // stays in the form above the buttons so the user can correct and retry.
  if (state !== INITIAL_FORM_STATE && state.ok && !state.reveal) {
    return (
      <div className="space-y-4 p-5 sm:p-6" role="status">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 aria-hidden className="size-5 text-success-500" /> {title}
          </DialogTitle>
          <DialogDescription>{state.message ?? "Η ενέργεια ολοκληρώθηκε."}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" autoFocus onClick={onDone}>
            Εντάξει
          </Button>
        </DialogFooter>
      </div>
    );
  }

  if (state.ok && state.reveal) {
    return (
      <div className="space-y-4 p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{state.message}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 rounded-lg border border-warning-500/30 bg-warning-50 p-3">
          <p className="text-xs font-semibold">{state.reveal.label}</p>
          <code className="block font-mono text-sm break-all">{state.reveal.value}</code>
          {state.reveal.note && <p className="text-xs text-muted-foreground">{state.reveal.note}</p>}
          <CopyButton value={state.reveal.value} />
        </div>
        <DialogFooter>
          <Button type="button" onClick={onDone}>
            Τέλος
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <ErrorsProvider errors={state.errors}>
      <form action={formAction} onSubmit={keepValues(formAction)} noValidate className="flex flex-col">
        <DialogHeader className="border-b border-border/60 p-5 sm:p-6">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children && <div className="space-y-4 p-5 sm:p-6">{children}</div>}
        {!state.ok && state.message && (
          <p role="alert" className="mx-5 mb-2 flex items-start gap-2 rounded-sm bg-danger-50 px-3 py-2 text-sm font-medium text-danger-500 sm:mx-6">
            <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
            {state.message}
          </p>
        )}
        <DialogFooter className="gap-2 border-t border-border/60 bg-muted/30 p-4 sm:px-6">
          <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
            Άκυρο
          </Button>
          <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending}>
            {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </ErrorsProvider>
  );
}
