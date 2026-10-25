"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  action: Action;
  submitLabel?: string;
  destructive?: boolean;
  size?: "sm" | "md" | "lg";
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setRound((r) => r + 1); // fresh form state on every open
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
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
          onDone={() => setOpen(false)}
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

  useEffect(() => {
    if (state === INITIAL_FORM_STATE) return;
    if (state.ok && !state.reveal) {
      toast.success(state.message ?? "Αποθηκεύτηκε.");
      onDone();
    } else if (!state.ok && state.message && !state.errors) toast.error(state.message);
  }, [state, onDone]);

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
        {state.errors && state.message && (
          <p role="alert" className="mx-5 mb-2 rounded-sm bg-danger-50 px-3 py-2 text-xs font-medium text-danger-500 sm:mx-6">
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
